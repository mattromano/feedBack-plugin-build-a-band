// Settings over the paused song (plan 7 R9, R12) on the fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSettingsOverlay } from '../src/settings-overlay.js';
import { makeDoc, flush } from './fake-dom.mjs';

function makeWin({ loadSettings } = {}) {
    const listeners = { capture: new Map(), bubble: new Map() };
    const phase = (opts) => (opts === true || (opts && opts.capture) ? 'capture' : 'bubble');
    const handlers = {};
    const win = {
        loads: 0,
        addEventListener: (t, f, opts) => {
            const m = listeners[phase(opts)];
            (m.get(t) || m.set(t, new Set()).get(t)).add(f);
        },
        removeEventListener: (t, f, opts) => { listeners[phase(opts)].get(t)?.delete(f); },
        listenerCount: () => [...listeners.capture.values(), ...listeners.bubble.values()].reduce((n, s) => n + s.size, 0),
        navigator: { mediaSession: { handlers, setActionHandler: (a, f) => { handlers[a] = f; } } },
        // Window capture keydown listeners, as the browser runs them first.
        key(key, target, mods = {}) {
            const e = {
                type: 'keydown', key, code: key === ' ' ? 'Space' : key, target, defaultPrevented: false, stopped: false,
                preventDefault() { this.defaultPrevented = true; },
                stopPropagation() { this.stopped = true; },
                ...mods,
            };
            for (const f of [...(listeners.capture.get('keydown') || [])]) { f(e); if (e.stopped) break; }
            return e;
        },
    };
    win.loadSettings = loadSettings || (() => { win.loads++; });
    return win;
}

function setup({ withSettings = true, role = null, loadSettings } = {}) {
    const doc = makeDoc();
    let settings = null;
    let coreBack = null;
    let checkbox = null;
    if (withSettings) {
        settings = doc.createElement('div');
        settings.id = 'settings';
        if (role) settings.setAttribute('role', role);
        coreBack = doc.createElement('button');
        coreBack.className = 'fb-settings-back';
        checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        settings.append(coreBack, checkbox);
        doc.body.appendChild(settings);
    }
    const win = makeWin({ loadSettings });
    const calls = { close: 0 };
    const before = win.listenerCount();
    const overlay = openSettingsOverlay({ doc, win, onClose: () => { calls.close++; } });
    const back = () => (settings ? settings.querySelector('button.bab-settings-back') : null);
    return { doc, win, settings, coreBack, checkbox, calls, overlay, before, back };
}

test('opening shows Settings as a modal over the stage', () => {
    const { doc, win, settings, overlay, back } = setup();
    assert.equal(overlay.kind, 'settings');
    assert.equal(settings.getAttribute('role'), 'dialog');
    assert.equal(settings.getAttribute('aria-modal'), 'true');
    assert.equal(settings.getAttribute('aria-label'), 'Settings');
    assert.equal(doc.body.classList.contains('bab-settings-over'), true);
    const btn = settings.children[0];
    assert.equal(btn, back());
    assert.equal(btn.tagName, 'BUTTON');
    assert.equal(btn.type, 'button');
    assert.equal(btn.textContent, 'Back to the song');
    assert.equal(doc.activeElement, btn);
    assert.equal(win.loads, 1);
    assert.equal(typeof win.navigator.mediaSession.handlers.play, 'function');
});

test('Escape closes it and calls back once', () => {
    const { doc, win, settings, calls, overlay, before, back } = setup();
    const e = win.key('Escape', doc.body);
    assert.equal(e.defaultPrevented, true);
    assert.equal(calls.close, 1);
    for (const a of ['role', 'aria-modal', 'aria-label']) assert.equal(settings.hasAttribute(a), false, a);
    assert.equal(doc.body.classList.contains('bab-settings-over'), false);
    assert.equal(back(), null);
    assert.equal(win.navigator.mediaSession.handlers.play, null);
    assert.equal(win.listenerCount(), before);
    overlay.close();
    assert.equal(calls.close, 1);
});

test('Escape with a modifier is left alone', () => {
    const { doc, win, calls } = setup();
    const e = win.key('Escape', doc.body, { metaKey: true });
    assert.equal(e.defaultPrevented, false);
    assert.equal(calls.close, 0);
});

test('the back button closes it', () => {
    const { doc, calls, back } = setup();
    back().click();
    assert.equal(calls.close, 1);
    assert.equal(doc.body.classList.contains('bab-settings-over'), false);
    assert.equal(back(), null);
});

test('Space on the page behind is swallowed, Space in Settings is not', () => {
    const { doc, win, checkbox, calls } = setup();
    assert.equal(win.key(' ', doc.body).defaultPrevented, true);
    assert.equal(win.key('ArrowLeft', doc.body).defaultPrevented, true);
    assert.equal(win.key(' ', checkbox).defaultPrevented, false);
    assert.equal(win.key('a', doc.body).defaultPrevented, false);
    assert.equal(calls.close, 0);
});

test('a silent close never calls back', () => {
    const { doc, calls, overlay, settings } = setup();
    overlay.close({ silent: true });
    assert.equal(calls.close, 0);
    assert.equal(settings.hasAttribute('aria-modal'), false);
    assert.equal(doc.body.classList.contains('bab-settings-over'), false);
    overlay.close();
    assert.equal(calls.close, 0);
});

test('an existing role is put back', () => {
    const { settings, overlay } = setup({ role: 'region' });
    assert.equal(settings.getAttribute('role'), 'dialog');
    overlay.close();
    assert.equal(settings.getAttribute('role'), 'region');
});

test('no #settings', () => {
    const { doc, win, overlay, before } = setup({ withSettings: false });
    assert.equal(overlay, null);
    assert.equal(doc.body.classList.contains('bab-settings-over'), false);
    assert.equal(win.loads, 0);
    assert.equal(win.listenerCount(), before);
    assert.equal(win.navigator.mediaSession.handlers.play, undefined);
});

test('loadSettings rejecting is caught', async () => {
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a);
    try {
        const { overlay } = setup({ loadSettings: () => Promise.reject(new Error('offline')) });
        assert.ok(overlay);
        await flush();
        assert.equal(warned.length, 1);
        overlay.close({ silent: true });
        const thrown = setup({ loadSettings: () => { throw new Error('boom'); } });
        assert.ok(thrown.overlay);
        assert.equal(warned.length, 2);
        thrown.overlay.close({ silent: true });
    } finally {
        console.warn = warn;
    }
});
