import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as query from '../src/query.js';
import { PICK_FILTERS, pickFilters, songChips, resolveRecent } from '../src/query.js';

const ALL_OFF = { guitar: { on: false }, drums: { on: false }, vocals: { on: false } };
const byId = (list) => Object.fromEntries(list.map((f) => [f.id, f]));

test('pickFilters lists the seven chips in order', () => {
    const list = pickFilters();
    assert.deepEqual(list.map((f) => [f.id, f.label]), PICK_FILTERS.map(([id, label]) => [id, label]));
    assert.deepEqual(PICK_FILTERS.map(([id, label]) => [id, label]), [
        ['playable', 'Playable by band'], ['drumStem', 'Drum stem'], ['drums', 'Drum chart'],
        ['vocals', 'Vocal pitch'], ['guitar', 'Guitar part'],
        ['fiveFret', '5-fret part'], ['fiveFretReal', 'Real 5-fret'],
    ]);
});

const CTL = (part, extra) => ({ id: 'ctl1', key: 'k' + part, name: 'X', part, on: true, connected: true, ...extra });

test('playable adds the controllers instruments; the new chips params; chip order', () => {
    const parts = ALL_OFF;
    const two = [CTL('guitar'), CTL('bass'), CTL('guitar')];
    assert.deepEqual(byId(pickFilters({ parts, controllers: two, showAuto: true })).playable.params, { five_fret: 'guitar,bass' });
    assert.deepEqual(byId(pickFilters({ parts, controllers: two })).playable.params, { five_fret: 'guitar:chart,bass:chart' });
    const mixed = { guitar: { on: true }, drums: { on: false }, vocals: { on: false } };
    assert.deepEqual(byId(pickFilters({ parts: mixed, controllers: [CTL('rhythm')], showAuto: true })).playable.params,
        { arrangements_has: 'Lead,Rhythm,Bass', five_fret: 'rhythm' });
    // Disconnected or off controllers are not asked for; none means no param.
    assert.deepEqual(byId(pickFilters({ parts, controllers: [CTL('bass', { connected: false }), CTL('guitar', { on: false })] })).playable.params, {});
    assert.deepEqual(byId(pickFilters({ parts })).playable.params, {});
    const f = byId(pickFilters({ parts }));
    assert.deepEqual(f.fiveFret.params, { five_fret: 'any:chart' });
    assert.deepEqual(byId(pickFilters({ parts, showAuto: true })).fiveFret.params, { five_fret: 'any' });
    assert.deepEqual(f.fiveFretReal.params, { five_fret: 'any:chart' });
    assert.deepEqual(byId(pickFilters({ parts, showAuto: true })).fiveFretReal.params, { five_fret: 'any:chart' });
    assert.equal(pickFilters({ on: { fiveFret: true } }).at(-2).on, true);
});

test('playable follows the parts that are on', () => {
    const parts = { guitar: { on: true }, drums: { on: true }, vocals: { on: false } };
    assert.deepEqual(byId(pickFilters({ parts })).playable.params,
        { arrangements_has: 'Lead,Rhythm,Bass', has_drums: '1' });
    assert.deepEqual(byId(pickFilters({ parts: ALL_OFF })).playable.params, {});
    const vocalsOnly = { guitar: { on: false }, drums: { on: false }, vocals: { on: true } };
    assert.deepEqual(byId(pickFilters({ parts: vocalsOnly })).playable.params, { has_lyrics: 'pitch' });
    const all = { guitar: { on: true }, drums: { on: true }, vocals: { on: true } };
    assert.deepEqual(byId(pickFilters({ parts: all })).playable.params,
        { arrangements_has: 'Lead,Rhythm,Bass', has_drums: '1', has_lyrics: 'pitch' });
    // on must be strictly true: a truthy 1 is not a part that's on.
    assert.deepEqual(byId(pickFilters({ parts: { guitar: { on: 1 } } })).playable.params, {});
});

test("each chip's own params", () => {
    const f = byId(pickFilters({ parts: ALL_OFF }));
    assert.deepEqual(f.drumStem.params, { stems_has: 'drums' });
    assert.deepEqual(f.drums.params, { has_drums: '1' });
    assert.deepEqual(f.vocals.params, { has_lyrics: 'pitch' });
    assert.deepEqual(f.guitar.params, { arrangements_has: 'Lead,Rhythm,Bass' });
});

test('on comes from the stored flags', () => {
    const f = byId(pickFilters({ on: { playable: true, drumStem: 1 } }));
    assert.equal(f.playable.on, true);
    assert.equal(f.drumStem.on, true);
    assert.equal(f.drums.on, false);
    assert.equal(f.vocals.on, false);
    assert.equal(f.guitar.on, false);
});

test('the removed exports are gone', () => {
    assert.equal(query.buildLibraryQuery, undefined);
    assert.equal(query.createSearchController, undefined);
    assert.equal(query.DEFAULT_FILTERS, undefined);
});

test('songChips', () => {
    const chips = songChips({ has_drum_tab: true, stem_ids: ['drums'], has_vocal_pitch: false,
        arrangements: [{ name: 'Lead' }, { name: 'Bass' }] });
    assert.deepEqual(chips.map((c) => [c.id, c.good]),
        [['drumChart', true], ['drumStem', true], ['vocalPitch', false], ['arrangements', true], ['fiveFret', false]]);
    assert.equal(chips[3].label, 'Lead · Bass');
});

test('songChips 5-fret chip', () => {
    const find = (item, o) => songChips(item, o).find((c) => c.id === 'fiveFret');
    assert.equal(songChips({}).at(-1).id, 'fiveFret');
    const none = find({});
    assert.deepEqual([none.label, none.good], ['No 5-fret parts', false]);
    const item = { five_fret_parts: ['bass:auto', 'guitar:chart', 'rhythm:auto'] };
    assert.deepEqual([find(item, { showAuto: true }).label, find(item, { showAuto: true }).good], ['5-fret: Lead · Rhythm (auto) · Bass (auto)', true]);
    assert.equal(find(item).label, '5-fret: Lead');
    assert.equal(find({ five_fret_parts: ['bass:auto'] }).label, 'No 5-fret parts');
    assert.equal(find({ five_fret_parts: ['bass:auto'], }, { showAuto: true }).label, '5-fret: Bass (auto)');
    assert.equal(find({ five_fret_parts: ['bass:auto', 'bass:chart'] }, { showAuto: true }).label, '5-fret: Bass');
});

test('songChips on an item from an older core', () => {
    const chips = songChips({ arrangements: [{ name: 'Drums' }] });
    assert.equal(chips.find((c) => c.id === 'drumChart').good, true);
    assert.equal(chips.find((c) => c.id === 'vocalPitch').good, false);
});

test('resolveRecent finds the song by filename, or null', async () => {
    let url;
    const fetchJson = async (u) => { url = u; return { songs: [{ filename: 'x' }, { filename: 'y', title: 'Y' }] }; };
    assert.equal((await resolveRecent({ filename: 'y', title: 'A & B' }, fetchJson)).title, 'Y');
    assert.equal(url, '/api/library?q=A%20%26%20B&size=30');
    assert.equal(await resolveRecent({ filename: 'nope', title: 't' }, fetchJson), null);
    assert.equal(await resolveRecent({ filename: 'y', title: 't' }, async () => { throw new Error('x'); }), null);
});
