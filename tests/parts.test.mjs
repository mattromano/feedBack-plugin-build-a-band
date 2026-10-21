import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES, getPart, songFacts, hasChart } from '../src/parts.js';

test('registry order and kinds', () => {
    assert.deepEqual(PART_TYPES.map((p) => [p.id, p.inputKind]),
        [['guitar', 'audio'], ['drums', 'midi'], ['vocals', 'mic']]);
    assert.equal(getPart('drums').label, 'Drums');
    assert.equal(getPart('nope'), null);
});

test('songFacts reads library items and currentSong', () => {
    assert.deepEqual(songFacts({ has_drum_tab: true, has_vocal_pitch: true, stem_ids: ['drums'] }),
        { arrangements: [], hasDrumTab: true, hasVocalPitch: true, stemIds: ['drums'] });
    assert.equal(songFacts({ hasDrumTab: true }).hasDrumTab, true);
    assert.deepEqual(songFacts(null),
        { arrangements: [], hasDrumTab: false, hasVocalPitch: false, stemIds: [] });
});

test('hasChart', () => {
    const g = getPart('guitar'), d = getPart('drums'), v = getPart('vocals');
    assert.equal(hasChart(g, { arrangements: [{ name: 'Lead' }] }), true);
    assert.equal(hasChart(g, { arrangements: [{ name: 'Drums' }] }), false);
    assert.equal(hasChart(d, { arrangements: [{ name: 'Drums' }] }), true);
    assert.equal(hasChart(d, { has_drum_tab: true, arrangements: [{ name: 'Lead' }] }), true);
    assert.equal(hasChart(v, { has_vocal_pitch: false }), false);
});
