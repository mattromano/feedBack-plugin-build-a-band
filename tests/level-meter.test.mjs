// Level meter: silent by construction. The fake AudioContext records every
// connect() so the tests can prove the analyser reaches no output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METER_CONSTRAINTS, rmsLevel, createLevelMeter } from '../src/level-meter.js';
import { makeTimers, flush } from './fake-dom.mjs';

function fakeAudio() {
    const connects = [];
    const contexts = [];
    class FakeAudioContext {
        constructor() {
            this.destination = { kind: 'destination' };
            this.sampleRate = 48000;
            this.currentTime = 0;
            this.closed = 0;
            this.analysers = [];
            contexts.push(this);
        }
        createAnalyser() {
            const a = {
                kind: 'analyser', fftSize: 2048, connectCalls: 0,
                connect: (t) => { a.connectCalls++; connects.push({ from: a, to: t }); return t; },
                getFloatTimeDomainData(buf) { buf.fill(0.5); },
            };
            this.analysers.push(a);
            return a;
        }
        createMediaStreamSource(stream) {
            const s = { kind: 'source', stream, connect: (t) => { connects.push({ from: s, to: t }); return t; } };
            return s;
        }
        createGain() {
            const g = { kind: 'gain', connect: (t) => { connects.push({ from: g, to: t }); return t; } };
            return g;
        }
        close() { this.closed++; return Promise.resolve(); }
    }
    return { FakeAudioContext, connects, contexts };
}

function fakeStream(n = 2) {
    const tracks = Array.from({ length: n }, () => ({ stopped: 0, stop() { this.stopped++; } }));
    return { tracks, getTracks: () => tracks };
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function setup({ gum, via = 'browser', frameSize } = {}) {
    const audio = fakeAudio();
    const timers = makeTimers();
    const levels = [];
    const states = [];
    const gumCalls = [];
    const stream = fakeStream();
    const mediaDevices = {
        getUserMedia: (c) => { gumCalls.push(c); return gum ? gum() : Promise.resolve(stream); },
    };
    const meter = createLevelMeter({
        deviceId: 'd1', via, mediaDevices, AudioContext: audio.FakeAudioContext,
        frameSize,
        onLevel: (...a) => levels.push(frameSize ? a : a[0]), onState: (s) => states.push(s),
        schedule: timers.setTimer, cancel: timers.clearTimer,
    });
    return { ...audio, timers, levels, states, gumCalls, stream, meter };
}

test('meter constraints turn off all processing', () => {
    assert.deepEqual(METER_CONSTRAINTS('d1'), {
        audio: { deviceId: { exact: 'd1' }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
});

test('rmsLevel is 0 for silence and the RMS of the buffer, clamped to 1', () => {
    assert.equal(rmsLevel(new Float32Array(8)), 0);
    assert.equal(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5);
    assert.equal(rmsLevel(new Float32Array([2, -2])), 1);
    assert.equal(rmsLevel(new Float32Array(0)), 0);
});

test('the analyser is never connected to the destination or anything else', async () => {
    const t = setup();
    await flush();
    assert.deepEqual(t.gumCalls, [METER_CONSTRAINTS('d1')]);
    assert.equal(t.contexts.length, 1);
    const ctx = t.contexts[0];
    const analyser = ctx.analysers[0];
    t.timers.run();
    t.timers.run();
    t.timers.run();
    assert.deepEqual(t.levels, [0.5, 0.5, 0.5]);
    assert.deepEqual(t.states, ['live']);
    assert.equal(analyser.connectCalls, 0, 'analyser.connect was called');
    assert.equal(t.connects.length, 1, 'only the mic source is connected');
    assert.equal(t.connects[0].from.kind, 'source');
    assert.equal(t.connects[0].to, analyser);
    for (const c of t.connects) assert.notEqual(c.to, ctx.destination);
    t.meter.stop();
});

test('stop stops every track and closes the context, once', async () => {
    const t = setup();
    await flush();
    assert.equal(t.timers.pending(), 1);
    t.meter.stop();
    t.meter.stop();
    assert.deepEqual(t.stream.tracks.map((x) => x.stopped), [1, 1]);
    assert.equal(t.contexts[0].closed, 1);
    assert.equal(t.timers.pending(), 0, 'frame cancelled');
    t.timers.run();
    assert.equal(t.levels.length, 0);
});

test('stop before permission resolves still stops the late stream', async () => {
    const d = deferred();
    const t = setup({ gum: () => d.promise });
    await flush();
    t.meter.stop();
    const late = fakeStream(3);
    d.resolve(late);
    await flush();
    assert.deepEqual(late.tracks.map((x) => x.stopped), [1, 1, 1]);
    assert.equal(t.contexts.length, 0, 'no context opened after stop');
    assert.deepEqual(t.states, []);
    assert.equal(t.timers.pending(), 0);
});

test('denied permission reports no-access', async () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
        const t = setup({ gum: () => Promise.reject(Object.assign(new Error('no'), { name })) });
        await flush();
        assert.deepEqual(t.states, ['no-access'], name);
        assert.equal(t.contexts.length, 0);
        t.meter.stop();
    }
    const other = setup({ gum: () => Promise.reject(Object.assign(new Error('gone'), { name: 'OverconstrainedError' })) });
    await flush();
    assert.deepEqual(other.states, ['check-in-game']);
    other.meter.stop();
});

test('a desktop session source reports check-in-game without opening the mic', async () => {
    const t = setup({ via: 'session' });
    await flush();
    assert.deepEqual(t.states, ['check-in-game']);
    assert.equal(t.gumCalls.length, 0);
    assert.equal(t.contexts.length, 0);
    t.meter.stop();
    t.meter.stop();
});

test('frameSize sets the analyser and paces readings', async () => {
    const t = setup({ frameSize: 2048 });
    await flush();
    const ctx = t.contexts[0];
    const analyser = ctx.analysers[0];
    assert.equal(analyser.fftSize, 2048);
    for (let f = 0; f <= 9; f++) {
        ctx.currentTime = f / 60;
        t.timers.run();
    }
    assert.equal(t.levels.length, 4, 'frames 0, 3, 6 and 9');
    assert.deepEqual(t.levels.map((l) => l[0]), [0.5, 0.5, 0.5, 0.5]);
    assert.deepEqual(t.levels.map((l) => l[1]), [0, 3 / 60, 6 / 60, 9 / 60], 'each reading carries the ctx time');
    assert.equal(analyser.connectCalls, 0, 'analyser.connect was called');
    for (const c of t.connects) assert.notEqual(c.to, ctx.destination);
    t.meter.stop();
});

test('without frameSize the analyser and reading rate are unchanged', async () => {
    const t = setup();
    await flush();
    const ctx = t.contexts[0];
    assert.equal(ctx.analysers[0].fftSize, 1024);
    for (let f = 0; f < 4; f++) { ctx.currentTime = f / 60; t.timers.run(); }
    assert.deepEqual(t.levels, [0.5, 0.5, 0.5, 0.5]);
    t.meter.stop();
});
