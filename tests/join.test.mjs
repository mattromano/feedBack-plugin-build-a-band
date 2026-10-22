import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJoinManager } from '../src/join.js';
import { CONTROLLER_KINDS } from '../src/controller-model.js';

const flush = () => new Promise((r) => setImmediate(r));
const BTN = { green: 0, red: 1, yellow: 2, blue: 3, orange: 4, strum: 5, back: 8, start: 9 };
const ACTION_OF = { 0: 'green', 1: 'red', 2: 'yellow', 3: 'blue', 4: 'orange', 5: 'strum_down', 9: 'pause' };
// The drums standard layout (Decision 2) plus three test cymbal buttons.
const DRUM = { kick: 0, red: 4, yellow: 5, blue: 6, green: 7, sp: 3, start: 9, yellowCym: 10, blueCym: 11, greenCym: 12, x: 2, b: 1, back: 8 };
const DRUM_ACTION_OF = {
    0: 'kick', 4: 'red_pad', 5: 'yellow_pad', 6: 'blue_pad', 7: 'green_pad', 3: 'star_power', 9: 'pause',
    10: 'yellow_cymbal', 11: 'blue_cymbal', 12: 'green_cymbal',
};
// A registry like CONTROLLER_KINDS with fake APIs: { five_fret: api, drums: api }.
const reg = (apis) => Object.fromEntries(Object.entries(apis).map(([k, api]) => [k, { ...CONTROLLER_KINDS[k], api: () => api }]));
const joinedAs = (playsAs, ...keys) => keys.map((key) => ({ key, playsAs }));

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
// The drums plugin's listing gives each pad its `drumsKind` ('gamepad' | 'kit' | null).
function fakeDrums(input) {
    const api = {
        mapperCalls: [],
        listControllers: async () => input.pads.map((p) => ({ ...p, kind: p.drumsKind === undefined ? null : p.drumsKind })),
        createMapper: async (key) => {
            api.mapperCalls.push(key);
            const p = input.pads.find((x) => x.controllerKey === key);
            if (!p || !p.drumsKind) return null;
            return { map: (ev) => (DRUM_ACTION_OF[ev.index] ? [{ action: DRUM_ACTION_OF[ev.index], value: ev.pressed ? 1 : 0 }] : []) };
        },
    };
    return api;
}
function setup(pads, over = {}, { fiveFret = true, drums = false } = {}) {
    const input = fakeInput();
    input.pads = pads;
    const api = fiveFret ? fakeFiveFret(input) : null;
    const drumsApi = drums ? fakeDrums(input) : null;
    const apis = {};
    if (fiveFret !== null) apis.five_fret = api;
    if (drums !== null) apis.drums = drumsApi;
    const timers = [];
    const log = { join: [], leave: [], primary: [], light: [], rawLit: [], playsAs: [], change: 0 };
    const m = createJoinManager({
        gamepadInput: input, kinds: reg(apis),
        setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
        clearTimer: (h) => { if (timers[h]) timers[h].live = false; },
        onJoin: (j) => log.join.push(j), onLeave: (k) => log.leave.push(k), onPrimary: (k) => log.primary.push(k),
        onPlaysAs: (k, kind) => log.playsAs.push([k, kind]),
        onLight: (k, lit) => { log.light.push([k, { ...lit }]); log.rawLit.push(lit); }, onChange: () => { log.change++; },
        ...over,
    });
    return { input, api, drumsApi, timers, log, m };
}

test('Start on an unclaimed set-up pad joins it and claims it', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true);
    assert.deepEqual(t.log.join, [{ controllerKey: 'Xbox#1', name: 'Xbox', kinds: ['five_fret'] }]);
    assert.deepEqual(t.input.claimCalls, [{ index: 0, owner: 'rockherosmith' }]);
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
});

test('a pad that needs setup never joins and is listed in needsSetup', async () => {
    const t = setup([pad(0, 'Mystery', 1, { kind: null, mapping: '' })]);
    t.m.start([]);
    await flush();
    t.input.press(0, BTN.start, true);
    assert.equal(t.log.join.length, 0);
    assert.deepEqual(t.m.status().needsSetup, [{ controllerKey: 'Mystery#1', name: 'Mystery', setupWith: ['five_fret'] }]);
});

