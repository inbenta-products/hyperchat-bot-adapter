'use strict';

import { isEmpty, isFunction } from 'lodash';

import Conf from './Conf';
import SDKLoader from './SDKLoader';

/**
 * Class that contains a main "check" method to test out whether there are available agents or not
 */
class AvailabilityChecker {
    /**
     * Check if all the escalation conditions are met to open a chat
     *     i.e. there are available agents, is working hours
     *
     * @return {Promise}
     */
    check () {
        const response = {
            agentsAvailable: false,
        };

        return this._checkWorkingTime()
            .then(() => {
                return SDKLoader.load();
            })
            .then(this._areAvailableAgents.bind(this))
            .then(() => {
                response.agentsAvailable = true;
                return response;
            })
            .catch((err) => {
                response.agentsAvailable = false;
                response.reason = 'no-agents';
                return response;
            });
    }

    /**
     * Check whether it's working time or not
     * @return {Promise}
     */
    _checkWorkingTime () {
        return Promise.resolve();
    }

    /**
     * Check if there are available agents in the given room(s)
     *
     * @return {Promise}
     */
    _areAvailableAgents () {
        const getRoom = Conf.get('room');
        const getLanguage = Conf.get('lang');

        if (!isFunction(getRoom) || !isFunction(getLanguage)) {
            throw new Error('Room and language configurations must be callable functions');
        }

        const roomId = getRoom();
        const lang = getLanguage();

        const params = { roomIds: roomId };
        // set lang if specified
        if (lang) {
            params.langs = lang;
        }

        return ICF.Api.request('/agents/available', 'GET', params)
            .then((res) => {
                if (!isEmpty(res.data) && !isEmpty(res.data.agents)) {
                    return (res.data.agents[roomId] >= 1);
                }
                return false;
            })
            .then((areAvailable) => {
                if (!areAvailable) {
                    throw new Error('No available agents');
                }
            });
    }
}

export default new AvailabilityChecker();
