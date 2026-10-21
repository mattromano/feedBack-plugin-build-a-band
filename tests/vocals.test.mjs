import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karaokeApi, armVocals, startVocals, stopVocals } from '../src/vocals.js';

const fns = () => ({
    mountStrip() {}, setKaraokeMode() {}, startMic() {}, stopMic() {}, setDifficulty() {}, setHearMyself() {},
});

test('karaokeApi accepts a v1 API', () => {
    const api = { apiVersion: 1, ...fns() };
    assert.equal(karaokeApi({ lyricsKaraoke: api }), api);
});

test('karaokeApi refuses missing, old or partial APIs', () => {
    assert.equal(karaokeApi({}), null);
    assert.equal(karaokeApi(null), null);
    assert.equal(karaokeApi({ lyricsKaraoke: { apiVersion: 0, ...fns() } }), null);
    const { startMic, ...partial } = fns();
    assert.equal(karaokeApi({ lyricsKaraoke: { apiVersion: 1, ...partial } }), null);
});

test('karaokeApi survives a throwing getter', () => {
    const win = { get lyricsKaraoke() { throw new Error('boom'); } };
    assert.equal(karaokeApi(win), null);
});

// Fake karaoke API recording [name, arg] calls. Promises are controllable.
function fakeApi(opts = {}) {
    const calls = [];
    const api = {
        calls,
        mountStrip(a) { calls.push(['mountStrip', a]); },
        setKaraokeMode(a) {
            calls.push(['setKaraokeMode', a]);
            return opts.setKaraokeMode ? opts.setKaraokeMode(a) : Promise.resolve(true);
        },
        startMic() {
            calls.push(['startMic']);
            if (opts.onStartMic) opts.onStartMic();
            return opts.startMic ? opts.startMic() : Promise.resolve('listening');
        },
        stopMic() { calls.push(['stopMic']); if (opts.stopMicThrows) throw new Error('boom'); },
        setDifficulty(a) { calls.push(['setDifficulty', a]); },
        setHearMyself(a) { calls.push(['setHearMyself', a]); },
    };
    return api;
}
const memStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('armVocals sets the band difficulty and hear-myself', () => {
    const api = fakeApi();
    armVocals(api, { difficulty: 'hard', hearMyself: false });
    assert.deepEqual(api.calls, [['setDifficulty', 'hard'], ['setHearMyself', false]]);
    const api2 = fakeApi();
    armVocals(api2, { difficulty: 'bogus', hearMyself: false });
    assert.deepEqual(api2.calls[0], ['setDifficulty', 'medium']);
});

test('startVocals hosts the strip, turns karaoke on, writes the mic, then starts it', async () => {
    const storage = memStorage();
    let seen;
    const api = fakeApi({ onStartMic: () => { seen = storage.getItem('lyrics_karaoke.deviceId'); } });
    const slot = {};
    const r = await startVocals({ api, slot, deviceId: 'usb-mic', storage, isCurrent: () => true });
    assert.equal(r, 'started');
    assert.deepEqual(api.calls, [['mountStrip', slot], ['setKaraokeMode', true], ['startMic']]);
    assert.equal(seen, 'usb-mic');
});

test('startVocals no pitch: no mic', async () => {
    const api = fakeApi({ setKaraokeMode: () => Promise.resolve(false) });
    const r = await startVocals({ api, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => true });
    assert.equal(r, 'no-pitch');
    assert.ok(!api.calls.some((c) => c[0] === 'startMic'));
});

test('a session that ended while karaoke was loading never opens the mic', async () => {
    let current = true;
    const api = fakeApi({ setKaraokeMode: () => { current = false; return Promise.resolve(true); } });
    const r = await startVocals({ api, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => current });
    assert.equal(r, 'cancelled');
    assert.ok(!api.calls.some((c) => c[0] === 'startMic'));
    // Teardown's setKaraokeMode(false) ran while this one was pending; karaoke
    // mode must not be left on after it.
    assert.deepEqual(api.calls.at(-1), ['setKaraokeMode', false]);
});

