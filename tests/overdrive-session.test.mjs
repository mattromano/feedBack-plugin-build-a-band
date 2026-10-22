// createOverdriveSession against a fake HUD that records [method, ...args].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverdriveSession } from '../src/overdrive-session.js';

// One downbeat every 2 s: a 2 s measure.
const BEATS = Array.from({ length: 31 }, (_, i) => ({ time: i * 2, measure: i }));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// Notes at 0…10 and 20: one gap from 10 to 20.
const GUITAR = {
    phrases: [{ start: 0, end: 5 }, { start: 5, end: 10 }],
    notes: [...range(0, 10), 20].map((t) => ({ t, s: 0, f: 0, sus: 0 })),
    chords: [],
};

function fakeHud() {
    const calls = [];
    const rec = (name) => (...args) => { calls.push([name, ...args]); };
    return {
        calls,
        callout: rec('callout'),
        setOverdrive: rec('setOverdrive'),
        setReady: rec('setReady'),
        setNoodle: rec('setNoodle'),
    };
}

function setup(opts = {}) {
    const hud = fakeHud();
    const od = createOverdriveSession({
        parts: ['guitar', 'drums', 'vocals'],
        beats: BEATS,
        guitar: GUITAR,
        getHud: () => hud,
        readDrums: () => null,
        readVocals: () => null,
        ...opts,
    });
    return { od, hud };
}

const has = (hud, ...call) => hud.calls.some((c) => JSON.stringify(c) === JSON.stringify(call));
const count = (hud, ...call) => hud.calls.filter((c) => JSON.stringify(c) === JSON.stringify(call)).length;
const hitAll = (od, a = 0, b = 9) => { for (const n of range(a, b)) od.guitarJudgment(n, true, n); };

test('guitar doubles only while its overdrive is active; drums and vocals never', () => {
    const { od } = setup();
    assert.equal(od.factorFor('guitar', 1), 1);
    hitAll(od);
    od.tick(12, 12);
    od.onset(12.4, 12.4);
    od.onset(13, 13);
    assert.equal(od.onset(13.5, 13.5), true);
    assert.equal(od.factorFor('guitar', 14), 2);
    assert.equal(od.factorFor('drums', 14), 1);
    assert.equal(od.factorFor('vocals', 14), 1);
});

test('a cleared phrase fills a quarter and the bar shows it', () => {
    const { od, hud } = setup();
    hitAll(od, 0, 4);
    od.tick(5.5, 5.5);
    assert.ok(has(hud, 'setOverdrive', 'guitar', 0.25, false));
    assert.ok(has(hud, 'setReady', 'guitar', false));
});

test('Overdrive ready and the noodle zone', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(12, 12);
    assert.ok(has(hud, 'callout', 'guitar', 'Overdrive ready'));
    assert.ok(has(hud, 'setNoodle', true));
    assert.ok(has(hud, 'callout', 'guitar', 'Noodle it up!'));
    assert.ok(has(hud, 'setReady', 'guitar', true));
    od.tick(12.5, 12.5);
    assert.equal(count(hud, 'callout', 'guitar', 'Overdrive ready'), 1);
    assert.equal(count(hud, 'callout', 'guitar', 'Noodle it up!'), 1);
    assert.equal(od.snapshot(12.5).noodle, true);
});

test('three new attacks in the zone deploy once', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(12, 12);
    assert.equal(od.onset(12.4, 12.4), false);
    assert.equal(od.onset(13, 13), false);
    assert.equal(od.onset(13.5, 13.5), true);
    assert.equal(od.onset(14, 14), false);
    assert.equal(count(hud, 'callout', 'guitar', 'OVERDRIVE!'), 1);
    assert.equal(od.snapshot(14).guitar.active, true);
});

