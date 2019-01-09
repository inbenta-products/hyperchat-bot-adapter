'use strict';

import {
    isUndefined,
    omit,
    isEmpty,
    isFunction,
    isString,
    assign
} from 'lodash';
import Cookies from 'js-cookie';
import EventEmitter from 'wolfy87-eventemitter';

import Conf from './Conf';
import SDKLoader from './SDKLoader';
import AvailabilityChecker from './AvailabilityChecker';
import Helpers from './Helpers';
import localForage from './localforage';

/**
 * Maximum number of chatbot conversation that will be imported
 * @type {Number}
 */
const maxMessagesImport = 150;
/**
 * HyperChat cookie name
 * @type {String}
 */
const cookieName = 'i.cc';
/**
 * Message that HyperChat returns if the user already has an open chat
 * @type {String}
 */
const userHasChatMessage = 'User already has a chat';
/**
 * User text input ID
 * @type {String}
 */
const userTextInputId = 'inbenta-bot-input';
/**
 * System message option ticketData type
 * @type {String}
 */
const systemMessageTicketDataType = 'ticketData';
/**
 * System option ID for chat close
 * @type {String}
 */
const closeChatOption = 'exitConversation';

export default class HCAdapter extends EventEmitter {
    constructor (botInstance) {
        super();
        if (!this._checkIsBotInstance(botInstance)) {
            throw new Error('Not a valid bot instance');
        }

        this.bot = botInstance;
        this.storage = localForage;

        // bot SDK only accepts event subscriptions during "build" time
        // subscribe to all events needed and control executions depending on chatOpen flag
        this.subscribeToBotEvents();

        this.subscribeToWindowEvents();

        // check if there was a survey pending and show it
        this.storage.getItem('survey')
            .then(data => {
                if (data && data.pending && data.survey) {
                    this.bot.actions.showCustomConversationWindow(data.survey);
                }
            });

    }

    /**
     * Subscribe to needed Bot SDK events
     */
    subscribeToBotEvents () {
        if (!this.bot) {
            return false;
        }

        // subscribe to escalate event
        this.bot.subscriptions.onEscalateToAgent(this.start.bind(this));
        // subscribe to the event fired when the bot is built
        this.bot.subscriptions.onReady(this._onReady.bind(this));
        // subscribe to all messages the user sends
        this.bot.subscriptions.onSendMessage(this._onUserMessage.bind(this));
        // subscribe to the event fired when a download button is clicked
        this.bot.subscriptions.onDownloadMedia(this._onDownloadMedia.bind(this));
        // subscribe to the event fired when the user uploads a file
        this.bot.subscriptions.onUploadMedia(this._onUploadMedia.bind(this));
        // subscribe to the event fired when an option from a system message is selected
        this.bot.subscriptions.onSelectSystemMessageOption(this._onSelectSystemMessageOption.bind(this));
    }

    /**
     * Subscribe to window events
     */
    subscribeToWindowEvents () {
        window.addEventListener('message', this._onWindowMessage.bind(this), false);
    }

    /**
     * Check if a chat is already open by looking for the HyperChat cookie
     *
     * @return {Boolean}
     */
    isChatOpen () {
        return !isUndefined(Cookies.get(cookieName)) ? true : false;
    }

    setConnectingMode () {
        this.bot.actions.disableInput();
    }

    setConnectedMode () {
        this.bot.actions.enableInput();
    }

    /**
     * Load the SDK and initialize it when it's available
     *
     * @return {Promise}
     */
    init () {
        return SDKLoader.load();
    }

    /**
     * Start a new chat
     *
     * @return {Promise}
     */
    start (userData = {}) {
        if (!this.isChatOpen()) {
            // set chat in "connecting" mode
            this.setConnectingMode();

            return this.init()
                .then(() => {
                    return AvailabilityChecker.check();
                })
                .then(this.initUserSession.bind(this, userData))
                .then(this.createChat.bind(this))
                .then(this.getCurrentBotState.bind(this))
                .then(this.showAllButtons.bind(this))
                .then(this.searchAgent.bind(this))
                .then((res) => {
                    if (!res || !res.agent) {
                        this._onForeverAlone({});
                    } else {
                        this.showWaitingForAgent();
                    }
                    this.setConnectedMode();
                })
                .then(this.monitorUserActivity.bind(this))
                .catch((err) => {
                    this.setConnectedMode();
                    console.error('Error!', err);
                });
        }
    }

