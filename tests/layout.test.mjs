import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSplit, computeStageLayout, computeStageRows } from '../src/layout.js';

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

test('throws on more than two lanes', () => {
    assert.throws(() => computeStageLayout({ lanes: ['a', 'b', 'c'], split: 50 }));
});

test('stage rows: none, strip over lanes, strip alone', () => {
    assert.deepEqual(computeStageRows({ strip: false, lanes: ['guitar'] }), { strip: null, lanesTopPx: 48 });
    assert.deepEqual(computeStageRows({ strip: true, lanes: ['guitar', 'drums'] }),
        { strip: { topPx: 48, heightPx: 90, fill: false }, lanesTopPx: 138 });
    assert.deepEqual(computeStageRows({ strip: true, lanes: [] }),
        { strip: { topPx: 48, heightPx: null, fill: true }, lanesTopPx: null });
});
