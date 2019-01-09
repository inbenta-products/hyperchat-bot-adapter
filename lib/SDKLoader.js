'use strict';

import { EventEmitter } from 'events';
import { isUndefined } from 'lodash';

import Conf from './Conf';

const defaultPort = 8000;

/**
 * Class that contains methods to load and initialize the HyperChat JS SDK
 */
class SDKLoader extends EventEmitter {
    constructor () {
        super();
    }

    /**
     * Start loading the SDK and initialize it
     *
     * @return {Promise}
     */
    load () {
        // don't load if it's already loaded
        if (!isUndefined(window.ICF) && ICF.isInit) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.once('icf-ready', resolve);
            this.once('icf-failed', reject);
            this._loadAndInitSDK();
        });
    }

    /**
     * Load the HyperChat SDK by inserting a script tag in the window
     */
    _loadAndInitSDK () {
        const v = Conf.get('sdkVersion');
        const d = document;
        const s = 'script';
        const id = 'inbenta-jssdk';

        let js, ijs = d.getElementsByTagName(s)[0];

        if (!d.getElementById(id)) {
            js = d.createElement(s);
            js.id = id;
            js.src = 'https://sdk.inbenta.chat/'+v+'/icf.sdk.js';
            js.onload = this._initICF.bind(this);
            ijs.parentNode.insertBefore(js, ijs);
        } else {
            this._initICF();
        }
    }

    /**
     * Initialize ICF and emit that it is ready
     */
    _initICF () {
        const initData = {
            appId: Conf.get('appId'),
            setCookieOnDomain: Conf.get('setCookieOnDomain'),
            port: Conf.get('port') || defaultPort
        };

        if (Conf.get('region')) {
            initData.region = Conf.get('region');
        } else if (Conf.get('server')) {
            initData.server = Conf.get('server');
        }

        ICF.init(initData)
            .then(() => {
                if (ICF.isInit) {
                    window.ICF = ICF;
                    this.emit('icf-ready');
                }
            })
            .catch(() => {
                this.emit('icf-failed');
            });
    }
}

export default new SDKLoader();