    /**
     * Get the actual bot state (position, buttons, side window...)
     */
    getCurrentBotState () {
        this.botState = {};

        try {
            const data = this.bot.actions.getSessionData();
            if (!isEmpty(data)) {
                // remove messages, we don't want them now
                delete data.messages;
                this.botState = data;
            }
        } catch (err) {
            // don't do anything, assume it hadn't a previous state
        }
    }

    /**
     * Restore the previous state of the bot (buttons, etc)
     */
    restorePreviousBotState () {
        if (!isEmpty(this.botState)) {
            if (this.botState.closeButtonVisible) {
                this.bot.actions.showCloseButton();
            } else {
                this.bot.actions.hideCloseButton();
            }
        }
    }

    /**
     * Show all buttons defined by configuration
     */
    showAllButtons () {
        if (Conf.get('fileUploadsActive') === true) {
            this.bot.actions.showUploadMediaButton();
        }
        if (Conf.get('showCloseButton') === true) {
            this.bot.actions.showCloseButton();
        }
    }

    /**
     * Hide all buttons defined by configuration
     */
    hideAllButtons () {
        if (Conf.get('fileUploadsActive') === true) {
            this.bot.actions.hideUploadMediaButton();
        }
        if (Conf.get('showCloseButton') === true) {
            this.bot.actions.hideCloseButton();
        }
    }

    /**
     * Restore an existing chat connection and history
     *
     * @return {Promise}
     */
    restore () {
        // set chat in "connecting" mode
        this.setConnectingMode();

        return this.init()
            .then(this.restoreChat.bind(this))
            .then(this.setConnectedMode.bind(this))
            .then(this.showAllButtons.bind(this))
            .then(this.monitorUserActivity.bind(this))
            .catch((err) => {
                console.log('Error!', err);
            });
    }

    /**
     * Init the user session, registering him/her if required
     *
     * @return {Promise}
     */
    initUserSession (data = {}) {
        const username = !isUndefined(data.LAST_NAME) ? [data.FIRST_NAME, data.LAST_NAME].join(' ') : data.FIRST_NAME;
        const userData = {
            name: username,
            contact: data.EMAIL_ADDRESS,
        };

        // set the rest of the data to the extraInfo
        const formExtraInfo = omit(data, ['FIRST_NAME', 'LAST_NAME', 'EMAIL_ADDRESS']);
        if (!isEmpty(formExtraInfo)) {
            let extraInfo = formExtraInfo;
            // call the extraInfo function if defined in the conf to get all the wanted data
            const getExtraInfo = Conf.get('extraInfo');
            if (getExtraInfo && isFunction(getExtraInfo)) {
                extraInfo = assign(extraInfo, getExtraInfo());
            }
            userData.extraInfo = extraInfo;
        }

        return ICF.Api.request('/users', 'POST', userData)
            .then((res) => ICF.Lobby.init({
                id: res.data.user.id,
                token: res.data.session.token,
            }));
    }

    /**
     * Create a new chat
     *
     * @return {Promise}
     */
    createChat () {
        return this.getChatData()
            .then((chatData) => ICF.Chat.init(chatData))
            .catch((data) => {
                if (data.error && data.error.message === userHasChatMessage) {
                    const lobbyChatIds = Object.keys(ICF.Lobby.getUserChats());
                    // if Lobby already has the chat, init it
                    if (lobbyChatIds.length) {
                        return ICF.Chat.init({ id: lobbyChatIds.shift() });
                    } else {
                        return ICF.Events.send('users:chats', { userId: ICF.Connection.me().id })
                            .then((data) => {
                                if (data.chats) {
                                    const userChatIds = Object.keys(data.chats);
                                    if (userChatIds.length) {
                                        return ICF.Chat.init({ id: userChatIds.shift() });
                                    }
                                }
                            });
                    }
                }
            })
            .then((chat) => {
                if (chat) {
                    this.chat = chat;
                    this._initChatListeners();

                    this.trigger('chat:created', [{ chat }]);
                }
                return null;
            });
    }