test('onsets in a gap before the meter is ready do not use up its deploy', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(5.5, 5.5); // a quarter bar: not ready
    // Phrase 2 closes at 10.5; these attacks land in the gap before that.
    assert.equal(od.onset(10.35, 10.35), false);
    assert.equal(od.onset(10.4, 10.4), false);
    assert.equal(od.onset(10.45, 10.45), false);
    assert.equal(od.snapshot(10.45).guitar.active, false);
    od.tick(10.5, 10.5); // half a bar: ready, the zone opens
    assert.ok(has(hud, 'setNoodle', true));
    assert.equal(od.onset(11, 11), false);
    assert.equal(od.onset(12, 12), false);
    assert.equal(od.onset(13, 13), true);
    assert.equal(od.factorFor('guitar', 13.5), 2);
});

test('the zone closes when the meter deploys and stays closed outside gaps', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(12, 12);
    for (const t of [12.4, 13, 13.5]) od.onset(t, t);
    od.tick(14, 14);
    assert.deepEqual(hud.calls.filter((c) => c[0] === 'setNoodle').at(-1), ['setNoodle', false]);
    assert.equal(od.snapshot(14).noodle, false);
});

test('deployed calls out OVERDRIVE! on drums and vocals', () => {
    const { od, hud } = setup();
    od.deployed('drums');
    od.deployed('vocals');
    assert.ok(has(hud, 'callout', 'drums', 'OVERDRIVE!'));
    assert.ok(has(hud, 'callout', 'vocals', 'OVERDRIVE!'));
});

test('drums and vocals mirror their engines', () => {
    let drums = { starPower: { amount: 0.5, active: false } };
    let vocals = { fill: 0.25, active: false, ready: false };
    const { od, hud } = setup({ readDrums: () => drums, readVocals: () => vocals });
    od.tick(1, 1);
    assert.ok(has(hud, 'setOverdrive', 'drums', 0.5, false));
    assert.ok(has(hud, 'setReady', 'drums', true));
    assert.ok(has(hud, 'callout', 'drums', 'Overdrive ready'));
    assert.ok(has(hud, 'setOverdrive', 'vocals', 0.25, false));
    assert.ok(has(hud, 'setReady', 'vocals', false));
    assert.ok(!has(hud, 'callout', 'vocals', 'Overdrive ready'));
    od.tick(1.1, 1.1);
    assert.equal(count(hud, 'callout', 'drums', 'Overdrive ready'), 1);
    drums = { starPower: { amount: 0.5, active: true } };
    vocals = { fill: 0.5, active: false, ready: true };
    od.tick(1.2, 1.2);
    assert.ok(has(hud, 'setReady', 'drums', false));
    assert.ok(has(hud, 'setOverdrive', 'drums', 0.5, true));
    assert.ok(has(hud, 'callout', 'vocals', 'Overdrive ready'));
    assert.deepEqual(od.snapshot(1.2).drums, { fill: 0.5, active: true });
    assert.deepEqual(od.snapshot(1.2).vocals, { fill: 0.5, active: false, ready: true });
});

test('missing sources and charts are harmless', (t) => {
    t.mock.method(console, 'warn', () => {});   // the throwing readers warn once each
    const boom = () => { throw new Error('x'); };
    for (const [readDrums, readVocals] of [[() => null, () => null], [boom, boom], [undefined, undefined]]) {
        const { od, hud } = setup({ guitar: null, beats: [], readDrums, readVocals });
        assert.doesNotThrow(() => od.tick(1, 1));
        assert.doesNotThrow(() => od.snapshot(1));
        assert.equal(od.snapshot(0).guitar, null);
        assert.equal(od.snapshot(0).drums, null);
        assert.equal(od.snapshot(0).vocals, null);
        assert.equal(od.onset(1, 1), false);
        assert.equal(od.factorFor('guitar', 1), 1);
        assert.doesNotThrow(() => od.guitarJudgment(1, true, 1));
        assert.doesNotThrow(() => od.rewindTo(0));
        assert.doesNotThrow(() => od.loopWrap(0));
        // No state: no bar is written for those parts.
        assert.equal(hud.calls.filter((c) => c[0] === 'setOverdrive').length, 0);
    }
    // No HUD mounted (or a getHud that throws): ticks still run.
    const od = setup({ getHud: () => null }).od;
    hitAll(od);
    assert.doesNotThrow(() => od.tick(12, 12));
    assert.equal(od.snapshot(12).guitar.ready, true);
    assert.doesNotThrow(() => setup({ getHud: () => { throw new Error('x'); } }).od.tick(12, 12));
});