test('a joined pad lights frets and Start calls onPrimary, not onJoin', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start(joinedAs('five_fret', 'Xbox#1'));
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
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
    t.m.start(joinedAs('five_fret', 'Xbox#1'));
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
    t.m.start(joinedAs('five_fret', 'Guitar#1'));
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
    t.m.start(joinedAs('five_fret', 'Xbox#1', 'Xbox#2'));
    await flush();
    t.input.send('Xbox#1', BTN.back, true);
    t.m.stop();
    assert.deepEqual(t.input.released.sort(), ['Xbox#1', 'Xbox#2']);
    assert.equal(t.input.watchers.length, 0);
    assert.equal(t.input.changeFns.length, 0);
    assert.equal(t.timers[0].live, false);
    t.m.stop();
    assert.equal(t.input.released.length, 2);
    t.m.start(joinedAs('five_fret', 'Xbox#1', 'Xbox#2'));
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
    assert.equal(t.input.pads[1].claimedBy, 'rockherosmith');
    t.m.start(joinedAs('five_fret', 'Xbox#1', 'Xbox#2'));
    await flush();
    assert.equal(t.input.watchers.length, 1);
});

test('a joined pad that disconnects is not connected; reconnecting re-claims it', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start(joinedAs('five_fret', 'Xbox#1'));
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
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
    t.input.send('Xbox#1', BTN.yellow, true);
    assert.equal(t.log.light.at(-1)[1].yellow, true);
});

test('no watch or no controller plugin: status says why, nothing throws', async () => {
    const a = setup([pad(0, 'Xbox', 1)], {}, { fiveFret: false });
    a.m.start([]);
    await flush();
    assert.deepEqual([a.m.status().available, a.m.status().reason], [false, 'no-controller-plugins']);
    a.m.stop();

    const input = fakeInput();
    const b = createJoinManager({ gamepadInput: { list: () => [], claim: () => null }, kinds: reg({ five_fret: fakeFiveFret(input) }), setTimer() {}, clearTimer() {} });
    b.start(joinedAs('five_fret', 'x#1'));
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
    const m = createJoinManager({ gamepadInput: input, kinds: reg({ five_fret: api }), setTimer() {}, clearTimer() {}, onJoin: (j) => joins.push(j) });
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
        gamepadInput: input, kinds: reg({ five_fret: { listControllers: () => Promise.reject(new Error('x')), createMapper: () => Promise.reject(new Error('y')) } }),
        setTimer() {}, clearTimer() {},
    });
    bad.start(joinedAs('five_fret', 'Xbox#1'));
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
    const m = createJoinManager({ gamepadInput: input, kinds: reg({ five_fret: api }), setTimer() {}, clearTimer() {}, onLight: (k, l) => lights.push({ ...l }) });
    m.start(joinedAs('five_fret', 'Xbox#1'));
    await flush();
    input.change();
    await flush();
    release();
    await flush();
    input.send('Xbox#1', 0, true);
    assert.equal(lights.at(-1).green, true);
});

// ── Plan 6: two instrument APIs ─────────────────────────────────────────
const both = { fiveFret: true, drums: true };

test('a kit set up only in drums joins with kinds [drums]', async () => {
    const t = setup([pad(0, 'Kit', 1, { kind: null, mapping: '', drumsKind: 'kit' })], {}, both);
    t.m.start([]);
    await flush();
    assert.deepEqual(t.m.status().kinds.get('Kit#1'), ['drums']);
    assert.deepEqual(t.m.status().needsSetup, []);
    t.input.press(0, DRUM.start, true);
    assert.deepEqual(t.log.join, [{ controllerKey: 'Kit#1', name: 'Kit', kinds: ['drums'] }]);
    assert.deepEqual(t.api.mapperCalls, [], 'no 5-Fret mapper for a kit');
    assert.deepEqual(t.drumsApi.mapperCalls, ['Kit#1']);
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
});

test('an Xbox pad joins with both kinds; X and B pick 5-Fret and Drums', async () => {
    const t = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' }), pad(1, 'Pad', 1, { mapping: '', drumsKind: 'gamepad' })], {}, both);
    t.m.start([]);
    await flush();
    assert.deepEqual(t.m.status().kinds.get('Xbox#1'), ['five_fret', 'drums']);
    t.input.press(0, BTN.start, true, 1);
    assert.deepEqual(t.log.join, [{ controllerKey: 'Xbox#1', name: 'Xbox', kinds: ['five_fret', 'drums'] }]);
    assert.deepEqual(t.api.mapperCalls.includes('Xbox#1'), true, 'undecided: the 5-Fret mapper hears Start');
    assert.deepEqual(t.drumsApi.mapperCalls, []);
    // Undecided: frets neither light nor pick; a release is not a press.
    t.input.send('Xbox#1', BTN.green, true);
    t.input.send('Xbox#1', DRUM.x, false);
    assert.deepEqual(t.log.light, []);
    assert.deepEqual(t.log.playsAs, []);
    t.input.send('Xbox#1', DRUM.x, true);
    assert.deepEqual(t.log.playsAs, [['Xbox#1', 'five_fret']]);
    t.input.send('Xbox#1', DRUM.b, true);
    assert.equal(t.log.playsAs.length, 1, 'asked once');
    // The screen stored nothing: still undecided after setJoined, B picks Drums.
    t.m.setJoined(joinedAs(null, 'Xbox#1'));
    t.input.send('Xbox#1', DRUM.b, false);
    t.input.send('Xbox#1', DRUM.b, true);
    assert.deepEqual(t.log.playsAs.at(-1), ['Xbox#1', 'drums']);
    // Decided pads are not asked: X is a fret again.
    t.m.setJoined(joinedAs('five_fret', 'Xbox#1'));
    await flush();
    t.input.send('Xbox#1', DRUM.x, true);
    assert.equal(t.log.playsAs.length, 2);
    assert.equal(t.log.light.at(-1)[1].yellow, true);
    // A pad without the standard mapping is never asked by button.
    t.input.press(1, BTN.start, true, 5);
    assert.deepEqual(t.log.join.at(-1).controllerKey, 'Pad#1');
    t.input.send('Pad#1', DRUM.x, true);
    t.input.send('Pad#1', DRUM.b, true);
    assert.equal(t.log.playsAs.length, 2);
});