    /**
     * Restore the user's ongoing chat
     *
     * @return {Promise}
     */
    restoreChat () {
        const chats = ICF.Lobby.getUserChats();

        if (!isEmpty(chats)) {
            // users only can have one single chat active, get the chat
            const chatId = Object.keys(chats).shift();
            const chat = ICF.Lobby.chats[chatId];

            if (!chat.closed) {
                this.chat = chat;
                this._initChatListeners();
                // read any messages that we may have missed
                const newMessages = this._readMissedMessages();
                newMessages.forEach(this._displayMessage.bind(this));
            }
        }
    }

    /**
     * Search a free agent to attend the chat
     *
     * @return {Promise}
     */
    searchAgent () {
        if (!isEmpty(this.chat)) {
            return this.chat.searchAgent();
        } else {
            return Promise.reject();
        }
    }

    /**
     * Display the configured message while searching for an agent
     */
    showWaitingForAgent () {
        this._displayMessage({
            type: 'system',
            translate: true,
            message: 'wait-for-agent'
        });
    }

    /**
     * Display the configured message when there are no agents available
     */
    showNoAgents () {
        this._displayMessage({
            type: 'system',
            translate: true,
            message: 'no-agents'
        });
    }

    /**
     * Get all the data to open a chat, like room, lang or bot history
     *
     * @return {object} Chat data
     */
    getChatData () {
        const data = {};

        const getRoom = Conf.get('room');
        const getLang = Conf.get('lang');
        const getSource = Conf.get('source');

        if (!isFunction(getRoom)) {
            throw new Error('Room configuration must be a callable function');
        }

        if (!isFunction(getLang)) {
            throw new Error('Language configuration must be a callable function');
        }

        if (!isFunction(getSource)) {
            throw new Error('Source configuration must be a callable function');
        }

        // get the data from the functions defined on the configuration
        data.room = getRoom();
        data.lang = getLang();
        data.source = getSource();

        const p = (Conf.get('importBotHistory') === true) ? this._getBotConversation() : Promise.resolve(false);
        return p
            .then((history) => {
                if (history) {
                    data.history = history;
                }
                return data;
            });
    }

    /**
     * Monitor the user text input activity
     *
     * @param  {object} input HTML object of the chat text input
     */
    monitorUserActivity () {
        // get the input by its ID
        const input = document.getElementById(userTextInputId);
        // if the sdk is available, put the watcher in it
        if (window.ICF && input) {
            const intervalTime = 200;
            const noChangeMax = 10;
            ICF.Helper.monitorUserActivity(input, this.chat, intervalTime, noChangeMax);
        }
    }

    /**
     * Clear chat, lobby and messages
     */
    clear () {
        // If the download transcript button is shown, save the token to make the history request even when refreshing
        const transcript = Conf.get('transcript');
        if (transcript && transcript.download) {
            const token = ICF.Connection.getToken();
            if (token) {
                this.storage.setItem('previousToken', token);
            }
        }

        this.clearChat();
        this.clearLobby();
    }

    /*
     * Close a chat
     *
     * @return {Promise}
     */
    closeChat () {
        const chatId = this.chat.id;

        if (Object.keys(ICF.Lobby.chats).indexOf(chatId) !== -1) {
            return ICF.Lobby.chats[chatId].close();
        }
        return Promise.reject();
    }

    /**
     * Remove the chat object
     */
    clearChat () {
        this.chat = {};
        this.hideAllButtons();
        this.restorePreviousBotState();
    }

    /**
     * Clear the user lobby
     */
    clearLobby () {
        ICF.Lobby.close();
        ICF.Lobby.chats = {};
    }

    /**
     * Listen to all the required chat events and attach callbacks
     *
     * @param  {object:ICF.Chat} chat
     */
    _initChatListeners () {
        if (!isEmpty(this.chat)) {

            this.chat
                .on('user:joined', this._onUserJoin.bind(this))
                .on('user:left', this._onUserLeave.bind(this))
                .on('user:activity', this._onUserActivity.bind(this))
                .on('message:received', this._onMessageReceived.bind(this))
                .on('message:read', this._onMessageRead.bind(this))
                .on('chat:closed', this._onChatClosed.bind(this))
                .on('chat:intervened', this._onChatIntervened.bind(this))
                .on('forever:alone', this._onForeverAlone.bind(this));

            ICF.Lobby.addEventListener('system:info', this._onSystemInfo.bind(this));
        }
    }