test('a reader that fails keeps the bar as last written', (t) => {
    t.mock.method(console, 'warn', () => {});
    let fail = false;
    const { od, hud } = setup({ readDrums: () => { if (fail) throw new Error('x'); return { starPower: { amount: 0.3, active: false } }; } });
    od.tick(1, 1);
    const n = hud.calls.filter((c) => c[0] === 'setOverdrive' && c[1] === 'drums').length;
    fail = true;
    od.tick(1.1, 1.1);
    assert.equal(hud.calls.filter((c) => c[0] === 'setOverdrive' && c[1] === 'drums').length, n);
});

test('only the ledger parts are drawn', () => {
    const { od, hud } = setup({ parts: ['drums'], readDrums: () => ({ starPower: { amount: 0.1, active: false } }) });
    hitAll(od);
    od.tick(12, 12);
    assert.ok(!hud.calls.some((c) => c[1] === 'guitar'));
    assert.ok(!hud.calls.some((c) => c[0] === 'setNoodle'));
    assert.equal(od.snapshot(12).guitar, null);
    assert.equal(od.factorFor('guitar', 12), 1);
});

test('a remount swaps the HUD the next tick writes to', () => {
    let hud = fakeHud();
    const od = createOverdriveSession({ parts: ['guitar'], beats: BEATS, guitar: GUITAR, getHud: () => hud });
    hitAll(od, 0, 4);
    od.tick(5.5, 5.5);
    hud = fakeHud();
    od.tick(6, 6);
    assert.ok(has(hud, 'setOverdrive', 'guitar', 0.25, false));
});

test('rewind restores the bar as it was', () => {
    const { od } = setup();
    hitAll(od, 0, 4);
    od.tick(5.5, 5.5);
    assert.equal(od.snapshot(6).guitar.fill, 0.25);
    od.rewindTo(5);
    assert.equal(od.snapshot(6).guitar.fill, 0);
    // The phrase reopened with its hits kept, so it earns again.
    od.tick(5.5, 5.5);
    assert.equal(od.snapshot(6).guitar.fill, 0.25);
});

test('a rewind gives the gap its deploy and callout back', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(12, 12);
    for (const t of [12.4, 13, 13.5]) od.onset(t, t);
    od.rewindTo(12);
    assert.equal(od.snapshot(12).guitar.active, false);
    od.tick(12, 12);
    assert.equal(count(hud, 'callout', 'guitar', 'Noodle it up!'), 2);
    for (const t of [12.4, 13]) assert.equal(od.onset(t, t), false);
    assert.equal(od.onset(13.5, 13.5), true);
});

test('a loop wrap gives the gap its deploy and callout back', () => {
    const { od, hud } = setup();
    hitAll(od);
    od.tick(12, 12);
    for (const t of [12.4, 13, 13.5]) od.onset(t, t);
    od.tick(25, 25); // half a bar drains in 4 measures (8 s)
    assert.equal(od.snapshot(25).guitar.fill, 0);
    // The loop goes back to chart time 0; the band clock keeps running.
    od.loopWrap(0);
    for (const n of range(0, 9)) od.guitarJudgment(n, true, 30 + n);
    od.tick(12, 42);
    assert.equal(od.snapshot(42).guitar.ready, true);
    assert.equal(count(hud, 'callout', 'guitar', 'Noodle it up!'), 2);
    for (const c of [12.4, 13]) assert.equal(od.onset(c, 30 + c), false);
    assert.equal(od.onset(13.5, 43.5), true);
    assert.equal(od.factorFor('guitar', 44), 2);
});

