import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJoinManager } from '../src/join.js';

const flush = () => new Promise((r) => setImmediate(r));
const BTN = { green: 0, red: 1, yellow: 2, blue: 3, orange: 4, strum: 5, back: 8, start: 9 };
const ACTION_OF = { 0: 'green', 1: 'red', 2: 'yellow', 3: 'blue', 4: 'orange', 5: 'strum_down', 9: 'pause' };

// Fakes. Times are seconds, like core's watch events.
function fakeInput() {
    const f = {
        pads: [], claims: new Map(), watchers: [], changeFns: [], claimCalls: [], released: [],
        watch(fn) { f.watchers.push(fn); return () => { f.watchers = f.watchers.filter((w) => w !== fn); }; },
        on(name, fn) { f.changeFns.push(fn); return () => { f.changeFns = f.changeFns.filter((w) => w !== fn); }; },
        claim(index, owner) {
            f.claimCalls.push({ index, owner });
            const pad = f.pads[index];
            if (!pad || !pad.connected || pad.claimedBy) return null;
            pad.claimedBy = owner;
            const h = {
                index, controllerKey: pad.controllerKey, listeners: [],
                addListener(fn) { h.listeners.push(fn); }, removeListener(fn) { h.listeners = h.listeners.filter((l) => l !== fn); },
                release() { pad.claimedBy = null; f.claims.delete(pad.controllerKey); f.released.push(pad.controllerKey); },
            };
            f.claims.set(pad.controllerKey, h);
            return h;
        },
        press(pad, index, pressed, t = 1) { for (const w of [...f.watchers]) w({ pad, type: 'button', index, value: pressed ? 1 : 0, pressed, t }); },
        send(key, index, pressed, t = 1) { for (const l of [...f.claims.get(key).listeners]) l({ type: 'button', index, value: pressed ? 1 : 0, pressed, t }); },
        change() { for (const fn of [...f.changeFns]) fn({ type: 'connect', index: 0 }); },
    };
    return f;
}
const pad = (index, id, n, extra = {}) => ({
    index, controllerKey: `${id}#${n}`, id, mapping: 'standard', name: id.split(' (')[0], kind: 'gamepad',
    connected: true, claimedBy: null, ...extra,
});
function fakeFiveFret(input) {
    const api = {
        mapperCalls: [],
        listControllers: async () => input.pads.map((p) => ({ ...p })),
        createMapper: async (key) => {
            api.mapperCalls.push(key);
            const p = input.pads.find((x) => x.controllerKey === key);
            if (!p || p.kind === null) return null;
            return { map: (ev) => (ACTION_OF[ev.index] ? [{ action: ACTION_OF[ev.index], value: ev.pressed ? 1 : 0 }] : []) };
        },
    };
    return api;
}
function setup(pads, over = {}) {
    const input = fakeInput();
    input.pads = pads;
    const api = fakeFiveFret(input);
    const timers = [];
    const log = { join: [], leave: [], primary: [], light: [], change: 0 };
    const m = createJoinManager({
        gamepadInput: input, kinds: { five_fret: { api: () => api } },
        setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
        clearTimer: (h) => { if (timers[h]) timers[h].live = false; },
        onJoin: (j) => log.join.push(j), onLeave: (k) => log.leave.push(k), onPrimary: (k) => log.primary.push(k),
        onLight: (k, lit) => log.light.push([k, { ...lit }]), onChange: () => { log.change++; },
        ...over,
    });
    return { input, api, timers, log, m };
}

test('Start on an unclaimed set-up pad joins it and claims it', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true);
    assert.deepEqual(t.log.join, [{ controllerKey: 'Xbox#1', name: 'Xbox' }]);
    assert.deepEqual(t.input.claimCalls, [{ index: 0, owner: 'build_a_band' }]);
    assert.equal(t.input.pads[0].claimedBy, 'build_a_band');
});

test('a pad that needs setup never joins and is listed in needsSetup', async () => {
    const t = setup([pad(0, 'Mystery', 1, { kind: null, mapping: '' })]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true);
    assert.equal(t.log.join.length, 0);
    assert.deepEqual(t.m.status().needsSetup, [{ controllerKey: 'Mystery#1', name: 'Mystery' }]);
});