test('Start on an undecided pad is not primary; status lists the standard pads', async () => {
    const t = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' }), pad(1, 'Pad', 1, { mapping: '', drumsKind: 'gamepad' })], {}, both);
    t.m.start([]);
    await flush();
    assert.deepEqual([...t.m.status().standard], ['Xbox#1']);
    t.input.press(0, BTN.start, true, 1);
    t.input.send('Xbox#1', BTN.start, true, 2);
    assert.deepEqual(t.log.primary, [], 'undecided: Start waits for X / B');
    t.input.send('Xbox#1', DRUM.b, true, 3);
    await flush();
    t.input.send('Xbox#1', BTN.start, true, 4);
    assert.deepEqual(t.log.primary, ['Xbox#1'], 'decided: Start is primary');
});

test('a joined drums pad lights pads and kick; Start is primary', async () => {
    const t = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' })], {}, both);
    t.m.start(joinedAs('drums', 'Xbox#1'));
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
    assert.deepEqual(t.drumsApi.mapperCalls, ['Xbox#1']);
    assert.deepEqual(t.api.mapperCalls, [], 'plays as drums: no 5-Fret mapper');
    t.input.send('Xbox#1', DRUM.red, true);
    assert.deepEqual(t.log.light.at(-1), ['Xbox#1', { red: true, yellow: false, blue: false, green: false, kick: false }]);
    t.input.send('Xbox#1', DRUM.kick, true);
    assert.equal(t.log.light.at(-1)[1].kick, true);
    // A cymbal lights its colour; its pad and cymbal share the light.
    t.input.send('Xbox#1', DRUM.yellow, true);
    t.input.send('Xbox#1', DRUM.yellowCym, true);
    t.input.send('Xbox#1', DRUM.yellowCym, false);
    assert.equal(t.log.light.at(-1)[1].yellow, true, 'pad still held');
    t.input.send('Xbox#1', DRUM.yellow, false);
    assert.equal(t.log.light.at(-1)[1].yellow, false);
    t.input.send('Xbox#1', DRUM.greenCym, true);
    t.input.send('Xbox#1', DRUM.blueCym, true);
    assert.deepEqual(t.log.light.at(-1)[1], { red: true, yellow: false, blue: true, green: true, kick: true });
    assert.ok(t.log.rawLit.every((l) => l === t.log.rawLit[0]), 'one lit object per key and kind');
    // X and B are drum buttons here, not a choice.
    t.input.send('Xbox#1', DRUM.x, true);
    t.input.send('Xbox#1', DRUM.b, true);
    assert.deepEqual(t.log.playsAs, []);
    t.input.send('Xbox#1', DRUM.start, true);
    assert.deepEqual(t.log.primary, ['Xbox#1']);
    assert.equal(t.log.join.length, 0);
    // Back held 1 s still leaves.
    t.input.send('Xbox#1', DRUM.back, true);
    t.timers.at(-1).fn();
    assert.deepEqual(t.log.leave, ['Xbox#1']);
});

test('a pad with no kinds needs setup and lists both setup routes', async () => {
    const t = setup([pad(0, 'Mystery', 1, { kind: null, mapping: '', drumsKind: null })], {}, both);
    t.m.start([]);
    await flush();
    assert.deepEqual(t.m.status().kinds.get('Mystery#1'), []);
    assert.deepEqual(t.m.status().needsSetup, [{ controllerKey: 'Mystery#1', name: 'Mystery', setupWith: ['five_fret', 'drums'] }]);
    t.input.press(0, BTN.start, true);
    assert.equal(t.log.join.length, 0);
    const d = setup([pad(0, 'Mystery', 1, { kind: null, mapping: '', drumsKind: null })], {}, { fiveFret: false, drums: true });
    d.m.start([]);
    await flush();
    assert.deepEqual(d.m.status().needsSetup.map((n) => n.setupWith), [['drums']]);
});

