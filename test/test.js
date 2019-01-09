import { expect } from 'chai';
import sinon from 'sinon';

import index from './../lib';
import HCAdapter from './../lib/HCAdapter.js';
import botMock from './mockups/bot.js';
import confMock from './mockups/conf.js';

describe('index', () => {

    it('should be a function', () => {
        expect(index).to.be.a('function');
    });

    it('should receive an object as first argument', () => {
        expect(index.bind(index, confMock)).to.not.throw();
    });

    it('should throw if first argument is not an object', () => {
        expect(index.bind(index, '')).to.throw();
    });

    it('should return a function', () => {
        let adapter = index(confMock);
        expect(adapter).to.be.a('function');
    });

    it('the function returned should receive a bot instance as first argument', () => {
        let adapter = index(confMock);
        expect(adapter.bind(adapter, botMock)).to.not.throw();
    });

    it('the function returned should throw if first argument is not an object', () => {
        let adapter = index(confMock);
        expect(adapter.bind(adapter, 12)).to.throw();
    });

    it('should create a new HCAdapter object', () => {

    });
});