test('a joined pad lights frets and Start calls onPrimary, not onJoin', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start(['Xbox#1']);
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'build_a_band');
    t.input.send('Xbox#1', BTN.green, true);
    t.input.send('Xbox#1', BTN.orange, true);
    t.input.send('Xbox#1', BTN.strum, true);
    const last = t.log.light.at(-1);
    assert.equal(last[0], 'Xbox#1');
    assert.deepEqual(last[1], { green: true, red: false, yellow: false, blue: false, orange: true, strum: true });
    t.input.send('Xbox#1', BTN.green, false);
    assert.equal(t.log.light.at(-1)[1].green, false);
    t.input.send('Xbox#1', BTN.start, true);
    assert.deepEqual(t.log.primary, ['Xbox#1']);
    assert.equal(t.log.join.length, 0);
    t.input.send('Xbox#1', BTN.start, false);
    assert.equal(t.log.primary.length, 1);
});

test('holding Back 1 s leaves; a shorter hold does not', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start(['Xbox#1']);
    await flush();
    t.input.send('Xbox#1', BTN.back, true);
    assert.equal(t.timers.length, 1);
    assert.equal(t.timers[0].ms, 1000);
    t.input.send('Xbox#1', BTN.back, false);
    assert.equal(t.timers[0].live, false);
    assert.equal(t.log.leave.length, 0);
    t.input.send('Xbox#1', BTN.back, true);
    assert.equal(t.timers.length, 2);
    t.timers[1].fn();
    assert.deepEqual(t.log.leave, ['Xbox#1']);
    assert.equal(t.input.pads[0].claimedBy, null);
});

test('Back only leaves on a standard mapping', async () => {
    const t = setup([pad(0, 'Guitar', 1, { mapping: '', kind: 'guitar' })]);
    t.m.start(['Guitar#1']);
    await flush();
    t.input.send('Guitar#1', BTN.back, true);
    assert.equal(t.timers.length, 0);
});