test('only the drums API present: join works; neither: status says why', async () => {
    const t = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' })], {}, { fiveFret: false, drums: true });
    t.m.start([]);
    await flush();
    assert.deepEqual([t.m.status().available, t.m.status().reason], [true, null]);
    assert.deepEqual(t.m.status().kinds.get('Xbox#1'), ['drums']);
    t.input.press(0, DRUM.start, true);
    assert.deepEqual(t.log.join, [{ controllerKey: 'Xbox#1', name: 'Xbox', kinds: ['drums'] }]);
    t.input.send('Xbox#1', DRUM.green, true);
    assert.equal(t.log.light.at(-1)[1].green, true, 'one kind: plays drums at once');
    t.m.stop();

    const n = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' })], {}, { fiveFret: false, drums: false });
    n.m.start([]);
    await flush();
    assert.deepEqual([n.m.status().available, n.m.status().reason], [false, 'no-controller-plugins']);
    n.input.press(0, BTN.start, true);
    assert.equal(n.log.join.length, 0);
});

test('status().kinds is rebuilt on refresh, not per event', async () => {
    const t = setup([pad(0, 'Xbox', 1, { drumsKind: 'gamepad' })], {}, both);
    t.m.start([]);
    await flush();
    const k1 = t.m.status().kinds;
    t.input.press(0, BTN.green, true);
    assert.equal(t.m.status().kinds, k1);
    t.input.pads[0].drumsKind = 'kit';
    t.input.change();
    await flush();
    assert.notEqual(t.m.status().kinds, k1);
    assert.deepEqual(t.m.status().kinds.get('Xbox#1'), ['drums']);
});

test('requestJoin before the first listing joins once it lands', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    t.m.requestJoin(0);
    assert.equal(t.log.join.length, 0, 'not listed yet');
    await flush();
    assert.deepEqual(t.log.join, [{ controllerKey: 'Xbox#1', name: 'Xbox', kinds: ['five_fret'] }]);
    assert.deepEqual(t.input.claimCalls, [{ index: 0, owner: 'rockherosmith' }]);
    t.input.change();
    await flush();
    assert.equal(t.log.join.length, 1, 'once');
});

test('requestJoin on a pad no kind lists joins nothing, and a later listing does not join it', async () => {
    const t = setup([pad(0, 'Mystery', 1, { kind: null, mapping: '' })]);
    t.m.start([]);
    await flush();
    t.m.requestJoin(0);
    assert.equal(t.log.join.length, 0);
    assert.deepEqual(t.input.claimCalls, []);
    t.input.pads[0].kind = 'gamepad';   // set up in 5-Fret afterwards
    t.input.change();
    await flush();
    assert.equal(t.log.join.length, 0);
    assert.deepEqual(t.input.claimCalls, []);
});

test('requestJoin on a joined pad claims without a second onJoin', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    // The first claim fails (core refused it), so the joined pad is unclaimed.
    const claim = t.input.claim;
    let refuse = true;
    t.input.claim = (index, owner) => {
        if (refuse) { refuse = false; t.input.claimCalls.push({ index, owner }); return null; }
        return claim(index, owner);
    };
    t.m.start(joinedAs('five_fret', 'Xbox#1'));
    await flush();
    assert.equal(t.input.pads[0].claimedBy, null);
    t.m.requestJoin(0);
    assert.equal(t.log.join.length, 0);
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
    assert.equal(t.input.claimCalls.length, 2);
});

test('requestJoin while stopped does nothing', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.requestJoin(0);
    t.m.start([]);
    await flush();
    assert.equal(t.log.join.length, 0, 'not remembered from before start');
    t.m.requestJoin(0);
    t.m.stop();
    t.m.start([]);
    await flush();
    assert.equal(t.log.join.length, 1, 'joined while running');
    t.m.stop();
    t.m.requestJoin(0);
    assert.equal(t.log.join.length, 1);
    assert.deepEqual(t.input.claimCalls.length, 1);
});

test('a request pending at stop is dropped', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    t.m.requestJoin(0);
    t.m.stop();
    t.m.start([]);
    await flush();
    assert.equal(t.log.join.length, 0);
});

test('a Start still held at claim time is not a primary press', async () => {
    const t = setup([pad(0, 'Xbox', 1)]);
    t.m.start([]);
    await flush();
    t.m.requestJoin(0);
    await flush();
    assert.equal(t.input.pads[0].claimedBy, 'rockherosmith');
    t.input.send('Xbox#1', BTN.start, false);
    assert.equal(t.log.primary.length, 0);
});
