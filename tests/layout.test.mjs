import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSplit, computeStageLayout, computeStageRows, splitFromPointer, CONTROLLER_LANE_PCT, CONTROLLER_SHARE_MAX } from '../src/layout.js';

test('clampSplit', () => {
    assert.equal(clampSplit(10), 35);
    assert.equal(clampSplit(95), 80);
    assert.equal(clampSplit(NaN), 62);
    assert.equal(clampSplit(70), 70);
});

test('two lanes', () => {
    assert.deepEqual(computeStageLayout({ lanes: ['guitar', 'drums'], split: 62 }), [
        { part: 'guitar', leftPct: 0, widthPct: 62 },
        { part: 'drums', leftPct: 62, widthPct: 38 },
    ]);
});

test('one lane fills', () => {
    assert.deepEqual(computeStageLayout({ lanes: ['guitar'], split: 62 }), [
        { part: 'guitar', leftPct: 0, widthPct: 100 },
    ]);
});

test('split is clamped inside layout', () => {
    assert.equal(computeStageLayout({ lanes: ['guitar', 'drums'], split: 99 })[0].widthPct, 80);
});

const near = (a, b) => assert.ok(Math.abs(a - b) <= 0.01, a + ' ~ ' + b);
const check = (got, want) => {
    assert.deepEqual(got.map((l) => l.part), want.map((w) => w[0]));
    got.forEach((l, i) => { near(l.leftPct, want[i][1]); near(l.widthPct, want[i][2]); });
};

test('controller lane constants', () => {
    assert.equal(CONTROLLER_LANE_PCT, 22);
    assert.equal(CONTROLLER_SHARE_MAX, 60);
});

test('guitar, drums and one controller', () => {
    check(computeStageLayout({ lanes: ['guitar', 'drums', 'ctl1'], split: 62 }),
        [['guitar', 0, 48.36], ['drums', 48.36, 29.64], ['ctl1', 78, 22]]);
});

test('four controllers beside two real lanes take 15% each', () => {
    check(computeStageLayout({ lanes: ['guitar', 'drums', 'ctl1', 'ctl2', 'ctl3', 'ctl4'], split: 50 }),
        [['guitar', 0, 20], ['drums', 20, 20], ['ctl1', 40, 15], ['ctl2', 55, 15], ['ctl3', 70, 15], ['ctl4', 85, 15]]);
    check(computeStageLayout({ lanes: ['guitar', 'ctl1', 'ctl2'], split: 62 }),
        [['guitar', 0, 56], ['ctl1', 56, 22], ['ctl2', 78, 22]]);
});

test('controllers alone share the row', () => {
    check(computeStageLayout({ lanes: ['ctl1', 'ctl2', 'ctl3'], split: 62 }),
        [['ctl1', 0, 100 / 3], ['ctl2', 100 / 3, 100 / 3], ['ctl3', 200 / 3, 100 / 3]]);
});

test('one controller fills', () => {
    assert.deepEqual(computeStageLayout({ lanes: ['ctl2'], split: 62 }), [{ part: 'ctl2', leftPct: 0, widthPct: 100 }]);
});

test('real lanes only are unchanged', () => {
    for (const split of [10, 35, 62, 70.5, 80, 99, NaN]) {
        const first = clampSplit(split);
        assert.deepEqual(computeStageLayout({ lanes: ['guitar', 'drums'], split }), [
            { part: 'guitar', leftPct: 0, widthPct: first },
            { part: 'drums', leftPct: first, widthPct: 100 - first },
        ]);
    }
    assert.deepEqual(computeStageLayout({ lanes: ['drums'], split: 62 }), [{ part: 'drums', leftPct: 0, widthPct: 100 }]);
    assert.deepEqual(computeStageLayout({ lanes: [], split: 62 }), []);
});

test('splitFromPointer', () => {
    // Real lanes only: the pointer is the split, clamped.
    assert.equal(splitFromPointer(70, ['guitar', 'drums']), 70);
    assert.equal(splitFromPointer(95, ['guitar', 'drums']), 80);
    assert.equal(splitFromPointer(5, ['guitar', 'drums']), 35);
    // One controller: the real region is 78% of the row.
    near(splitFromPointer(39, ['guitar', 'drums', 'ctl1']), 50);
    assert.equal(splitFromPointer(77, ['guitar', 'drums', 'ctl1']), 80);
    // Four controllers: the real region is 40%.
    near(splitFromPointer(24, ['guitar', 'drums', 'ctl1', 'ctl2', 'ctl3', 'ctl4']), 60);
    assert.equal(splitFromPointer(NaN, ['guitar', 'drums']), 62);
});

test('stage rows: none, strip over lanes, strip alone', () => {
    assert.deepEqual(computeStageRows({ strip: false, lanes: ['guitar'] }), { strip: null, lanesTopPx: 48 });
    assert.deepEqual(computeStageRows({ strip: true, lanes: ['guitar', 'drums'] }),
        { strip: { topPx: 48, heightPx: 90, fill: false }, lanesTopPx: 138 });
    assert.deepEqual(computeStageRows({ strip: true, lanes: [] }),
        { strip: { topPx: 48, heightPx: null, fill: true }, lanesTopPx: null });
});
