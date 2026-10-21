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
    const clock = createLaneClock({ getTime: () => 2, warn: () => {} });
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

test("getTime throwing doesn't kill the loop", () => {
    const s = manual();
    let fail = true;
    const hw = fakeHw();
    const clock = createLaneClock({
        getTime: () => { if (fail) throw new Error('boom'); return 7; },
        schedule: s.schedule, cancel: s.cancel, warn: () => {},
    });
    clock.add(hw);
    clock.start();
    s.pending();
    assert.equal(hw.calls.length, 0);
    assert.equal(s.n, 2);
    fail = false;
    s.pending();
    assert.deepEqual(hw.calls, [7]);
    assert.equal(s.n, 3);
});

test('stop() inside a callback does not reschedule', () => {
    const s = manual();
    let clock;
    const hw = fakeHw(() => clock.stop());
    clock = createLaneClock({ getTime: () => 1, schedule: s.schedule, cancel: s.cancel });
    clock.add(hw);
    clock.start();
    s.pending();
    assert.equal(s.n, 1);
    assert.equal(s.pending, null);
});

test('stop() then start() inside a callback leaves exactly one loop', () => {
    const s = manual();
    let clock;
    let once = true;
    const hw = fakeHw(() => { if (once) { once = false; clock.stop(); clock.start(); } });
    clock = createLaneClock({ getTime: () => 1, schedule: s.schedule, cancel: s.cancel });
    clock.add(hw);
    clock.start();
    s.pending();
    assert.equal(s.n, 2); // only the restart scheduled; old frame did not
    s.pending();
    assert.equal(s.n, 3);
});

test('errors warn once per lane and once per getTime error kind', () => {
    const warned = [];
    let msg = 'no song time';
    let failTime = true;
    const clock = createLaneClock({
        getTime: () => { if (failTime) throw new Error(msg); return 1; },
        warn: (...a) => warned.push(a.map(String).join(' ')),
    });
    const bad1 = fakeHw(() => { throw new Error('lane 1 broke'); });
    const bad2 = fakeHw(() => { throw new Error('lane 2 broke'); });
    clock.add(bad1); clock.add(bad2);
    clock.tick(); clock.tick();
    assert.equal(warned.length, 1, 'getTime error warned once');
    assert.match(warned[0], /no song time/);
    msg = 'clock gone';
    clock.tick();
    assert.equal(warned.length, 2, 'a different getTime error warns again');
    failTime = false;
    clock.tick(); clock.tick(); clock.tick();
    assert.equal(warned.length, 4, 'one warning per failing lane');
    assert.match(warned[2], /lane 1 broke/);
    assert.match(warned[3], /lane 2 broke/);
});

test('without an injected warn, errors go to console.warn', (t) => {
    const calls = t.mock.method(console, 'warn', () => {});
    const clock = createLaneClock({ getTime: () => { throw new Error('x'); } });
    clock.tick();
    assert.equal(calls.mock.callCount(), 1);
});