test('loop wrap reopens phrases from the loop start', () => {
    const { od } = setup();
    hitAll(od, 0, 4);
    od.tick(5.5, 5.5);
    od.loopWrap(0);
    hitAll(od, 0, 4);
    od.tick(5.5, 6);
    assert.equal(od.snapshot(6).guitar.fill, 0.5);
});

test('drums at 0.4999999999 fill are ready', () => {
    const { od, hud } = setup({ readDrums: () => ({ starPower: { amount: 0.4999999999, active: false } }) });
    od.tick(1, 1);
    assert.ok(has(hud, 'setReady', 'drums', true));
});

test("drums ready follows the engine's canActivate when it gives one", () => {
    let sp = { amount: 0.75, active: false, canActivate: false };
    const { od, hud } = setup({ readDrums: () => ({ starPower: sp }) });
    od.tick(1, 1);
    assert.ok(has(hud, 'setReady', 'drums', false));
    assert.ok(!has(hud, 'setReady', 'drums', true));
    sp = { amount: 0.2, active: false, canActivate: true };
    od.tick(1.1, 1.1);
    assert.ok(has(hud, 'setReady', 'drums', true));
});

test('a throwing reader warns once', (t) => {
    const warns = [];
    t.mock.method(console, 'warn', (...args) => { warns.push(args); });
    const { od } = setup({ readDrums: () => { throw new Error('drums boom'); } });
    od.tick(1, 1);
    od.tick(1.1, 1.1);
    od.tick(1.2, 1.2);
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], '[rockherosmith] overdrive');
    assert.equal(warns[0][1], 'drums');
    assert.match(String(warns[0][2] && warns[0][2].message), /drums boom/);
});

test('controller meters are mirrored and drawn', (t) => {
    t.mock.method(console, 'warn', () => {});   // ctl3's reader throws: one warning
    let a = { starPower: { amount: 0.25, active: false } };
    let b = null;
    const { od, hud } = setup({
        parts: ['ctl1', 'ctl2', 'ctl3'],
        controllers: [
            { id: 'ctl1', read: () => a },
            { id: 'ctl2', read: () => b },
            { id: 'ctl3', read: () => { throw new Error('x'); } },
        ],
    });
    od.tick(1, 1);
    assert.ok(has(hud, 'setOverdrive', 'ctl1', 0.25, false));
    assert.ok(has(hud, 'setReady', 'ctl1', false));
    assert.ok(!hud.calls.some((c) => c[1] === 'ctl2' || c[1] === 'ctl3'), 'no state: nothing drawn');
    // The fill rule decides ready (the engine gives no canActivate), with the float epsilon.
    a = { starPower: { amount: 0.4999999999, active: false } };
    b = { starPower: { amount: 0.75, active: true } };
    od.tick(1.1, 1.1);
    assert.ok(has(hud, 'setReady', 'ctl1', true));
    assert.ok(has(hud, 'callout', 'ctl1', 'Overdrive ready'));
    assert.ok(has(hud, 'setOverdrive', 'ctl2', 0.75, true));
    assert.ok(has(hud, 'setReady', 'ctl2', false));
    od.tick(1.2, 1.2);
    assert.equal(count(hud, 'callout', 'ctl1', 'Overdrive ready'), 1);
    od.deployed('ctl2');
    assert.ok(has(hud, 'callout', 'ctl2', 'OVERDRIVE!'));
    assert.deepEqual(od.snapshot(1.2).controllers, {
        ctl1: { fill: 0.4999999999, active: false }, ctl2: { fill: 0.75, active: true }, ctl3: null,
    });
    // Controllers never take the guitar factor.
    assert.equal(od.factorFor('ctl1', 2), 1);
    // No controllers option: an empty map.
    assert.deepEqual(setup().od.snapshot(0).controllers, {});
});
