// Window full screen (plan 7 R2, R20) against a fake document and window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyFullScreen, createFullScreen } from '../src/full-screen.js';
import { flush } from './fake-dom.mjs';

function setup({ reject = false, win: winOver = {} } = {}) {
    const calls = { request: 0, exit: 0 };
    const listeners = new Set();
    const doc = {
        fullscreenElement: null,
        documentElement: {
            requestFullscreen() {
                calls.request++;
                return reject ? Promise.reject(new Error('denied')) : Promise.resolve();
            },
        },
        exitFullscreen() { calls.exit++; return Promise.resolve(); },
        addEventListener(t, f) { if (t === 'fullscreenchange') listeners.add(f); },
        removeEventListener(t, f) { if (t === 'fullscreenchange') listeners.delete(f); },
    };
    const win = { outerWidth: 1200, outerHeight: 800, screen: { width: 1440, height: 900 }, navigator: {}, ...winOver };
    return { doc, win, calls, listeners, fs: createFullScreen({ doc, win }) };
}

test('request asks once and owns the full screen', () => {
    const { doc, calls, fs } = setup();
    assert.equal(fs.request(), true);
    assert.equal(calls.request, 1);
    doc.fullscreenElement = doc.documentElement;
    assert.equal(fs.isOn(), true);
    assert.equal(fs.request(), false);
    assert.equal(calls.request, 1);
    fs.exit();
    assert.equal(calls.exit, 1);
});

test('no user activation, or the window already fills the screen: no request', () => {
    const inactive = setup({ win: { navigator: { userActivation: { isActive: false } } } });
    assert.equal(inactive.fs.request(), false);
    assert.equal(inactive.calls.request, 0);
    const filled = setup({ win: { outerWidth: 1440, outerHeight: 900, screen: { width: 1440, height: 900 } } });
    assert.equal(filled.fs.request(), false);
    assert.equal(filled.calls.request, 0);
    const active = setup({ win: { navigator: { userActivation: { isActive: true } } } });
    assert.equal(active.fs.request(), true);
    assert.equal(active.calls.request, 1);
});

test('no requestFullscreen: no request', () => {
    const { doc, fs } = setup();
    delete doc.documentElement.requestFullscreen;
    assert.equal(fs.request(), false);
});

test("never exits a full screen it didn't request", () => {
    const { doc, calls, fs } = setup();
    doc.fullscreenElement = doc.documentElement;
    fs.exit();
    assert.equal(calls.exit, 0);
});

test('an exit before the full screen arrives gives it up', () => {
    const { doc, calls, fs } = setup();
    fs.request();
    fs.exit(); // not on yet: nothing to leave, and no longer ours
    assert.equal(calls.exit, 0);
    doc.fullscreenElement = doc.documentElement;
    fs.exit();
    assert.equal(calls.exit, 0);
});

test('a refused request is not ours', async () => {
    const { doc, calls, fs } = setup({ reject: true });
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a);
    try {
        assert.equal(fs.request(), true);
        await flush();
        doc.fullscreenElement = doc.documentElement; // e.g. the user's own
        fs.exit();
        assert.equal(calls.exit, 0);
        doc.fullscreenElement = null;
        assert.equal(fs.request(), true);
        await flush();
    } finally {
        console.warn = orig;
    }
    assert.equal(calls.request, 2);
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], '[build-a-band] full screen refused');
    assert.ok(warns[0][1] instanceof Error);
});

test('a rejected exitFullscreen is caught', async () => {
    const { doc, fs } = setup();
    doc.exitFullscreen = () => Promise.reject(new Error('nope'));
    fs.request();
    doc.fullscreenElement = doc.documentElement;
    assert.doesNotThrow(() => fs.exit());
    await flush();
});

test('onChange adds and removes the listener', () => {
    const { listeners, fs } = setup();
    const fn = () => {};
    const off = fs.onChange(fn);
    assert.equal(listeners.size, 1);
    assert.ok(listeners.has(fn));
    off();
    assert.equal(listeners.size, 0);
});

test('alreadyFullScreen', () => {
    assert.equal(alreadyFullScreen({ outerWidth: 1440, outerHeight: 900 }), false);
    assert.equal(alreadyFullScreen({ outerWidth: 1440, outerHeight: 900, screen: { width: 0, height: 0 } }), false);
    assert.equal(alreadyFullScreen({ outerWidth: 1440, outerHeight: 900, screen: { width: 1440, height: 900 } }), true);
    assert.equal(alreadyFullScreen({ outerWidth: 1440, outerHeight: 899, screen: { width: 1440, height: 900 } }), false);
    assert.equal(alreadyFullScreen({ outerWidth: 1440, outerHeight: 900, screen: { width: Infinity, height: 900 } }), false);
});
