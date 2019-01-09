'use strict';

import _ from 'lodash';
import EventEmitter from 'wolfy87-eventemitter';

import HCAdapter from './HCAdapter';
import Conf from './Conf';
import AvailabilityChecker from './AvailabilityChecker';
import Helpers from './Helpers';
import SDKLoader from './SDKLoader';

// execute lodash no conflict to avoid overwiting other global "_" objects
_.noConflict();

/**
 * Configure the adapter with the given object
 *
 * @param  {Object} conf
 */
const configure = (conf = {}) => {
    Conf.set(conf);
};

const setRoomFunction = (roomFunction) => {
    Conf.setRoomFunction(roomFunction);
};

/**
 * Build the actual adapter
 *
 * @param  {Object}     conf
 * @return {Function}
 */
const build = () => {
    return (botInstance) => {
        if (!_.isObject(botInstance)) {
            throw new Error('Invalid argument');
        }

        const adapter = new HCAdapter(botInstance);
        adapter.on('chat:created', (data) => {
            events.trigger('chat:created', [data]);
        });
        adapter.on('chat:closed', (data) => {
            events.trigger('chat:closed', [data]);
        });
        adapter.on('user:joined', (data) => {
            events.trigger('user:joined', [data]);
        });
        adapter.on('user:left', (data) => {
            events.trigger('user:left', [data]);
        });
        adapter.on('ticket:created', (data) => {
            events.trigger('ticket:created', [data]);
        });
    };
};

/**
 * Check if the escalation conditions are met
 *
 * @param  {Object} conf
 * @return {Promise}
 */
const checkEscalationConditions = () => {
    return AvailabilityChecker.check();
};

/**
 * A set of useful helper functions to use in configurations
 *
 * @type {Object}
 */
const helpers = Helpers;

const validateHyperchatApp = () => {
    return SDKLoader.load();
};

const events = new EventEmitter();

// export index;
export { configure, setRoomFunction, build, checkEscalationConditions, helpers, validateHyperchatApp, events };