    /**
     * Mark as read all the messages that were sent during the chat reload
     *
     * @return {array} Messages that were marked as read
     */
    _readMissedMessages () {
        if (ICF.Lobby.logged) {
            const newMessages = [];
            const unreadMessages = this.chat.readAnyUnreadMessageFromHistory();
            Object.keys(unreadMessages).forEach((msgId) => {
                const msg = unreadMessages[msgId];
                const newMsg = {
                    type: 'answer',
                    user: msg.sender,
                    message: msg.message,
                };
                newMessages.push(newMsg);
            });
            return newMessages;
        }
    }

    /**
     * Clear and show the chat closed message right after
     */
    _clearAndShowChatClosedMessage () {
        this.clear();

        // display close message
        this._displayMessage({
            type: 'system',
            translate: true,
            message: 'chat-closed',
        });
    }

    /**
     * Callback executed when the bot is built
     */
    _onReady () {
        if (this.isChatOpen()) {
            this.restore();
        }
    }

    /**
     * Callback executed every time a user joins to the chat
     *
     * @param  {object} data
     */
    _onUserJoin (data) {
        this.trigger('user:joined', [data]);

        const agentName = data.user.nickname ? data.user.nickname : data.user.name;
        // set the name of the agent in the chat
        this.bot.actions.setChatbotName({
            source: 'name',
            name: agentName,
        });

        this._displayMessage({
            type: 'system',
            translate: true,
            message: 'agent-joined',
            replacements: { agentName },
        });
    }

    /**
     * Callback executed every time a user leaves the chat
     * @param {object} data
     */
    _onUserLeave (data) {
        this.trigger('user:left', [data]);

        const agentName = data.user.nickname ? data.user.nickname : data.user.name;

        this._displayMessage({
            type: 'system',
            translate: true,
            message: 'agent-left',
            replacements: { agentName },
        });
    }

    /**
     * Callback executed every time a user writes or stops writing
     *
     * @param  {object} data
     */
    _onUserActivity (data) {
        if (!isEmpty(data)) {
            // get the information of the user who's writing
            const user = this.chat.users.filter((user) => user.id === data.userId).pop();

            if (data.type === 'writing') {
                this.bot.actions.displayChatbotActivity({
                    type: 'writing',
                    name: user.nickname ? user.nickname : user.name,
                    userId: user.id,
                });
            } else if (data.type === 'not-writing' || data.type === 'stop-writing') {
                this.bot.actions.hideChatbotActivity({
                    type: 'not-writing',
                    name: user.nickname ? user.nickname : user.name,
                    userId: user.id,
                });
            }
        }
    }

    /**
     * Callback executed every time a message is received
     *
     * @param  {object} data
     */
    _onMessageReceived (data) {
        const message = data.message;
        const sender = !isUndefined(message.sender.id) ? message.sender.id : message.sender;

        const messageData = {
            user: sender,
            type: 'answer',
            custom: {
                hyperchatSenderId: sender
            }
        };

        // if the message comes from another tab where the same user is connected to
        if (ICF.Connection.me().id === sender) {
            messageData.type = 'user';
            messageData.message = message.message;
            // get the message ID to update the external ID
            const messageId = this._displayMessage(messageData);
            this._setMessageExternalId({ id: messageId }, message.id);
            return;
        }

        if (message.type === 'media') {
            messageData.media = message.message;
            messageData.message = 'void';
        } else {
            messageData.message = message.message;
        }

        if (isString(sender)) {
            this._displayMessage(messageData);
        }
    }

    /**
     * Callback executed every time a message is read by another user
     *
     * @param  {object} data
     */
    _onMessageRead (data) {
        if (!isEmpty(data) && !isEmpty(data.message) && data.message.sender === ICF.Connection.me().id) {
            this._setMessageDoubleCheck(data.message.id);
        }
    }

    /**
     * Callback executed when the chat is closed
     *
     * @param  {object} data
     * @param  {boolean} clear
     */
    _onChatClosed (data) {
        this.storage.setItem('lastClosedTime', Helpers.getUnixTime());

        this.trigger('chat:closed', [data]);

        // restore bot name
        this.bot.actions.setChatbotName({ source: 'default' });

        this.bot.actions.hideChatbotActivity();

        // Clear if it hasn't been cleared externally in 5s (in onSystemInfo)
        setTimeout(() => {
            if (ICF.Lobby.logged) {
                this._clearAndShowChatClosedMessage();
                this.storage.setItem('lastClosedTime', Helpers.getUnixTime());
            }
        }, 5000);
    }


