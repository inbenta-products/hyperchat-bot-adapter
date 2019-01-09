'use strict';

import { isString } from 'lodash';

/**
 * Static class that contains methods to make configuration easier
 */
class Helpers {
    /**
     * Get the specified query parameter value
     *
     * @param  {string} paramName
     * @return {string}
     */
    static getQueryParameterValue (paramName) {
        if (!isString(paramName)) {
            throw new Error('Parameter name must be a string');
        }

        paramName = paramName.replace(/[\[\]]/g, "\\$&");
        const url = Helpers.getCurrentUrl();
        const regex = new RegExp("[?&]" + paramName + "(=([^&#]*)|&|#|$)");
        const results = regex.exec(url);
        if (!results) {
            return null;
        }
        if (!results[2]) {
            return '';
        }
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    /**
     * Get the value of the specified HTML tag ID
     *
     * @param  {string} tagId
     * @return {string}
     */
    static getHTMLTagValueById (tagId) {
        const tag = document.getElementById(tagId);
        return tag.innerText || tag.textContent;
    }

    /**
     * Get the language code that the user has configured in the browser
     *
     * @return {string}
     */
    static getUserBrowserLanguage () {
        return navigator.language;
    }

    /**
     * Get the current URL
     *
     * @return {string}
     */
    static getCurrentUrl () {
        return window.location.href;
    }

    /**
     * Get the current UNIX timestamp
     * @returns {Date}
     */
    static getUnixTime () {
        return Math.floor((new Date()).getTime() / 1000);
    }
}

export default Helpers;