test('two identical pads join as separate keys and light separately', async () => {
    const t = setup([pad(0, 'Xbox', 1), pad(1, 'Xbox', 2)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true, 1);
    t.input.press(1, BTN.start, true, 2);
    assert.deepEqual(t.log.join.map((j) => j.controllerKey), ['Xbox#1', 'Xbox#2']);
    t.input.send('Xbox#2', BTN.red, true);
    assert.deepEqual(t.log.light.at(-1), ['Xbox#2', { green: false, red: true, yellow: false, blue: false, orange: false, strum: false }]);
    t.input.send('Xbox#1', BTN.blue, true);
    const l = t.log.light.at(-1);
    assert.equal(l[0], 'Xbox#1');
    assert.equal(l[1].blue, true);
    assert.equal(l[1].red, false);
});

test('two mirrored slots, one join', async () => {
    const t = setup([pad(0, 'Xbox', 1), pad(1, 'Xbox', 2)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true, 10.000);
    t.input.press(1, BTN.start, true, 10.020);
    assert.deepEqual(t.log.join.map((j) => j.controllerKey), ['Xbox#1']);
});

test('two identical pads pressed more than 50 ms apart both join', async () => {
    const t = setup([pad(0, 'Xbox', 1), pad(1, 'Xbox', 2)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true, 10.000);
    t.input.press(1, BTN.start, true, 10.080);
    assert.equal(t.log.join.length, 2);
});

test('stop releases every claim; start re-claims the joined keys', async () => {
    const t = setup([pad(0, 'Xbox', 1), pad(1, 'Xbox', 2)]);
    t.m.start(['Xbox#1', 'Xbox#2']);
    await flush();
    t.input.send('Xbox#1', BTN.back, true);
    t.m.stop();
    assert.deepEqual(t.input.released.sort(), ['Xbox#1', 'Xbox#2']);
    assert.equal(t.input.watchers.length, 0);
    assert.equal(t.input.changeFns.length, 0);
    assert.equal(t.timers[0].live, false);
    t.m.stop();
    assert.equal(t.input.released.length, 2);
    t.m.start(['Xbox#1', 'Xbox#2']);
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'build_a_band');
    assert.equal(t.input.pads[1].claimedBy, 'build_a_band');
    t.m.start(['Xbox#1', 'Xbox#2']);
    await flush();
    assert.equal(t.input.watchers.length, 1);
});

test('a joined pad that disconnects is not connected; reconnecting re-claims it', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start(['Xbox#1']);
    await flush();
    assert.equal(t.m.status().connected.has('Xbox#1'), true);
    t.input.pads[0].connected = false;
    t.input.change();
    await flush();
    assert.equal(t.m.status().connected.has('Xbox#1'), false);
    assert.ok(t.log.change >= 1);
    t.input.pads[0].connected = true;
    t.input.pads[0].claimedBy = null;
    t.input.change();
    await flush();
    assert.equal(t.m.status().connected.has('Xbox#1'), true);
    assert.equal(t.input.pads[0].claimedBy, 'build_a_band');
    t.input.send('Xbox#1', BTN.yellow, true);
    assert.equal(t.log.light.at(-1)[1].yellow, true);
});

test('no watch or no five-fret API: status says why, nothing throws', async () => {
    const a = setup([pad(0, 'Xbox', 1)], { kinds: { five_fret: { api: () => null } } });
    a.m.start([]);
    await flush();
    assert.deepEqual([a.m.status().available, a.m.status().reason], [false, 'no-five-fret']);
    a.m.stop();

    const input = fakeInput();
    const b = createJoinManager({ gamepadInput: { list: () => [], claim: () => null }, kinds: { five_fret: { api: () => fakeFiveFret(input) } }, setTimer() {}, clearTimer() {} });
    b.start(['x#1']);
    await flush();
    assert.deepEqual([b.status().available, b.status().reason], [false, 'no-watch']);
    b.stop();

    const c = createJoinManager({ gamepadInput: null, kinds: {}, setTimer() {}, clearTimer() {} });
    c.start([]);
    assert.equal(c.status().available, false);
    c.stop();
});

test('input before a mapper resolves is ignored; rejected promises never throw', async () => {
    const input = fakeInput();
    input.pads = [pad(0, 'Xbox', 1)];
    let release;
    const gate = new Promise((r) => { release = r; });
    const api = {
        listControllers: async () => input.pads.map((p) => ({ ...p })),
        createMapper: async () => { await gate; return { map: () => [{ action: 'pause', value: 1 }] }; },
    };
    const joins = [];
    const m = createJoinManager({ gamepadInput: input, kinds: { five_fret: { api: () => api } }, setTimer() {}, clearTimer() {}, onJoin: (j) => joins.push(j) });
    m.start([]);
    await flush();
    input.press(0, BTN.start, true);
    assert.equal(joins.length, 0);
    release();
    await flush();
    input.press(0, BTN.start, false);
    input.press(0, BTN.start, true);
    assert.equal(joins.length, 1);

    const bad = createJoinManager({
        gamepadInput: input, kinds: { five_fret: { api: () => ({ listControllers: () => Promise.reject(new Error('x')), createMapper: () => Promise.reject(new Error('y')) }) } },
        setTimer() {}, clearTimer() {},
    });
    bad.start(['Xbox#1']);
    await flush();
    assert.equal(bad.status().connected.size, 0);
});

test('mappers are cached per key', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    await flush();
    t.input.change();
    await flush();
    t.input.change();
    await flush();
    assert.deepEqual(t.api.mapperCalls, ['Xbox#1']);
});

test('a mirrored Start right after a joined slot pressed Start is not a second join', async () => {
    const t = setup([pad(0, 'Xbox', 1), pad(1, 'Xbox', 2)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true, 10.0);
    t.input.send('Xbox#1', BTN.start, false, 10.1);
    t.input.send('Xbox#1', BTN.start, true, 20.000);
    t.input.press(1, BTN.start, true, 20.020);
    assert.deepEqual(t.log.primary, ['Xbox#1']);
    assert.deepEqual(t.log.join.map((j) => j.controllerKey), ['Xbox#1']);
});

test('a refresh while createMapper is pending does not drop the mapper', async () => {
    const input = fakeInput();
    input.pads = [pad(0, 'Xbox', 1)];
    let release;
    const gate = new Promise((r) => { release = r; });
    const api = {
        listControllers: async () => input.pads.map((p) => ({ ...p })),
        createMapper: async () => { await gate; return { map: (ev) => (ev.index === 0 ? [{ action: 'green', value: 1 }] : []) }; },
    };
    const lights = [];
    const m = createJoinManager({ gamepadInput: input, kinds: { five_fret: { api: () => api } }, setTimer() {}, clearTimer() {}, onLight: (k, l) => lights.push({ ...l }) });
    m.start(['Xbox#1']);
    await flush();
    input.change();
    await flush();
    release();
    await flush();
    input.send('Xbox#1', 0, true);
    assert.equal(lights.at(-1).green, true);
});
