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
