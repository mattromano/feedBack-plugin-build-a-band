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

test('labelScale defaults to 1 and round-trips', () => {
    const s = stub();
    assert.equal(loadPrefs(s).labelScale, 1);
    savePrefs({ labelScale: 1.75 }, s);
    assert.equal(loadPrefs(s).labelScale, 1.75);
    assert.equal(loadPrefs(s).split, 62, 'split untouched');
});

test('labelScale is validated: finite, clamped to 0.75-2.5', () => {
    const load = (v) => loadPrefs(stub({ [KEY]: JSON.stringify({ labelScale: v }) })).labelScale;
    assert.equal(load(9), 2.5);
    assert.equal(load(0.1), 0.75);
    assert.equal(load('2'), 1);
    assert.equal(load(null), 1);
    assert.equal(loadPrefs(stub({ [KEY]: '{"labelScale":1e999}' })).labelScale, 1);
});
