import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStage } from '../src/stage.js';

test('planStage with drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] }),
        { lanes: ['guitar', 'drums'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage without drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }] }),
        { lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage missing arrangements', () => {
    assert.deepEqual(planStage({}), { lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage tolerates a null song', () => {
    assert.deepEqual(planStage(null), { lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage drums off', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: true }, drums: { on: false } }),
    { lanes: ['guitar'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage guitar off', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: false }, drums: { on: true } }),
    { lanes: [], drumIndex: 1, laneArrangement: 1 });
});

test('planStage uses hasDrumTab to find an oddly named drum arrangement', () => {
    const arrangements = [{ name: 'Lead' }, { name: 'Kit' }];
    assert.deepEqual(planStage({ arrangements }).drumIndex, -1);
    assert.deepEqual(planStage({ arrangements, hasDrumTab: true }),
        { lanes: ['guitar', 'drums'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage uses the arrangement index, not the list position', () => {
    const song = { arrangements: [{ index: 0, name: 'Lead' }, { index: 4, name: 'Drums' }] };
    assert.deepEqual(planStage(song), { lanes: ['guitar', 'drums'], drumIndex: 4, laneArrangement: 4 });
});

// A drum chart carried only as a song-level drum_tab: core streams it on every
// arrangement's WS, so the lane opens the guitar arrangement the main highway
// is on and the drums renderer draws the tab.
test('planStage gives a drum-tab-only song a drum lane on the current guitar arrangement', () => {
    const song = { arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Rhythm' }],
        hasDrumTab: true, arrangementIndex: 1 };
    assert.deepEqual(planStage(song), { lanes: ['guitar', 'drums'], drumIndex: -1, laneArrangement: 1 });
    assert.deepEqual(planStage({ ...song, arrangementIndex: undefined }),
        { lanes: ['guitar', 'drums'], drumIndex: -1, laneArrangement: undefined });
    assert.deepEqual(planStage(song, { guitar: { on: true }, drums: { on: false } }).lanes, ['guitar']);
});
