import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStage } from '../src/stage.js';

test('planStage with drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] }),
        { strip: false, mainPart: 'guitar', lanes: ['guitar', 'drums'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage without drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }] }),
        { strip: false, mainPart: 'guitar', lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage missing arrangements', () => {
    assert.deepEqual(planStage({}), { strip: false, mainPart: 'guitar', lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage tolerates a null song', () => {
    assert.deepEqual(planStage(null), { strip: false, mainPart: 'guitar', lanes: ['guitar'], drumIndex: -1, laneArrangement: undefined });
});

test('planStage drums off', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: true }, drums: { on: false } }),
    { strip: false, mainPart: 'guitar', lanes: ['guitar'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage guitar off', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: false }, drums: { on: true } }),
    { strip: false, mainPart: 'drums', lanes: ['drums'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage with no playable lane gives no main part and no lanes', () => {
    const off = { guitar: { on: false }, drums: { on: true }, vocals: { on: false } };
    const p = planStage({ arrangements: [{ name: 'Lead' }] }, off);
    assert.deepEqual({ mainPart: p.mainPart, lanes: p.lanes }, { mainPart: null, lanes: [] });
    const q = planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: false }, drums: { on: false }, vocals: { on: false } });
    assert.deepEqual({ mainPart: q.mainPart, lanes: q.lanes }, { mainPart: null, lanes: [] });
});

test('planStage uses hasDrumTab to find an oddly named drum arrangement', () => {
    const arrangements = [{ name: 'Lead' }, { name: 'Kit' }];
    assert.deepEqual(planStage({ arrangements }).drumIndex, -1);
    assert.deepEqual(planStage({ arrangements, hasDrumTab: true }),
        { strip: false, mainPart: 'guitar', lanes: ['guitar', 'drums'], drumIndex: 1, laneArrangement: 1 });
});

test('planStage uses the arrangement index, not the list position', () => {
    const song = { arrangements: [{ index: 0, name: 'Lead' }, { index: 4, name: 'Drums' }] };
    assert.deepEqual(planStage(song), { strip: false, mainPart: 'guitar', lanes: ['guitar', 'drums'], drumIndex: 4, laneArrangement: 4 });
});

// A drum chart carried only as a song-level drum_tab: core streams it on every
// arrangement's WS, so the lane opens the guitar arrangement the main highway
// is on and the drums renderer draws the tab.
test('planStage gives a drum-tab-only song a drum lane on the current guitar arrangement', () => {
    const song = { arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Rhythm' }],
        hasDrumTab: true, arrangementIndex: 1 };
    assert.deepEqual(planStage(song), { strip: false, mainPart: 'guitar', lanes: ['guitar', 'drums'], drumIndex: -1, laneArrangement: 1 });
    assert.deepEqual(planStage({ ...song, arrangementIndex: undefined }),
        { strip: false, mainPart: 'guitar', lanes: ['guitar', 'drums'], drumIndex: -1, laneArrangement: undefined });
    assert.deepEqual(planStage(song, { guitar: { on: true }, drums: { on: false } }).lanes, ['guitar']);
});

test('planStage puts the strip on only for vocals switched on', () => {
    const song = { arrangements: [{ name: 'Lead' }] };
    const plain = planStage(song);
    assert.equal(plain.strip, false);
    assert.equal(plain.mainPart, 'guitar');
    assert.equal(planStage(song, { guitar: { on: true }, drums: { on: true }, vocals: { on: false } }).strip, false);
    assert.equal(planStage(song, { guitar: { on: true }, drums: { on: true }, vocals: { on: true } }).strip, true);
});

test('planStage vocals alone', () => {
    const p = planStage({ arrangements: [{ name: 'Lead' }] },
        { guitar: { on: false }, drums: { on: false }, vocals: { on: true } });
    assert.deepEqual({ strip: p.strip, mainPart: p.mainPart, lanes: p.lanes }, { strip: true, mainPart: null, lanes: [] });
});

test('planStage drums only with vocals puts the main highway in the drums lane', () => {
    const p = planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: false }, drums: { on: true }, vocals: { on: true } });
    assert.deepEqual({ strip: p.strip, mainPart: p.mainPart, lanes: p.lanes, drumIndex: p.drumIndex },
        { strip: true, mainPart: 'drums', lanes: ['drums'], drumIndex: 1 });
});

test('planStage drums alone gets the drums lane on the main highway', () => {
    const p = planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] },
        { guitar: { on: false }, drums: { on: true }, vocals: { on: false } });
    assert.deepEqual({ strip: p.strip, mainPart: p.mainPart, lanes: p.lanes }, { strip: false, mainPart: 'drums', lanes: ['drums'] });
});

test('controllers on add lanes after the real ones; controllers only hide the main highway', () => {
    const song = { arrangements: [{ name: 'Lead' }, { name: 'Drums' }] };
    const ctls = [
        { key: 'pad#1', id: 'ctl1', on: true },
        { key: 'pad#2', id: 'ctl2', on: false },
        { key: 'gtr#1', id: 'ctl3', on: true },
    ];
    assert.deepEqual(planStage(song, undefined, ctls).lanes, ['guitar', 'drums', 'ctl1', 'ctl3']);
    assert.equal(planStage(song, undefined, ctls).mainPart, 'guitar');
    const drumsOnly = planStage(song, { guitar: { on: false }, drums: { on: true } }, ctls);
    assert.deepEqual({ mainPart: drumsOnly.mainPart, lanes: drumsOnly.lanes }, { mainPart: 'drums', lanes: ['drums', 'ctl1', 'ctl3'] });
    const alone = planStage(song, { guitar: { on: false }, drums: { on: false }, vocals: { on: true } }, ctls);
    assert.deepEqual({ strip: alone.strip, mainPart: alone.mainPart, lanes: alone.lanes },
        { strip: true, mainPart: null, lanes: ['ctl1', 'ctl3'] });
    // Without controllers (or with none on) the plan is unchanged.
    assert.deepEqual(planStage(song, undefined, []), planStage(song));
    assert.deepEqual(planStage(song, undefined, [{ id: 'ctl1', on: false }, null]), planStage(song));
});
