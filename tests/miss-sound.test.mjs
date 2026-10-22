// The Rock Band miss clunk, against a fake audio factory: nothing plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMissSound, MISS_SOUND_GAP_MS } from '../src/miss-sound.js';
import { makeFakeContext } from './fake-audio.mjs';

function setup(opts = {}) {
    const clock = { t: 1000 };
    const made = [];
    const audioFactory = () => { const c = makeFakeContext(opts); made.push(c); return c; };
    const ms = createMissSound({ audioFactory, now: () => clock.t });
    return { ms, clock, made };
}

test('a clunk: one context made lazily, a noise burst and a thump, short and quiet', () => {
    const { ms, made } = setup();
    assert.equal(made.length, 0, 'nothing before the first clunk');
    assert.equal(ms.play(), true);
    assert.equal(made.length, 1);
    const ctx = made[0];
    const kinds = ctx.nodes.map((n) => n.kind);
    assert.deepEqual(kinds.filter((k) => k === 'source' || k === 'osc'), ['source', 'osc']);
    assert.ok(kinds.includes('biquad'), 'filtered noise');
    const stops = ctx.log.filter((l) => l[0] === 'stop').map((l) => l[2] - ctx.currentTime);
    assert.ok(stops.every((d) => d >= 0.08 && d <= 0.16), `ends within ~150 ms (${stops})`);
    const master = ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(ctx.destination));
    assert.ok(master && master.gain.value > 0 && master.gain.value <= 0.25, 'a conservative volume');
});

test('rate limit: at most one clunk per ~90 ms, then the next plays on the same context', () => {
    const { ms, clock, made } = setup();
    assert.equal(ms.play(), true);
    clock.t += 30;
    assert.equal(ms.play(), false);
    clock.t += 30;
    assert.equal(ms.play(), false);
    clock.t += MISS_SOUND_GAP_MS;
    assert.equal(ms.play(), true);
    assert.equal(made.length, 1, 'one AudioContext');
    assert.equal(made[0].nodes.filter((n) => n.kind === 'osc').length, 2);
});

test('a suspended context is resumed', () => {
    const { ms, made } = setup({ state: 'suspended' });
    ms.play();
    assert.equal(made[0].resumed, 1);
});

test('no WebAudio: play answers false and never throws', () => {
    assert.equal(createMissSound({ win: {} }).play(), false);
    assert.equal(createMissSound({}).play(), false);
    let calls = 0;
    const throwing = createMissSound({ audioFactory: () => { calls++; throw new Error('no audio'); } });
    assert.equal(throwing.play(), false);
    assert.equal(throwing.play(), false);
    assert.equal(calls, 1, 'a failed factory is not retried on every miss');
    const broken = createMissSound({ audioFactory: () => ({ state: 'running', createGain() { throw new Error('x'); } }) });
    assert.equal(broken.play(), false);
});

test('the default factory reads win.AudioContext lazily', () => {
    const win = {};
    const ms = createMissSound({ win, now: () => 0 });
    let made = 0;
    win.AudioContext = function FakeCtx() { made++; return makeFakeContext(); };
    assert.equal(ms.play(), true);
    assert.equal(made, 1);
});
