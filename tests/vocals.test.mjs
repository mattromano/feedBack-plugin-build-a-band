import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karaokeApi } from '../src/vocals.js';

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
