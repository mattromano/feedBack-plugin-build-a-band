import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES, getPart, songFacts, hasChart, fiveFretPartFor, FIVE_FRET_PART } from '../src/parts.js';

test('registry order and kinds', () => {
    assert.deepEqual(PART_TYPES.map((p) => [p.id, p.inputKind]),
        [['guitar', 'audio'], ['drums', 'midi'], ['vocals', 'mic']]);
    assert.equal(getPart('drums').label, 'Drums');
    assert.equal(getPart('nope'), null);
});

test('songFacts reads library items and currentSong', () => {
    assert.deepEqual(songFacts({ has_drum_tab: true, has_vocal_pitch: true, stem_ids: ['drums'] }),
        { arrangements: [], hasDrumTab: true, hasVocalPitch: true, stemIds: ['drums'], fiveFret: [], fiveFretOnly: false });
    assert.equal(songFacts({ hasDrumTab: true }).hasDrumTab, true);
    assert.deepEqual(songFacts(null),
        { arrangements: [], hasDrumTab: false, hasVocalPitch: false, stemIds: [], fiveFret: [], fiveFretOnly: false });
});

test('hasChart', () => {
    const g = getPart('guitar'), d = getPart('drums'), v = getPart('vocals');
    const drumsChart = (x) => d.chartFrom(x);
    assert.equal(hasChart(g, { arrangements: [{ name: 'Lead' }] }), true);
    assert.equal(hasChart(g, { arrangements: [{ name: 'Drums' }] }), false);
    assert.equal(hasChart(d, { arrangements: [{ name: 'Drums' }] }), true);
    assert.equal(hasChart(d, { has_drum_tab: true, arrangements: [{ name: 'Lead' }] }), true);
    assert.equal(hasChart(d, { has_drum_tab: true, arrangements: [{ name: 'Lead' }, { name: 'Kit' }] }), true);
    assert.equal(drumsChart({ has_drum_tab: true, arrangements: [{ name: 'Lead' }, { name: 'Kit' }] }), 1);
    assert.equal(drumsChart({ hasDrumTab: true, arrangements: [{ name: 'Lead' }, { name: 'Kit' }] }), 1);
    assert.equal(hasChart(v, { has_vocal_pitch: false }), false);
});

test('songFacts reads five_fret_parts from library items and song info', () => {
    assert.deepEqual(songFacts({ five_fret_parts: ['bass:chart', 'guitar:auto', 'rhythm', 7] }).fiveFret,
        [{ instrument: 'bass', kind: 'chart' }, { instrument: 'guitar', kind: 'auto' }, { instrument: 'rhythm', kind: 'chart' }]);
    assert.deepEqual(songFacts({ five_fret_parts: [{ id: 'p1', instrument: 'guitar', source_kind: 'auto' }, { instrument: 3 }, null] }).fiveFret,
        [{ instrument: 'guitar', kind: 'auto' }]);
    assert.deepEqual(songFacts({ fiveFretParts: [{ instrument: 'bass', source_kind: 'chart' }] }).fiveFret,
        [{ instrument: 'bass', kind: 'chart' }]);
    assert.deepEqual(songFacts({}).fiveFret, []);
    assert.deepEqual(songFacts(null).fiveFret, []);
});

test('fiveFretPartFor falls back to a part the song has, null with none', () => {
    const song = { five_fret_parts: ['guitar:chart', 'rhythm:chart'] };
    assert.deepEqual(fiveFretPartFor(song, { part: 'rhythm' }), { instrument: 'rhythm', kind: 'chart' });
    assert.deepEqual(fiveFretPartFor(song, { part: 'bass' }), { instrument: 'guitar', kind: 'chart' }, 'Lead, Bass, Rhythm order');
    assert.deepEqual(fiveFretPartFor({ five_fret_parts: ['rhythm:chart', 'bass:chart'] }, { part: 'guitar' }),
        { instrument: 'bass', kind: 'chart' });
    assert.equal(fiveFretPartFor({ five_fret_parts: [] }, { part: 'guitar' }), null);
    assert.equal(fiveFretPartFor({}, { part: 'guitar' }), null);
    assert.equal(fiveFretPartFor(null, null), null);
    assert.deepEqual(fiveFretPartFor({ five_fret_parts: ['bass:auto', 'bass:chart'] }, { part: 'bass' }, { showAuto: true }),
        { instrument: 'bass', kind: 'chart' }, 'a real chart beats an auto one');
});

test('fiveFretPartFor ignores auto parts unless showAuto', () => {
    const song = { five_fret_parts: ['bass:auto', 'guitar:chart'] };
    assert.deepEqual(fiveFretPartFor(song, { part: 'bass' }), { instrument: 'guitar', kind: 'chart' });
    assert.deepEqual(fiveFretPartFor(song, { part: 'bass' }, { showAuto: true }), { instrument: 'bass', kind: 'auto' });
    assert.equal(fiveFretPartFor({ five_fret_parts: ['bass:auto'] }, { part: 'bass' }), null);
    assert.deepEqual(fiveFretPartFor({ five_fret_parts: ['bass:auto'] }, { part: 'bass' }, { showAuto: true }),
        { instrument: 'bass', kind: 'auto' });
});

test('a 5-fret-only pack (five_fret_only) has no guitar arrangement', () => {
    const placeholder = { arrangements: [{ index: 0, name: 'Lead', notes: 0 }], five_fret_only: true, five_fret_parts: ['guitar:chart'] };
    assert.equal(songFacts(placeholder).fiveFretOnly, true);
    assert.equal(hasChart(getPart('guitar'), placeholder, { arrangement: 'Lead' }), false);
    assert.equal(guitarFrom(placeholder), undefined);
    const real = { arrangements: [{ index: 0, name: 'Lead', notes: 0 }], five_fret_only: false };
    assert.equal(songFacts(real).fiveFretOnly, false);
    assert.equal(hasChart(getPart('guitar'), real, { arrangement: 'Lead' }), true);
    assert.equal(songFacts({}).fiveFretOnly, false);
});

test('FIVE_FRET_PART describes the controller part', () => {
    assert.deepEqual(FIVE_FRET_PART, {
        id: 'five_fret', inputKind: 'five_fret_controller', label: '5-Fret', icon: 'gamepad-2',
        color: '#2ecc40', difficulties: ['easy', 'medium', 'hard', 'expert'],
    });
    assert.equal(PART_TYPES.length, 3);
});

function guitarFrom(item) { return getPart('guitar').chartFrom(item, { arrangement: 'Lead' }); }
