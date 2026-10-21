import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPrefs, savePrefs } from '../src/prefs.js';

function stub(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        _m: m,
    };
}
const KEY = 'build_a_band.prefs.v1';

test('defaults when empty', () => {
    assert.equal(loadPrefs(stub()).split, 62);
});

test('round-trips split', () => {
    const s = stub();
    savePrefs({ split: 70 }, s);
    assert.equal(loadPrefs(s).split, 70);
});

test('bad JSON falls back to defaults', () => {
    assert.equal(loadPrefs(stub({ [KEY]: '{nope' })).split, 62);
});

test('storage that throws falls back to defaults', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(loadPrefs(bad).split, 62);
    assert.equal(savePrefs({ split: 70 }, bad).split, 70);
});
