import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWsUrl } from '../src/ws-url.js';

const http = { protocol: 'http:', host: 'localhost:8000' };
const https = { protocol: 'https:', host: 'band.example' };

test('decodes the percent-encoded filename and adds the arrangement', () => {
    assert.equal(getWsUrl('sloppak%2Fsong.sloppak', 2, http),
        'ws://localhost:8000/ws/highway/sloppak/song.sloppak?arrangement=2');
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
