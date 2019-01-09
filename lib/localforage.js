'use strict';

import localforage from 'localforage';

localforage.config({
    name: 'HyperchatBotAdapter'
});

export default localforage;