    /**
     * Callback executed when a system info event is received
     *
     * @param  {object} data
     */
    _onSystemInfo (data) {
        // system info comes from a chat to ticket response
        if (data.data && data.data.ticketId) {
            this.trigger('ticket:created', [data.data]);
            data.type = systemMessageTicketDataType;
        }

        // Although it will delete the original "chat closed" message, it will show another one after the clear
        this._clearAndShowChatClosedMessage();

        const transcript = Conf.get('transcript');
        const hasTranscript = transcript && transcript.download;
        if (hasTranscript) {
            this._displayMessage({
                type: 'system',
                translate: true,
                message: data.data.ticketId,
                options: [{ value: data, label: 'download' }]
            });
        }

        this.storage.setItem('lastClosedTime', Helpers.getUnixTime());

        const surveys = Conf.get('surveys');
        if (surveys) {
            this._showSurvey(data.data.ticketId);
        }
    }

    /**
     * Callback executed every time the chat is intervened by another agent
     *
     * @param  {object} data
     */
    _onChatIntervened (data) {
        for (let user of data.intervenedUsers) {
            this._onUserLeave({ user: user });
        }
        this._onUserJoin({ user: data.interventor });
    }

    /**
     * Callback executed when there's no more agents to assign
     *
     * @param  {object} data
     */
    _onForeverAlone (data) {
        this.showNoAgents();
        if (this.chat && this.chat.close) {
            this.chat.close();
        }
        // If a forever:alone is received, the user is closing the chat
        const onChatClosedData = { chatId: this.chat.id, userId: ICF.Connection.me().id };
        this._onChatClosed(onChatClosedData);
    }

    /**
     * Callback that's executed when the user sends a message
     *
     * @param  {object}   message
     * @param  {Function} next
     */
    _onUserMessage (message, next) {
        // if there's no open chat and we're not collecting user's data, call next
        if (!this.isChatOpen()) {
            return next(message);
        }

        // send messages to chat if there's one open
        if (this.isChatOpen()) {
            return this._sendMessage(message);
        }
    }

    /**
     * Callback that's executed when the user clicks on a download media button
     *
     * @param {object} media
     */
    _onDownloadMedia (media, next) {
        if (isUndefined(window.ICF)) {
            window.open(media.url);
        }

        if (media.messageExternalId !== '' && !isUndefined(media.messageExternalId)) {
            // build the url
            media.file.url = '/media/' + media.messageExternalId;
        }

        ICF.Helper.downloadMedia(media.file);
    }

    /**
     * Callback that's executed when the user uploads a file
     *
     * @param {object} media
     */
    _onUploadMedia (media, next) {
        if (isUndefined(window.ICF)) {
            return;
        }
        this._setMessagePending(media.messageId);

        const file = media.file;
        return this.chat.sendMedia(file, (progress) => {
            // TODO: set uploading progress
        })
            .then((data) => {
                // set upload to finished and set external ID
                this._setMessageCheck(media.messageId);
                this._setMessageExternalId({ id: media.messageId }, data.media.id);
            })
            .catch(e => {
                this._setMessageError(media.messageId);
                if (e.code === 403 && e.message === 'File type is not allowed') {
                    return this._displayMessage({
                        type: 'system',
                        translate: true,
                        message: 'file-extension-not-allowed'
                    });
                }
            });
    }

    /**
     * Callback that's executed when the user selects an option from a system message
     *
     * @param  {object}   optionData
     * @param  {Function} next
     */
    _onSelectSystemMessageOption (optionData, next) {
        const props = Conf.get('transcript');
        // if the download transcript function is active and the option is clicked
        if (props && (optionData.option.value.type === systemMessageTicketDataType)) {

            props.ticketId = optionData.option.value.data.ticketId;

            this._getPreviousToken()
                .then(previousToken => {
                    const requestData = {};
                    if (previousToken) {
                        requestData.token = previousToken;
                    }
                    ICF.Helper.downloadConversation(optionData.option.value.chatId, props, requestData);
                });

        } else if (this.isChatOpen() && optionData.id === closeChatOption && optionData.option.value === 'yes') {
            // if the user is closing the chat
            const onChatClosedData = { chatId: this.chat.id, userId: ICF.Connection.me().id };
            this.closeChat().then(this._onChatClosed.bind(this, onChatClosedData));
        } else {
            return next(optionData);
        }
    }

