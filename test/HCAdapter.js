import { expect } from 'chai';
import sinon from 'sinon';

import HCAdapter from './../lib/HCAdapter.js';
import botMock from './mockups/bot.js';
import confMock from './mockups/conf.js';

describe('HCAdapter constructor', () => {

    it('should be a class', () => {
        expect(HCAdapter).to.be.a('function');
        expect(new HCAdapter(botMock, confMock)).to.be.an.instanceof(HCAdapter);
    });

    it('should receive a bot instance as first argument', () => {
        expect(() => { new HCAdapter(botMock, confMock); }).to.not.throw();
    });

    it('should throw if first argument is not a bot instance', () => {
        expect(() => { new HCAdapter({}); }).to.throw();
    });

    it('should receive a conf object as second argument', () => {
        expect(() => { new HCAdapter(botMock, confMock); }).to.not.throw();
    });

    it('should throw if second argument is not a conf object', () => {
        expect(() => { new HCAdapter(botMock, {}); }).to.throw();
    });

});

describe('HCAdapter loadHyperchatSDK', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HCAdapter(botMock, confMock);
    });

    it('should create a script element in the DOM', () => {

    });

    afterEach(() => {
        adapter = null;
    });

});

describe('HCAdapter _checkIsBotInstance', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HCAdapter(botMock, confMock);
    });

    it('should return a boolean', () => {
        expect(adapter._checkIsBotInstance(botMock)).to.be.a('boolean');
    });

    it('should return true if the argument is a bot instance', () => {
        expect(adapter._checkIsBotInstance(botMock)).to.be.true;
    });

    it('should return false if the argument is NOT a bot instance', () => {
        expect(adapter._checkIsBotInstance({})).to.be.false;
    });

    afterEach(() => {
        adapter = null;
    });

});

describe('HCAdapter _checkIsConfObject', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HCAdapter(botMock, confMock);
    });

    it('should return a boolean', () => {
        expect(adapter._checkIsConfObject(confMock)).to.be.a('boolean');
    });

    it('should return true if the argument is a bot instance', () => {
        expect(adapter._checkIsConfObject(confMock)).to.be.true;
    });

    it('should return false if the argument is NOT a bot instance', () => {
        expect(adapter._checkIsConfObject({})).to.be.false;
    });

    afterEach(() => {
        adapter = null;
    });

});