test('a session that ended while the mic was starting stops it', async () => {
    let current = true;
    const api = fakeApi({ onStartMic: () => { current = false; } });
    const r = await startVocals({ api, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => current });
    assert.equal(r, 'cancelled');
    assert.deepEqual(api.calls[api.calls.length - 1], ['stopMic']);
});

test('startVocals mic error', async () => {
    const a = fakeApi({ startMic: () => Promise.resolve('error') });
    assert.equal(await startVocals({ api: a, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => true }), 'mic-error');
    const b = fakeApi({ startMic: () => Promise.reject(new Error('denied')) });
    assert.equal(await startVocals({ api: b, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => true }), 'mic-error');
});

test('stopVocals undoes everything in order, even when one call throws', () => {
    const api = fakeApi({ stopMicThrows: true });
    stopVocals(api);
    assert.deepEqual(api.calls, [
        ['stopMic'], ['setKaraokeMode', false], ['mountStrip', null], ['setDifficulty', null], ['setHearMyself', null],
    ]);
});

test('armVocals passes hear-myself as a boolean: true when on, false when missing', () => {
    const on = fakeApi();
    armVocals(on, { difficulty: 'easy', hearMyself: true });
    assert.deepEqual(on.calls[1], ['setHearMyself', true]);
    const missing = fakeApi();
    armVocals(missing, { difficulty: 'easy' });
    assert.deepEqual(missing.calls[1], ['setHearMyself', false]);
});

test('armVocals reports whether the mic is safe to open', () => {
    // Hear-myself off took effect, or hear-myself is wanted on: safe.
    assert.equal(armVocals(fakeApi(), { difficulty: 'easy', hearMyself: false }), true);
    const refusesOn = fakeApi();
    refusesOn.setHearMyself = () => false;
    assert.equal(armVocals(refusesOn, { difficulty: 'easy', hearMyself: true }), true);
    // Hear-myself off did not take: karaoke's default (on) would route the
    // mic to the speakers, so the mic must stay shut.
    for (const broken of [() => false, () => { throw new Error('boom'); }, undefined]) {
        const api = fakeApi();
        api.setHearMyself = broken;
        assert.equal(armVocals(api, { difficulty: 'easy', hearMyself: false }), false);
        assert.deepEqual(api.calls[0], ['setDifficulty', 'easy'], 'difficulty still armed');
    }
});

const STOP_ALL = [
    ['stopMic'], ['setKaraokeMode', false], ['mountStrip', null], ['setDifficulty', null], ['setHearMyself', null],
];

test('stopVocals clears everything after startVocals failed early', async () => {
    const api = fakeApi();
    const mount = api.mountStrip;
    api.mountStrip = (a) => { mount(a); if (a) throw new Error('bad host'); };
    const r = await startVocals({ api, slot: {}, deviceId: 'x', storage: memStorage(), isCurrent: () => true });
    assert.equal(r, 'mic-error');
    api.calls.length = 0;
    stopVocals(api);
    assert.deepEqual(api.calls, STOP_ALL);
});

test('stopVocals clears everything when setKaraokeMode(false) rejects, with no unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
        const api = fakeApi({ setKaraokeMode: (on) => (on ? Promise.resolve(true) : Promise.reject(new Error('busy'))) });
        stopVocals(api);
        assert.deepEqual(api.calls, STOP_ALL);
        await new Promise((r) => setTimeout(r, 0));
        assert.deepEqual(unhandled, []);
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

test("a cancelled start doesn't turn karaoke off under a newer start on the same karaoke", async () => {
    const pending = [];
    const api = fakeApi({ setKaraokeMode: (on) => (on ? new Promise((r) => pending.push(r)) : Promise.resolve(false)) });
    let firstCurrent = true;
    const first = startVocals({ api, slot: {}, deviceId: '', storage: memStorage(), isCurrent: () => firstCurrent });
    firstCurrent = false;
    const second = startVocals({ api, slot: {}, deviceId: '', storage: memStorage(), isCurrent: () => true });
    pending[1](true);
    pending[0](true);
    assert.equal(await first, 'cancelled');
    assert.equal(await second, 'started');
    assert.ok(!api.calls.some((c) => c[0] === 'setKaraokeMode' && c[1] === false), JSON.stringify(api.calls));
});
