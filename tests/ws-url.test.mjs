import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWsUrl } from '../src/ws-url.js';

const http = { protocol: 'http:', host: 'localhost:8000' };
const https = { protocol: 'https:', host: 'band.example' };

test('takes the decoded filename raw (as core does) and adds the arrangement', () => {
    assert.equal(getWsUrl('sloppak/song.sloppak', 2, http),
        'ws://localhost:8000/ws/highway/sloppak/song.sloppak?arrangement=2');
});

test('a literal % in the filename does not throw and is not decoded', () => {
    assert.equal(getWsUrl('100% Rock_p.psarc', 1, http),
        'ws://localhost:8000/ws/highway/100% Rock_p.psarc?arrangement=1');
    assert.equal(getWsUrl('a%2Fb.psarc', 0, http), 'ws://localhost:8000/ws/highway/a%2Fb.psarc?arrangement=0');
});

test('spaces pass through like core (WebSocket/URL encodes them on the wire)', () => {
    const url = getWsUrl('My Band - Song.psarc', 3, http);
    assert.equal(url, 'ws://localhost:8000/ws/highway/My Band - Song.psarc?arrangement=3');
    assert.equal(new URL(url).pathname, '/ws/highway/My%20Band%20-%20Song.psarc');
});

test('wss on https', () => {
    assert.equal(getWsUrl('a.psarc', 0, https), 'wss://band.example/ws/highway/a.psarc?arrangement=0');
});

test('no arrangement param when arrangement is undefined', () => {
    assert.equal(getWsUrl('a.psarc', undefined, http), 'ws://localhost:8000/ws/highway/a.psarc');
});

test('reads globalThis.location lazily when none is passed', () => {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
    const prev = globalThis.location;
    globalThis.location = http;
    try {
        assert.equal(getWsUrl('x.psarc', 1), 'ws://localhost:8000/ws/highway/x.psarc?arrangement=1');
    } finally {
        if (had) globalThis.location = prev; else delete globalThis.location;
    }
});
