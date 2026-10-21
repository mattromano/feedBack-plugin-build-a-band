import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CONTROLLER_KINDS, FIVE_FRET_PART_LABELS, isControllerId, nextPlayerId, defaultPart,
    joinController, leaveController, updateController, kindFor,
} from '../src/controller-model.js';

test('the module imports cleanly with no window, and exposes the five_fret kind', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.deepEqual(Object.keys(CONTROLLER_KINDS), ['five_fret']);
    const k = CONTROLLER_KINDS.five_fret;
    assert.equal(k.label, '5-Fret');
    assert.deepEqual(k.parts, ['guitar', 'rhythm', 'bass']);
    assert.equal(k.eventPrefix, 'five_fret');
    assert.equal(k.api(), null);
    assert.equal(k.laneRenderer(), null);
    assert.deepEqual(FIVE_FRET_PART_LABELS, { guitar: 'Lead', rhythm: 'Rhythm', bass: 'Bass' });
});

test('isControllerId matches ctlN only', () => {
    assert.equal(isControllerId('ctl1'), true);
    assert.equal(isControllerId('ctl12'), true);
    for (const v of ['ctl', 'ctl0x', 'guitar', 'xctl1', '', null, 3]) assert.equal(isControllerId(v), false, String(v));
});

test('nextPlayerId takes the smallest free N', () => {
    assert.equal(nextPlayerId([]), 'ctl1');
    assert.equal(nextPlayerId([{ id: 'ctl1' }, { id: 'ctl3' }]), 'ctl2');
    assert.equal(nextPlayerId(undefined), 'ctl1');
});

test('joinController assigns ctl1, ctl2 and ignores a second join of the same key', () => {
    let c = joinController([], { controllerKey: 'pad#0', name: 'Xbox' });
    assert.deepEqual(c, [{
        key: 'pad#0', id: 'ctl1', name: 'Xbox', playsAs: 'five_fret', part: 'guitar',
        difficulty: 'medium', lefty: false, partAudio: 'rockband', on: true,
    }]);
    const c2 = joinController(c, { controllerKey: 'pad#1', name: 'Xbox 2' });
    assert.deepEqual(c2.map((p) => p.id), ['ctl1', 'ctl2']);
    assert.equal(c2[1].part, 'bass');
    const again = joinController(c2, { controllerKey: 'pad#0', name: 'Other' });
    assert.deepEqual(again, c2);
    assert.equal(c.length, 1, 'input untouched');
});

test('defaultPart picks Lead, then Bass, then Rhythm, then Lead again', () => {
    let c = [];
    const got = [];
    for (let i = 0; i < 4; i++) {
        const part = defaultPart(c);
        got.push(part);
        c = [...c, { key: 'k' + i, id: 'ctl' + (i + 1), part }];
    }
    assert.deepEqual(got, ['guitar', 'bass', 'rhythm', 'guitar']);
});

test('leave and update return new arrays', () => {
    const c = joinController(joinController([], { controllerKey: 'a#0', name: 'A' }), { controllerKey: 'b#0', name: 'B' });
    const left = leaveController(c, 'a#0');
    assert.notEqual(left, c);
    assert.deepEqual(left.map((p) => p.key), ['b#0']);
    assert.equal(c.length, 2);
    const up = updateController(c, 'b#0', { part: 'rhythm', difficulty: 'expert' });
    assert.notEqual(up, c);
    assert.equal(up[1].part, 'rhythm');
    assert.equal(up[1].difficulty, 'expert');
    assert.equal(c[1].part, 'bass', 'input untouched');
    assert.notEqual(up[0], undefined);
    assert.notEqual(leaveController(c, 'nope'), c);
    assert.notEqual(updateController(c, 'nope', {}), c);
});

test('CONTROLLER_KINDS.five_fret pins and unpins through window.feedBackFiveFret lazily', async () => {
    const k = CONTROLLER_KINDS.five_fret;
    const canvas = {};
    try {
        assert.equal(k.pin(canvas, 'pad#0', { part: 'bass' }), false, 'no API: false');
        k.unpin(canvas);
        assert.equal(await k.resolveBinding('pad#0'), null);
        const calls = [];
        const renderer = {};
        globalThis.window = {
            feedBackViz_five_fret: renderer,
            feedBackFiveFret: {
                setLane: (cv, o) => { calls.push(['set', cv, o]); return true; },
                clearLane: (cv) => { calls.push(['clear', cv]); },
                listControllers: async () => [{ controllerKey: 'pad#0', kind: 'gamepad' }, { controllerKey: 'g#1', kind: 'guitar' }],
                openControls: (o) => { calls.push(['controls', o]); },
            },
        };
        assert.equal(k.pin(canvas, 'pad#0', { part: 'bass', difficulty: 'hard', lefty: true }), true);
        k.unpin(canvas);
        assert.equal(k.laneRenderer(), renderer);
        assert.equal(await k.resolveBinding('g#1'), 'guitar');
        assert.equal(await k.resolveBinding('missing#0'), null);
        k.setupHref();
        assert.deepEqual(calls, [
            ['set', canvas, { controllerKey: 'pad#0', part: 'bass', difficulty: 'hard', lefty: true }],
            ['clear', canvas],
            ['controls', { returnTo: 'plugin-build_a_band' }],
        ]);
    } finally {
        delete globalThis.window;
    }
});

test('kindFor defaults to five_fret and honours an explicit registered choice', () => {
    assert.equal(kindFor({}, 'pad#0'), 'five_fret');
    assert.equal(kindFor(undefined, 'pad#0'), 'five_fret');
    assert.equal(kindFor({ controllerKinds: { 'pad#0': 'five_fret' } }, 'pad#0'), 'five_fret');
    assert.equal(kindFor({ controllerKinds: { 'pad#0': 'drums' } }, 'pad#0'), 'five_fret', 'unregistered kind ignored');
});
