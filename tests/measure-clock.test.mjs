import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasureClock } from '../src/measure-clock.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// Beats every 0.5 s; every 4th beat is a downbeat numbered 0, 1, 2 (others -1).
const beats = (n = 9) => Array.from({ length: n }, (_, i) => ({ time: i * 0.5, measure: i % 4 === 0 ? i / 4 : -1 }));

test('downbeats map to whole measures', () => {
    const c = createMeasureClock(beats());
    assert.equal(c.measureAt(0), 0);
    assert.equal(c.measureAt(2), 1);
    assert.equal(c.measureAt(3), 1.5);
    assert.equal(c.measureAt(4), 2);
    assert.equal(c.timeAtMeasure(2), 4);
    assert.equal(c.timeAtMeasure(0.5), 1);
});

test('extrapolates past the last downbeat', () => {
    const c = createMeasureClock(beats());
    assert.equal(c.measureAt(6), 3);
    assert.equal(c.measureAt(20), 10);
    assert.equal(c.timeAtMeasure(10), 20);
    assert.equal(c.measureAt(-2), -1);
    assert.equal(c.timeAtMeasure(-1), -2);
});

test('no measure marks: every 4th beat', () => {
    // 1 s beats with no downbeat marks: a measure is 4 beats = 4 s.
    const c = createMeasureClock(Array.from({ length: 6 }, (_, i) => ({ time: 1 + i, measure: -1 })));
    assert.equal(c.measureAt(1), 0);
    assert.equal(c.measureAt(5), 1);
    near(c.measureAt(3), 0.5);
    assert.equal(c.measureAt(13), 3);
    assert.equal(c.timeAtMeasure(2), 9);
    // A single downbeat is not enough: falls back to every 4th beat too.
    const one = createMeasureClock([{ time: 0, measure: 0 }, { time: 0.5 }, { time: 1 }, { time: 1.5 }, { time: 2 }]);
    assert.equal(one.measureAt(2), 1);
});

test('no beats: 2 s per measure', () => {
    for (const b of [[], null, undefined, [{ time: 3, measure: 0 }], [{ time: NaN }, { time: 'x' }]]) {
        const c = createMeasureClock(b);
        assert.equal(c.measureAt(6), 3);
        assert.equal(c.timeAtMeasure(3), 6);
    }
});

test('unsorted beats and bad times are tolerated', () => {
    const b = beats().reverse();
    b.push({ time: NaN, measure: 5 }, null);
    const c = createMeasureClock(b);
    assert.equal(c.measureAt(3), 1.5);
});
