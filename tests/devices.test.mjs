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

function fakeWin({ sessionSources = [], devices = DEVICES, midiSources = [], afterDiscover = null,
    sessionSelected = null, midiSelected = null } = {}) {
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
                listInputSources: (opts) => { calls.listOpts.push(opts); return { outcome: 'handled', payload: { sources: sessionSources, selected: sessionSelected ? { logicalSourceKey: sessionSelected } : null } }; },
                selectInputSource: (q, r) => { calls.select.push([q, r]); return { outcome: 'handled' }; },
            },
            midiInput: {
                listSources: () => midi,
                discover: async () => { calls.discover++; if (afterDiscover) midi = afterDiscover; },
                select: (k) => { calls.midiSelect.push(k); },
                getSelected: () => midiSelected,
            },
        },
        noteDetect: { setDevice: (id) => { calls.noteDetect.push(id); } },
        feedBackDrums: { setMidiInput: (k) => { calls.drums.push(k); } },
    };
    return { win, calls };
}

function memStorage(init = {}) {
    const m = new Map(Object.entries(init));
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
    assert.deepEqual(s.calls.select, [[{ logicalSourceKey: 'native::in1' }, 'rockherosmith']]);
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

test('a desktop source key never reaches note_detect when the session list is empty', async () => {
    const b = fakeWin();
    assert.equal(await applyGuitarDevice('native::in1', b.win), 'browser');
    assert.deepEqual(b.calls.noteDetect, [], 'not a browser deviceId: note_detect keeps its device');
    assert.equal(await applyGuitarDevice('usb-mic', b.win), 'browser');
    assert.deepEqual(b.calls.noteDetect, ['usb-mic']);
});

test('applyDevices leaves inputs that are already selected alone', async () => {
    const prefs = { parts: {
        guitar: { on: true, deviceKey: 'native::in1' },
        drums: { on: true, deviceKey: 'webmidi:kit' },
        vocals: { on: true, deviceId: 'usb-mic' },
    } };
    const a = fakeWin({ sessionSources: SESSION, sessionSelected: 'native::in1', midiSelected: 'webmidi:kit' });
    a.win.feedBackDrums.getMidiInput = () => 'webmidi:kit';
    const st = memStorage({ 'lyrics_karaoke.deviceId': 'usb-mic' });
    let writes = 0;
    const setItem = st.setItem;
    st.setItem = (k, v) => { writes++; setItem(k, v); };
    await applyDevices(prefs, a.win, st, {});
    assert.deepEqual(a.calls.select, [], 'audioSession selection unchanged');
    assert.deepEqual(a.calls.midiSelect, [], 'core MIDI selection unchanged');
    assert.deepEqual(a.calls.drums, [], 'no drums MIDI reconnect');
    assert.equal(writes, 0, 'karaoke key unchanged');

    // A different selection is still applied.
    const b = fakeWin({ sessionSources: SESSION, sessionSelected: 'native::other', midiSelected: 'webmidi:old' });
    b.win.feedBackDrums.getMidiInput = () => 'webmidi:old';
    await applyDevices(prefs, b.win, memStorage({ 'lyrics_karaoke.deviceId': 'old' }), {});
    assert.deepEqual(b.calls.select, [[{ logicalSourceKey: 'native::in1' }, 'rockherosmith']]);
    assert.deepEqual(b.calls.midiSelect, ['webmidi:kit']);
    assert.deepEqual(b.calls.drums, ['webmidi:kit']);
});

test('unreadable note_detect and drums inputs are applied once per key in a runtime', async () => {
    const prefs = (g, d) => ({ parts: { guitar: { on: true, deviceKey: g }, drums: { on: true, deviceKey: d } } });
    const { win, calls } = fakeWin();
    const memo = {};
    await applyDevices(prefs('usb-mic', 'webmidi:kit'), win, memStorage(), memo);
    await applyDevices(prefs('usb-mic', 'webmidi:kit'), win, memStorage(), memo);
    assert.deepEqual(calls.noteDetect, ['usb-mic'], 'note_detect does not restart capture on the next Go');
    assert.deepEqual(calls.drums, ['webmidi:kit'], 'drums does not reconnect on the next Go');
    await applyDevices(prefs('blank', 'webmidi:pad'), win, memStorage(), memo);
    assert.deepEqual(calls.noteDetect, ['usb-mic', 'blank']);
    assert.deepEqual(calls.drums, ['webmidi:kit', 'webmidi:pad']);
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
