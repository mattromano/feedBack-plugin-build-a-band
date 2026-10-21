import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLaneClock } from '../src/lane-clock.js';

function fakeHw(fn) {
    const calls = [];
    return { calls, setTime: (t) => { calls.push(t); if (fn) fn(t); } };
}
function manual() {
    const s = { pending: null, cancelled: [], n: 0 };
    s.schedule = (fn) => { s.pending = fn; return ++s.n; };
    s.cancel = (h) => { s.cancelled.push(h); s.pending = null; };
    return s;
}

test('one getTime per tick shared by all lanes', () => {
    let n = 0;
    const clock = createLaneClock({ getTime: () => { n++; return 4.5; } });
    const a = fakeHw(), b = fakeHw();
    clock.add(a); clock.add(b);
    clock.tick();
    assert.deepEqual(a.calls, [4.5]);
    assert.deepEqual(b.calls, [4.5]);
    assert.equal(n, 1);
});

test('remove stops updates', () => {
    const clock = createLaneClock({ getTime: () => 1 });
    const a = fakeHw(), b = fakeHw();
    clock.add(a); clock.add(b);
    clock.remove(a);
    clock.tick();
    assert.equal(a.calls.length, 0);
    assert.equal(b.calls.length, 1);
});

test("throwing lane doesn't block others", () => {
    const clock = createLaneClock({ getTime: () => 2 });
    const bad = fakeHw(() => { throw new Error('boom'); });
    const good = fakeHw();
    clock.add(bad); clock.add(good);
    assert.doesNotThrow(() => clock.tick());
    assert.deepEqual(good.calls, [2]);
});

test('stop cancels the scheduled frame', () => {
    const s = manual();
    const clock = createLaneClock({ getTime: () => 0, schedule: s.schedule, cancel: s.cancel });
    clock.start();
    clock.start(); // idempotent
    assert.equal(s.n, 1);
    clock.stop();
    assert.deepEqual(s.cancelled, [1]);
    assert.equal(s.pending, null);
});

test('start loops via schedule until stopped', () => {
    const s = manual();
    const hw = fakeHw();
    const clock = createLaneClock({ getTime: () => 3, schedule: s.schedule, cancel: s.cancel });
    clock.add(hw);
    clock.start();
    s.pending();
    s.pending();
    assert.equal(hw.calls.length, 2);
    assert.equal(s.n, 3);
});
