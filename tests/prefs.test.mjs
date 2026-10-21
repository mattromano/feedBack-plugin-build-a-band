import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    loadPrefs, savePrefs, pushRecent, clampZoom,
    MIC_HIT_DB_MIN, MIC_HIT_DB_MAX, MIC_HIT_DB_STEP, MIC_HIT_DB_DEFAULT, clampMicHitDb,
} from '../src/prefs.js';

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

const PART_DEFAULTS = {
    guitar: { on: true, deviceKey: '', arrangement: 'Lead', difficulty: 'medium' },
    drums: { on: true, deviceKey: '', difficulty: 'medium', soundMode: 'song' },
    vocals: { on: true, deviceId: '', difficulty: 'medium', hearMyself: false, micHitDb: -30 },
};

test('plan 1 prefs gain the plan 2 defaults', () => {
    const p = loadPrefs(stub({ [KEY]: '{"split":70,"labelScale":1.5}' }));
    assert.equal(p.split, 70);
    assert.equal(p.labelScale, 1.5);
    assert.deepEqual(p.parts, PART_DEFAULTS);
    assert.equal(p.failMode, 'nofail');
    assert.equal(p.fullScreenStage, true);
    assert.equal(p.lastSong, null);
    assert.deepEqual(p.recentSongs, []);
});

test('garbage parts fall back per field', () => {
    const raw = { parts: { guitar: { on: 'yes', arrangement: 'Keys', difficulty: 'hard' }, drums: 7 } };
    const p = loadPrefs(stub({ [KEY]: JSON.stringify(raw) }));
    assert.equal(p.parts.guitar.on, true);
    assert.equal(p.parts.guitar.arrangement, 'Lead');
    assert.equal(p.parts.guitar.difficulty, 'hard');
    assert.deepEqual(p.parts.drums, PART_DEFAULTS.drums);
});

test('savePrefs merges parts per field', () => {
    const s = stub();
    savePrefs({ parts: { drums: { on: false } } }, s);
    const p = loadPrefs(s);
    assert.equal(p.parts.drums.on, false);
    assert.equal(p.parts.drums.soundMode, 'song');
    assert.deepEqual(p.parts.guitar, PART_DEFAULTS.guitar);
    savePrefs({ parts: { drums: { soundMode: 'kit' } } }, s);
    assert.equal(loadPrefs(s).parts.drums.on, false, 'earlier field kept');
});

test('pushRecent dedupes, orders newest first, keeps 10', () => {
    let list = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, { filename: `f${i}`, title: `t${i}`, artist: 'a' });
    assert.equal(list.length, 10);
    assert.equal(list[0].filename, 'f11');
    list = pushRecent(list, { filename: 'f5', title: 't5', artist: 'a' });
    assert.equal(list.length, 10);
    assert.equal(list[0].filename, 'f5');
    assert.equal(list.filter((e) => e.filename === 'f5').length, 1);
});

test('recentSongs and lastSong are validated', () => {
    const raw = { recentSongs: [{ title: 'no file' }, { filename: 'a', title: 'A', artist: 'X' }, { filename: 'a', title: 'dup' }, 5],
        lastSong: { title: 'x' } };
    const p = loadPrefs(stub({ [KEY]: JSON.stringify(raw) }));
    assert.deepEqual(p.recentSongs, [{ filename: 'a', title: 'A', artist: 'X' }]);
    assert.equal(p.lastSong, null);
    const ok = loadPrefs(stub({ [KEY]: JSON.stringify({ lastSong: { filename: 'z' } }) }));
    assert.deepEqual(ok.lastSong, { filename: 'z', title: '', artist: '' });
});

test('zoom defaults to 1 per lane and is clamped', () => {
    const s = stub();
    assert.deepEqual(loadPrefs(s).zoom, { guitar: 1, drums: 1 });
    const saved = savePrefs({ zoom: { drums: 2 } }, s);
    assert.equal(saved.zoom.drums, 1.3);
    assert.equal(saved.zoom.guitar, 1);
    savePrefs({ zoom: { guitar: 0.8 } }, s);
    assert.deepEqual(loadPrefs(s).zoom, { guitar: 0.8, drums: 1.3 }, 'merged per key');
    assert.equal(clampZoom(NaN), 1);
    assert.equal(clampZoom(0.74), 0.74);
    assert.equal(clampZoom(0.1), 0.7);
    assert.equal(clampZoom(1.1 + 0.1), 1.2);
    assert.deepEqual(loadPrefs(stub({ [KEY]: '{"zoom":"big"}' })).zoom, { guitar: 1, drums: 1 });
});

test('micHitDb defaults, clamps and rounds', () => {
    assert.deepEqual([MIC_HIT_DB_MIN, MIC_HIT_DB_MAX, MIC_HIT_DB_STEP, MIC_HIT_DB_DEFAULT], [-48, -12, 3, -30]);
    const s = stub();
    assert.equal(loadPrefs(s).parts.vocals.micHitDb, -30, 'missing');
    assert.equal(clampMicHitDb(-70), -48);
    assert.equal(clampMicHitDb(0), -12);
    assert.equal(clampMicHitDb(-29.6), -30);
    assert.equal(clampMicHitDb('x'), -30);
    assert.equal(clampMicHitDb(undefined), -30);
    assert.equal(clampMicHitDb(NaN), -30);
    const bad = stub({ [KEY]: JSON.stringify({ parts: { vocals: { micHitDb: -70 } } }) });
    assert.equal(loadPrefs(bad).parts.vocals.micHitDb, -48);
    savePrefs({ parts: { vocals: { micHitDb: -24 } } }, s);
    assert.equal(loadPrefs(s).parts.vocals.micHitDb, -24);
    assert.equal(loadPrefs(s).parts.vocals.hearMyself, false, 'other vocals fields untouched');
    assert.equal('micHitDb' in loadPrefs(s).parts.guitar, false);
});

test('pickFilters defaults', () => {
    assert.deepEqual(loadPrefs(stub()).pickFilters,
        { playable: true, drumStem: false, drums: false, vocals: false, guitar: false });
});

test('bad values fall back', () => {
    const s = stub({ [KEY]: JSON.stringify({ pickFilters: { playable: 'x', drums: true, bogus: true } }) });
    const pf = loadPrefs(s).pickFilters;
    assert.equal(pf.playable, true);
    assert.equal(pf.drums, true);
    assert.equal('bogus' in pf, false);
});

test('savePrefs merges pickFilters', () => {
    const s = stub();
    const next = savePrefs({ pickFilters: { drumStem: true } }, s);
    assert.equal(next.pickFilters.drumStem, true);
    assert.equal(next.pickFilters.playable, true);
    assert.equal(loadPrefs(s).pickFilters.playable, true);
    assert.equal(loadPrefs(s).pickFilters.drumStem, true);
});