    /**
     * Update a message by its external ID
     *
     * @param  {string} externalId
     * @param  {string} action
     */
    _updateMessageByExternalId (externalId, action) {
        this.bot.actions.updateMessage({
            action: action,
            externalId: externalId,
        });
    }

    /**
     * Set a message's external ID
     *
     * @param {object} where      Where condition (by ID or external ID)
     * @param {string} externalId
     */
    _setMessageExternalId (where, externalId) {
        const updateData = {
            action: 'UPDATE_EXTERNAL',
        };

        // set the new external ID finding the message by ID or external ID
        if (!isUndefined(where.id)) {
            updateData.id = where.id;
        } else if (!isUndefined(where.externalId)) {
            updateData.externalId = where.externalId;
        } else {
            return;
        }

        updateData.newExternalId = externalId;

        this.bot.actions.updateMessage(updateData);
    }

    /**
     * Send a message to the chat as the current user
     *
     * @param  {object} message
     */
    _sendMessage (message) {
        if (isEmpty(this.chat)) {
            throw new Error('No open chat');
        }

        if (isUndefined(message.id)) {
            // if no ID is received from bot, the message cannot be processed by us
            return;
        }

        const onMessageCreateCallback = (eventId, messageText, sender) => {
            // set "pending to be sent" icon
            this._setMessagePending(message.id);
            // set the event ID as the external ID
            this._setMessageExternalId({ id: message.id }, eventId);
        };

        this.chat.sendMessage(message.message, onMessageCreateCallback.bind(this))
            .then((data) => {
                // set the generated message ID as final external ID
                this._setMessageExternalId({ externalId: data.eventId }, data.message.id);
                // show single check mark
                this._setMessageCheck(message.id);
            })
            .catch((err) => {
                // display error and suggest retry
                this._setMessageError(message.id);
            });
    }

    /**
     * Set the "pending to be sent" icon to the given message
     *
     * @param {string} botMessageId
     */
    _setMessagePending (botMessageId) {
        this._setMessageStatus(botMessageId, 'WAITING_TICK');
    }

    /**
     * Set the "error when sending" icon to the given message
     *
     * @param {string} botMessageId
     */
    _setMessageError (botMessageId) {
        this._setMessageStatus(botMessageId, 'ERROR_TICK');
    }

    /**
     * Set a simple CHECK mark to the given message
     *
     * @param {string} botMessageId
     */
    _setMessageCheck (botMessageId) {
        this._setMessageStatus(botMessageId, 'SINGLE_TICK');
    }

    /**
     * Set a double CHECK mark to the given message
     *
     * @param {string} botMessageId
     */
    _setMessageDoubleCheck (chatMessageId) {
        this._updateMessageByExternalId(chatMessageId, 'DOUBLE_TICK');
    }

    /**
     * Set the provided status to the given message
     *
     * @param  {object} botMessageId
     */
    _setMessageStatus (botMessageId, action) {
        this.bot.actions.updateMessage({
            id: botMessageId,
            action: action,
        });
    }

    /**
     * Display a message in the chat box
     *
     * @param {object} message
     */
    _displayMessage (message) {
        const messageType = message.type;
        if (messageType === 'system') {
            return this.bot.actions.displaySystemMessage(message);
        } else if (messageType === 'answer' || messageType === 'media') {
            this._updateChatbotNameFromMessageInfo(message);
            return this.bot.actions.displayChatbotMessage(message);
        } else if (messageType === 'user') {
            return this.bot.actions.displayUserMessage(message);
        }
    }

    _updateChatbotNameFromMessageInfo (message) {
        if (this.chat && this.chat.id && ICF.Lobby.chats[this.chat.id] && ICF.Lobby.chats[this.chat.id]) {
            const senderUser = ICF.Lobby.chats[this.chat.id].users.find(user => {
                return (user.id === message.user);
            });

            if (senderUser) {
                this.bot.actions.setChatbotName({
                    source: 'name',
                    name: senderUser.nickname || senderUser.name
                });
            }
        }
    }

