// Band toggle + auto-unmount wiring, with a fake feedBack bus and DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBandRuntime } from '../src/band-runtime.js';

function setup({ splitActive = false } = {}) {
    const bus = new EventTarget();
    const ids = {};
    const slotKids = [];
    const slot = {
        appendChild(el) { slotKids.push(el); ids[el.id] = el; return el; },
        contains: (el) => slotKids.includes(el),
    };
    const fb = {
        uiVersion: 'v3',
        ui: { playerControlSlot: () => slot },
        currentSong: { filename: 'old.psarc', arrangements: [] },
        on: (ev, fn) => bus.addEventListener(ev, fn),
        off: (ev, fn) => bus.removeEventListener(ev, fn),
        emit: (ev, detail) => bus.dispatchEvent(new CustomEvent(ev, { detail })),
    };
    ids.player = { id: 'player' };
    const doc = {
        getElementById: (id) => ids[id] || null,
        createElement: () => {
            const attrs = {};
            return { setAttribute: (k, v) => { attrs[k] = v; }, attrs, disabled: false };
        },
    };
    let ssActive = splitActive;
    const win = {
        feedBack: fb,
        highway: {},
        slopsmithSplitscreen: { isActive: () => ssActive, stop() { ssActive = false; } },
    };
    const mounts = [];
    const mountStage = ({ song }) => {
        const s = { song, unmounted: 0, unmount() { this.unmounted++; } };
        mounts.push(s);
        return s;
    };
    const rt = createBandRuntime({ win, doc, mountStage, loadPrefs: () => ({ split: 62 }) });
    const btn = () => ids['bab-band-btn'];
    return { rt, fb, btn, mounts, setSplit: (v) => { ssActive = v; } };
}

test('Band button is injected into the v3 slot and toggles the stage', () => {
    const { rt, btn, mounts } = setup();
    assert.ok(btn());
    btn().onclick({});
    assert.equal(mounts.length, 1);
    assert.equal(btn().attrs['aria-pressed'], 'true');
    btn().onclick({});
    assert.equal(mounts[0].unmounted, 1);
    assert.equal(btn().attrs['aria-pressed'], 'false');
    rt.dispose();
});

test('splitscreen turning on while mounted unmounts the stage', () => {
    const { rt, fb, mounts, setSplit } = setup();
    rt.toggle();
    fb.emit('splitscreen:panels-changed'); // splitscreen inactive: name change etc.
    assert.equal(mounts[0].unmounted, 0);
    setSplit(true);
    fb.emit('splitscreen:panels-changed');
    assert.equal(mounts[0].unmounted, 1);
    assert.equal(rt.isMounted(), false);
    rt.dispose();
});

test('song:stop and leaving the player unmount; staying on player does not', () => {
    const { rt, fb, mounts } = setup();
    rt.toggle();
    fb.emit('screen:changing', { id: 'player', from: 'player' });
    assert.equal(rt.isMounted(), true);
    fb.emit('screen:changing', { id: 'home', from: 'player' });
    assert.equal(mounts[0].unmounted, 1);
    rt.toggle();
    fb.emit('song:stop', { time: 3, screen: 'player' });
    assert.equal(mounts[1].unmounted, 1);
    rt.dispose();
});

test('while a song is loading the toggle does nothing (stale currentSong)', () => {
    const { rt, fb, btn, mounts } = setup();
    rt.toggle();
    fb.emit('song:loading', { filename: 'new.psarc' });
    assert.equal(mounts[0].unmounted, 1);
    assert.equal(btn().disabled, true);
    rt.toggle();
    assert.equal(mounts.length, 1, 'no mount with the previous song');
    fb.currentSong = { filename: 'new.psarc', arrangements: [] };
    fb.emit('song:loaded', fb.currentSong);
    assert.equal(btn().disabled, false);
    rt.toggle();
    assert.equal(mounts.length, 2);
    assert.equal(mounts[1].song.filename, 'new.psarc');
    rt.dispose();
});

test('dispose unmounts and removes every listener', () => {
    const { rt, fb, mounts, setSplit } = setup();
    rt.toggle();
    rt.dispose();
    assert.equal(mounts[0].unmounted, 1);
    rt.toggle(); // remount, then events must no longer reach it
    setSplit(true);
    fb.emit('splitscreen:panels-changed');
    fb.emit('song:stop', {});
    fb.emit('song:loading', {});
    assert.equal(mounts[1].unmounted, 0);
});
