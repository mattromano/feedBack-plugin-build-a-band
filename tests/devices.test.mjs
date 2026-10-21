// Device listing and routing. DOM-free: win and storage are fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    listGuitarInputs, listDrumInputs, findKit, listMicInputs,
    applyGuitarDevice, applyDrumDevice, applyMicDevice, applyDevices, isPadHit,
} from '../src/devices.js';

const DEVICES = [
    { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
    { kind: 'audioinput', deviceId: 'blank', label: '' },
    { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
    { kind: 'audioinput', deviceId: 'usb-mic', label: 'USB Mic' },
];

function fakeWin({ sessionSources = [], devices = DEVICES, midiSources = [], afterDiscover = null } = {}) {
    const calls = { gum: 0, listOpts: [], select: [], noteDetect: [], midiSelect: [], drums: [], discover: 0 };
    let midi = midiSources;
    const win = {
        navigator: {
            mediaDevices: {
                enumerateDevices: async () => devices,
                getUserMedia: async () => { calls.gum++; throw new Error('must not be called'); },
            },
        },
        feedBack: {
            audioSession: {
                listInputSources: (opts) => { calls.listOpts.push(opts); return { outcome: 'handled', payload: { sources: sessionSources } }; },
                selectInputSource: (q, r) => { calls.select.push([q, r]); return { outcome: 'handled' }; },
            },
            midiInput: {
                listSources: () => midi,
                discover: async () => { calls.discover++; if (afterDiscover) midi = afterDiscover; },
                select: (k) => { calls.midiSelect.push(k); },
            },
        },
        noteDetect: { setDevice: (id) => { calls.noteDetect.push(id); } },
        feedBackDrums: { setMidiInput: (k) => { calls.drums.push(k); } },
    };
    return { win, calls };
}

function memStorage() {
    const m = new Map();
    return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const SESSION = [{ logicalSourceKey: 'native::in1', label: 'Interface In 1' }];

test('guitar inputs prefer the desktop session list', async () => {
    const { win, calls } = fakeWin({ sessionSources: SESSION });
    const r = await listGuitarInputs(win);
    assert.deepEqual(r, { via: 'session', items: [{ key: 'native::in1', label: 'Interface In 1' }] });
    assert.deepEqual(calls.listOpts, [{ includeUnavailable: false }]);
});

test('guitar inputs fall back to browser audio inputs', async () => {
    const { win } = fakeWin();
    const r = await listGuitarInputs(win);
    assert.deepEqual(r, {
        via: 'browser',
        items: [{ key: 'blank', label: 'Input 1' }, { key: 'usb-mic', label: 'USB Mic' }],
    });
    // No audioSession at all also falls back.
    const bare = fakeWin();
    delete bare.win.feedBack.audioSession;
    assert.equal((await listGuitarInputs(bare.win)).via, 'browser');
    // Nothing available at all: an empty browser list, no throw.
    assert.deepEqual(await listGuitarInputs({}), { via: 'browser', items: [] });
});

test('listing never calls getUserMedia', async () => {
    const { win, calls } = fakeWin({ midiSources: [{ logicalSourceKey: 'webmidi:kit', label: 'Kit' }] });
    await listGuitarInputs(win);
    await listMicInputs(win);
    listDrumInputs(win);
    await findKit(win);
    assert.equal(calls.gum, 0);
});

test('mic inputs are the browser audio inputs', async () => {
    const { win } = fakeWin({ sessionSources: SESSION });
    assert.deepEqual(await listMicInputs(win), [{ key: 'blank', label: 'Input 1' }, { key: 'usb-mic', label: 'USB Mic' }]);
    assert.deepEqual(await listMicInputs({}), []);
});

test('drum inputs come from core midiInput; [] without the capability', async () => {
    const { win, calls } = fakeWin({ afterDiscover: [{ logicalSourceKey: 'webmidi:kit', label: 'Kit' }] });
    assert.deepEqual(listDrumInputs(win), []);
    assert.deepEqual(listDrumInputs({}), []);
    assert.deepEqual(listDrumInputs({ feedBack: {} }), []);
    assert.deepEqual(await findKit(win), [{ key: 'webmidi:kit', label: 'Kit' }]);
    assert.equal(calls.discover, 1);
    assert.deepEqual(await findKit({}), []);
});

test('applyGuitarDevice routes to the session or to note_detect', async () => {
    const s = fakeWin({ sessionSources: SESSION });
    assert.equal(await applyGuitarDevice('native::in1', s.win), 'session');
    assert.deepEqual(s.calls.select, [[{ logicalSourceKey: 'native::in1' }, 'build_a_band']]);
    assert.deepEqual(s.calls.noteDetect, []);

    const b = fakeWin();
    assert.equal(await applyGuitarDevice('usb-mic', b.win), 'browser');
    assert.deepEqual(b.calls.noteDetect, ['usb-mic']);
    assert.deepEqual(b.calls.select, []);

    assert.equal(await applyGuitarDevice('', b.win), 'none');
    assert.deepEqual(b.calls.noteDetect, ['usb-mic']);
    // A session without selectInputSource: no throw.
    const noSel = fakeWin({ sessionSources: SESSION });
    delete noSel.win.feedBack.audioSession.selectInputSource;
    assert.equal(await applyGuitarDevice('native::in1', noSel.win), 'session');
    // note_detect not loaded: still no throw.
    assert.equal(await applyGuitarDevice('usb-mic', {}), 'browser');
});

test('applyDrumDevice selects the core source and the drums pref', () => {
    const { win, calls } = fakeWin();
    assert.equal(applyDrumDevice('webmidi:kit', win), 'ok');
    assert.deepEqual(calls.midiSelect, ['webmidi:kit']);
    assert.deepEqual(calls.drums, ['webmidi:kit']);
    assert.equal(applyDrumDevice('', win), 'none');
    assert.deepEqual(calls.midiSelect, ['webmidi:kit']);
    assert.equal(applyDrumDevice('webmidi:kit', {}), 'ok');
});

test("applyMicDevice writes karaoke's key raw", () => {
    const st = memStorage();
    assert.equal(applyMicDevice('usb-mic', st), 'ok');
    assert.equal(st.m.get('lyrics_karaoke.deviceId'), 'usb-mic');
    // The placeholder (empty id) never overwrites karaoke's pick.
    assert.equal(applyMicDevice('', st), 'none');
    assert.equal(st.m.get('lyrics_karaoke.deviceId'), 'usb-mic');
    // Blocked storage never throws.
    applyMicDevice('usb-mic', { setItem() { throw new Error('blocked'); } });
    applyMicDevice('usb-mic', undefined);
});

test('applyDevices skips parts that are off or have no key', async () => {
    const prefs = (g, d, v) => ({ parts: { guitar: g, drums: d, vocals: v } });
    const a = fakeWin();
    const st = memStorage();
    await applyDevices(prefs(
        { on: false, deviceKey: 'usb-mic' },
        { on: true, deviceKey: '' },
        { on: true, deviceId: 'usb-mic' },
    ), a.win, st);
    assert.deepEqual(a.calls.noteDetect, []);
    assert.deepEqual(a.calls.midiSelect, []);
    assert.deepEqual(a.calls.drums, []);
    assert.equal(st.m.get('lyrics_karaoke.deviceId'), 'usb-mic');

    const b = fakeWin();
    const st2 = memStorage();
    await applyDevices(prefs(
        { on: true, deviceKey: 'usb-mic' },
        { on: true, deviceKey: 'webmidi:kit' },
        { on: false, deviceId: 'usb-mic' },
    ), b.win, st2);
    assert.deepEqual(b.calls.noteDetect, ['usb-mic']);
    assert.deepEqual(b.calls.drums, ['webmidi:kit']);
    assert.equal(st2.m.has('lyrics_karaoke.deviceId'), false);
});

test('isPadHit', () => {
    assert.equal(isPadHit([0x99, 38, 100]), true);
    assert.equal(isPadHit([0x99, 38, 0]), false);
    assert.equal(isPadHit([0x89, 38, 64]), false);
    assert.equal(isPadHit([0xB0, 4, 90]), false);
    assert.equal(isPadHit(new Uint8Array([0x90, 36, 1])), true);
    assert.equal(isPadHit(null), false);
    assert.equal(isPadHit([0x90]), false);
});