    _showSurvey (ticketId) {
        const surveys = Conf.get('surveys');


        const Purl = surveys.url ? Promise.resolve(surveys.url) : this._getHyperChatSurvey(surveys.id, ticketId);
        Purl
            .then(url => {
                const survey = {
                    content: '<iframe name="inbenta-survey" src=' + url + '></iframe>'
                };
                this.storage.setItem('survey', { pending: true, survey });
                this.bot.actions.showCustomConversationWindow(survey);
            });
    }

    _onWindowMessage (event) {
        if (event.data.message == 'inbenta.survey.successful_answer') {
            this.storage.setItem('survey', { pending: false });
            const transcript = Conf.get('transcript');
            const hasTranscript = transcript && transcript.download;

            this.bot.actions.hideCustomConversationWindow();
            if (!hasTranscript) {
                this.bot.actions.hideConversationWindow();
            }
        }
    }

    _getHyperChatSurvey (id, ticketId) {
        return ICF.Api.request('/surveys/' + id, 'GET', { sourceType: 'ticket', sourceId: ticketId })
            .then(res => res.data.survey.url);
    }

    /**
     * Get the previous bot conversation if required
     *
     * @return {mixed} Array of parsed messages or false
     */
    _getBotConversation () {
        const conversation = this.bot.actions.getConversationTranscript({
            maxInteractions: maxMessagesImport
        });
        if (isEmpty(conversation)) {
            return Promise.resolve(false);
        }
        return this.storage.getItem('lastClosedTime')
            .then((lastClosedTime) => {
                return this._parseBotHistory(conversation, lastClosedTime);
            });
    }

    _getPreviousToken () {
        let p = Promise.resolve();
        if (!ICF.Connection.getToken()) {
            p = this.storage.getItem('previousToken')
                .then(previousToken => {
                    return previousToken;
                });
        }
        return p;
    }

    /**
     * Parse the bot history and convert messages to the chat format
     * @param  {array} messages
     * @return {array}
     */
    _parseBotHistory (messages, filterTime = null) {
        if (filterTime) {
            messages = messages.filter(botMessage => {
                return botMessage.datetime > filterTime;
            });
        }

        return messages.map((botMessage) => {
            let parsedMsg = {};
            // set default parsedMsg properties
            parsedMsg.created = botMessage.datetime;
            parsedMsg.type = 'text';
            parsedMsg.message = botMessage.message;

            // convert message depending on message type
            switch (botMessage.type) {
            case 'polarQuestion':
            case 'multipleChoiceQuestion':
                parsedMsg.type = 'object';
                parsedMsg.message = JSON.stringify({
                    message: botMessage.message,
                    options: botMessage.options,
                });
                break;
            case 'extendedContentsAnswer':
                parsedMsg.type = 'object';
                parsedMsg.message = JSON.stringify({
                    message: botMessage.message,
                    options: botMessage.subAnswers.map(subAnswer => {
                        return { label: subAnswer.message };
                    }),
                });
                break;
            case 'download':
                parsedMsg.message = botMessage.message.name || botMessage.message.url;
                break;
            case 'system':
                parsedMsg.sender = 'assistant';
                break;
            default:
                break;
            }

            if (isUndefined(parsedMsg.sender)) {
                if (botMessage.custom && botMessage.custom.hyperchatSenderId) {
                    parsedMsg.sender = botMessage.custom.hyperchatSenderId;
                } else if (botMessage.user === 'guest') {
                    parsedMsg.sender = ICF.Connection.me().id;
                } else {
                    parsedMsg.sender = botMessage.user;
                }
            }

            return parsedMsg;
        });
    }

    /**
     * Check if the provided parameter is a bot instance object
     * @param  {object} botInstance
     * @return {boolean}
     */
    _checkIsBotInstance (botInstance) {
        // it's a bot instance if it contains the properties we need (duck typing)
        if (botInstance.subscriptions &&
            (botInstance.subscriptions.onReady && isFunction(botInstance.subscriptions.onReady)) &&
            (botInstance.subscriptions.onSendMessage && isFunction(botInstance.subscriptions.onSendMessage)) &&
            (botInstance.subscriptions.onDownloadMedia && isFunction(botInstance.subscriptions.onDownloadMedia)) &&
            (botInstance.subscriptions.onUploadMedia && isFunction(botInstance.subscriptions.onUploadMedia)) &&
            (botInstance.subscriptions.onEscalateToAgent && isFunction(botInstance.subscriptions.onEscalateToAgent))
        ) {
            return true;
        }
        return false;
    }
}
