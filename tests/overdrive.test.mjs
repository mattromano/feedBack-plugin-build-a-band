import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasureClock } from '../src/measure-clock.js';
import { createOverdriveMeter } from '../src/overdrive.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// Beats every 0.5 s, a downbeat every 4th: 2 s measures.
const beats = Array.from({ length: 9 }, (_, i) => ({ time: i * 0.5, measure: i % 4 === 0 ? i / 4 : -1 }));
const meter = () => createOverdriveMeter({ clock: createMeasureClock(beats) });

test('quarter per gain, capped at a full bar', () => {
    const m = meter();
    m.gain(0);
    assert.deepEqual(m.stateAt(0), { fill: 0.25, active: false, ready: false });
    for (let i = 1; i < 5; i++) m.gain(i);
    assert.deepEqual(m.stateAt(5), { fill: 1, active: false, ready: true });
});

test('deploy needs half a bar', () => {
    const m = meter();
    m.gain(0);
    assert.equal(m.deploy(1), false);
    m.gain(1.5);
    assert.equal(m.deploy(2), true);
    assert.equal(m.isActiveAt(2), true);
    assert.equal(m.deploy(2.5), false);
});

test('a full bar drains over 8 measures', () => {
    const m = meter();
    for (let i = 0; i < 4; i++) m.gain(0);
    assert.equal(m.deploy(0), true);
    assert.deepEqual(m.stateAt(8), { fill: 0.5, active: true, ready: false });
    assert.equal(m.isActiveAt(15.9), true);
    assert.equal(m.isActiveAt(16.1), false);
    assert.equal(m.stateAt(20).fill, 0);
    assert.equal(m.stateAt(20).active, false);
    assert.equal(m.deploy(21), false);
});

test('a gain while active extends the end', () => {
    const m = meter();
    m.gain(0); m.gain(0);
    assert.equal(m.deploy(0), true);
    assert.equal(m.isActiveAt(7.9), true);
    m.gain(2);
    near(m.stateAt(2).fill, 0.625);
    assert.equal(m.isActiveAt(9), true);
    assert.equal(m.isActiveAt(11.9), true);
    assert.equal(m.isActiveAt(12.1), false);
});

test('rewindTo drops later gains and deploys', () => {
    const m = meter();
    m.gain(1); m.gain(2);
    assert.equal(m.deploy(3), true);
    m.rewindTo(2.5);
    assert.deepEqual(m.stateAt(4), { fill: 0.5, active: false, ready: true });
    m.rewindTo(1.5);
    assert.deepEqual(m.stateAt(4), { fill: 0.25, active: false, ready: false });
});

test('state is replayed at any asked time', () => {
    const m = meter();
    m.gain(1); m.gain(2); m.deploy(3);
    assert.deepEqual(m.stateAt(0.5), { fill: 0, active: false, ready: false });
    assert.deepEqual(m.stateAt(1.5), { fill: 0.25, active: false, ready: false });
    assert.equal(m.isActiveAt(2.9), false);
    assert.equal(m.isActiveAt(3), true);
});

test('an event earlier than the last is stored at the last time', () => {
    const m = meter();
    m.gain(5);
    m.gain(1);
    assert.equal(m.stateAt(4).fill, 0);
    assert.equal(m.stateAt(5).fill, 0.5);
});

test('reset empties the bar; bad input never gives NaN', () => {
    const m = meter();
    m.gain(0); m.gain(0); m.deploy(0);
    m.reset();
    assert.deepEqual(m.stateAt(1), { fill: 0, active: false, ready: false });
    m.gain(NaN);
    m.gain(1, NaN);
    const s = m.stateAt(NaN);
    assert.ok(Number.isFinite(s.fill));
    const bare = createOverdriveMeter({ clock: createMeasureClock([]) });
    bare.gain(0); bare.gain(0); bare.deploy(0);
    assert.equal(bare.isActiveAt(7.9), true);
    assert.equal(bare.isActiveAt(8.1), false);
    const noClock = createOverdriveMeter();
    noClock.gain(0); noClock.gain(0);
    assert.equal(noClock.deploy(0), true);
    assert.equal(noClock.isActiveAt(7.9), true);
});
