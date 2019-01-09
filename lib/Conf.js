'use strict';

import {
    isPlainObject,
    isFunction,
    isBoolean,
    isString,
    assign,
    cloneDeep
} from 'lodash';


/**
 * Class to manage the adapter configuration
 *
 * The actual configuration is kept in a "private" variable which is not visible from outside this class.
 * All operations with configuration values should be done using setters and getters
 */

/**
 * "Private" variable that holds the configuration
 * @type {Object}
 */
let _conf = {};


class Conf {
    /**
     * Set all the configuration values
     *
     * @param {Object} values
     */
    set (values) {
        this.validate(values);
        this.assignDefaults(values);
        _conf = assign(_conf, values);
    }

    /**
     * Get the value for a specific key from the configuration
     * @param  {string}  key
     * @return {mixed}       Value
     */
    get (key) {
        if (_conf.hasOwnProperty(key)) {
            return _conf[key];
        }

        return null;
    }

    /**
     * Get all the configuration object
     *
     * @return {Object}
     */
    getAll () {
        return cloneDeep(_conf);
    }

    setRoomFunction (roomFunction) {
        if (!isFunction(roomFunction)) {
            throw new Error('Invalid or missing configuration value');
        }
        _conf.room = roomFunction;
    }

    /**
     * Check if the provided parameter is a valid configuration object
     *
     * @param  {object} conf
     * @return {boolean}
     */
    validate (conf) {
        if (
            !isPlainObject(conf) ||
            (!conf.appId || !isString(conf.appId)) ||
            (
                (!conf.region || !isString(conf.region)) &&
                (!conf.server || !isString(conf.server))
            ) ||
            (!conf.room || !isFunction(conf.room))
        ) {
            throw new Error('Invalid or missing configuration value');
        }

        return true;
    }

    /**
     * Assign default values to the missing configuration properties
     * @param  {object} conf
     * @return {object}
     */
    assignDefaults (conf) {
        const defaultSource = () => {
            return '3';
        };
        const defaultLang = () => {
            return '';
        };

        conf.sdkVersion = conf.sdkVersion || '1';
        conf.source = isFunction(conf.source) ? conf.source : defaultSource;
        conf.lang = isFunction(conf.lang) ? conf.lang : defaultLang;
        conf.importBotHistory = isBoolean(conf.importBotHistory) ? conf.importBotHistory : false;
        conf.fileUploadsActive = isBoolean(conf.fileUploadsActive) ? conf.fileUploadsActive : false;
        return conf;
    }
}

export default new Conf();
