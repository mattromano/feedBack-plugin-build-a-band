import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CONTROLLER_KINDS, FIVE_FRET_PART_LABELS, isControllerId, nextPlayerId, defaultPart,
    joinController, leaveController, updateController, kindFor, playableKinds, setPlaysAs,
} from '../src/controller-model.js';

test('the module imports cleanly with no window, and exposes the five_fret and drums kinds', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.deepEqual(Object.keys(CONTROLLER_KINDS), ['five_fret', 'drums']);
    const d = CONTROLLER_KINDS.drums;
    assert.equal(d.label, 'Drums');
    assert.deepEqual(d.parts, ['drums']);
    assert.equal(d.eventPrefix, 'drums');
    assert.equal(d.api(), null);
    assert.equal(d.laneRenderer(), null);
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
        difficulty: 'medium', lefty: false, partAudio: 'rockband', soundMode: 'rockband', on: true,
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

test('kindFor: the entry\'s playsAs, else an explicit registered choice, else the single playable kind, else null', () => {
    assert.equal(kindFor({}, 'pad#0'), null, 'two kinds registered: undecided');
    assert.equal(kindFor(undefined, 'pad#0'), null);
    assert.equal(kindFor({ controllerKinds: { 'pad#0': 'five_fret' } }, 'pad#0'), 'five_fret');
    assert.equal(kindFor({ controllerKinds: { 'pad#0': 'drums' } }, 'pad#0'), 'drums');
    assert.equal(kindFor({ controllerKinds: { 'pad#0': 'kazoo' } }, 'pad#0'), null, 'unregistered kind ignored');
    const prefs = { controllers: [{ key: 'pad#0', playsAs: 'five_fret' }, { key: 'pad#1', playsAs: null }],
        controllerKinds: { 'pad#0': 'drums', 'pad#1': 'drums' } };
    assert.equal(kindFor(prefs, 'pad#0'), 'five_fret', 'a stored playsAs wins until the controller leaves');
    assert.equal(kindFor(prefs, 'pad#1'), 'drums', 'undecided entry: the remembered choice');
    assert.equal(kindFor({}, 'pad#0', ['five_fret']), 'five_fret', 'one playable kind');
    assert.equal(kindFor({}, 'pad#0', ['five_fret', 'drums']), null);
    assert.equal(kindFor({}, 'pad#0', ['kazoo']), null);
});

test('playableKinds: kit → drums; guitar → five_fret; both gamepads → both; null kinds drop out; kit and guitar → both', () => {
    assert.deepEqual(playableKinds(null, 'kit'), ['drums']);
    assert.deepEqual(playableKinds('gamepad', 'kit'), ['drums'], 'a kit binding means drums only');
    assert.deepEqual(playableKinds('guitar', null), ['five_fret']);
    assert.deepEqual(playableKinds('guitar', 'gamepad'), ['five_fret'], 'a guitar plays 5-Fret only');
    assert.deepEqual(playableKinds('gamepad', 'gamepad'), ['five_fret', 'drums']);
    assert.deepEqual(playableKinds('gamepad', null), ['five_fret']);
    assert.deepEqual(playableKinds(null, 'gamepad'), ['drums']);
    assert.deepEqual(playableKinds(undefined, undefined), []);
    assert.deepEqual(playableKinds('guitar', 'kit'), ['five_fret', 'drums']);
});

test('join with two kinds and no memory is undecided; the remembered kind is used; one kind needs no memory', () => {
    const both = ['five_fret', 'drums'];
    const [u] = joinController([], { controllerKey: 'pad#0', name: 'Xbox', kinds: both });
    assert.equal(u.playsAs, null);
    assert.equal(u.part, null);
    assert.equal(u.soundMode, 'rockband');
    const [d] = joinController([], { controllerKey: 'pad#0', name: 'Xbox', kinds: both, remembered: 'drums' });
    assert.equal(d.playsAs, 'drums');
    assert.equal(d.part, 'drums');
    const [f] = joinController([], { controllerKey: 'pad#0', name: 'Xbox', kinds: both, remembered: 'five_fret' });
    assert.equal(f.playsAs, 'five_fret');
    assert.equal(f.part, 'guitar');
    const [k] = joinController([], { controllerKey: 'kit#0', name: 'Kit', kinds: ['drums'] });
    assert.equal(k.playsAs, 'drums');
    assert.equal(k.part, 'drums');
    const [g] = joinController([], { controllerKey: 'g#0', name: 'Guitar', kinds: ['five_fret'], remembered: 'drums' });
    assert.equal(g.playsAs, 'five_fret', 'one kind wins over the memory');
    const [x] = joinController([], { controllerKey: 'pad#0', kinds: both, remembered: 'kazoo' });
    assert.equal(x.playsAs, null, 'a memory outside the playable kinds is ignored');
    const [n] = joinController([], { controllerKey: 'pad#0', kinds: [] });
    assert.equal(n.playsAs, null);
});

test('setPlaysAs to drums sets part drums; back to five_fret picks a free 5-fret part', () => {
    let c = joinController([], { controllerKey: 'a#0', name: 'A', kinds: ['five_fret'] });
    c = joinController(c, { controllerKey: 'b#0', name: 'B', kinds: ['five_fret', 'drums'] });
    assert.equal(c[1].playsAs, null);
    const d = setPlaysAs(c, 'b#0', 'drums');
    assert.notEqual(d, c);
    assert.equal(d[1].playsAs, 'drums');
    assert.equal(d[1].part, 'drums');
    assert.equal(c[1].playsAs, null, 'input untouched');
    const f = setPlaysAs(d, 'b#0', 'five_fret');
    assert.equal(f[1].playsAs, 'five_fret');
    assert.equal(f[1].part, 'bass', 'Lead is held by a#0');
    assert.equal(setPlaysAs(f, 'a#0', 'five_fret')[0].part, 'guitar', 'its own part is free to it');
    assert.deepEqual(setPlaysAs(f, 'b#0', 'kazoo'), f, 'unregistered kind: unchanged');
    assert.notEqual(setPlaysAs(f, 'b#0', 'kazoo'), f);
});

test('CONTROLLER_KINDS.drums pins, unpins and lists through window.feedBackDrums lazily', async () => {
    const k = CONTROLLER_KINDS.drums;
    const canvas = {};
    try {
        assert.equal(k.pin(canvas, 'pad#0', { difficulty: 'hard' }), false, 'no API: false');
        k.unpin(canvas);
        k.setupHref();
        assert.equal(await k.resolveBinding('pad#0'), null);
        const calls = [];
        const renderer = {};
        globalThis.window = {
            feedBackViz_drums: renderer,
            feedBackDrums: {
                setController: (key, cv) => { calls.push(['set', key, cv]); return true; },
                setDifficulty: (id, cv) => { calls.push(['diff', id, cv]); },
                clearController: (cv) => { calls.push(['clear', cv]); },
                clearDifficulty: (cv) => { calls.push(['cleardiff', cv]); },
                listControllers: () => Promise.resolve([{ controllerKey: 'pad#0', kind: 'gamepad' }, { controllerKey: 'kit#1', kind: 'kit' },
                    { controllerKey: 'new#1', kind: null }]),
                openControls: (o) => { calls.push(['controls', o]); },
            },
        };
        assert.equal(k.api(), globalThis.window.feedBackDrums);
        assert.equal(k.laneRenderer(), renderer);
        assert.equal(k.pin(canvas, 'pad#0', { difficulty: 'hard', part: 'drums' }), true);
        assert.equal(k.pin(canvas, 'pad#0', { difficulty: 'nope' }), true);
        k.unpin(canvas);
        assert.equal(await k.resolveBinding('kit#1'), 'kit');
        assert.equal(await k.resolveBinding('new#1'), null, 'needs setup');
        assert.equal(await k.resolveBinding('missing#0'), null);
        k.setupHref();
        assert.deepEqual(calls, [
            ['set', 'pad#0', canvas], ['diff', 'hard', canvas],
            ['set', 'pad#0', canvas], ['diff', 'medium', canvas],
            ['clear', canvas], ['cleardiff', canvas],
            ['controls', { returnTo: 'plugin-build_a_band' }],
        ]);
        globalThis.window.feedBackDrums.setController = () => false;
        calls.length = 0;
        assert.equal(k.pin(canvas, 'pad#0', {}), false, 'a refused pin sets no difficulty');
        assert.deepEqual(calls, []);
        globalThis.window.feedBackDrums.listControllers = () => Promise.reject(new Error('x'));
        assert.equal(await k.resolveBinding('pad#0'), null);
    } finally {
        delete globalThis.window;
    }
});

test('CONTROLLER_KINDS.drums.partFor needs a drum chart', () => {
    const k = CONTROLLER_KINDS.drums;
    assert.deepEqual(k.partFor({ arrangements: [{ name: 'Drums' }] }, { playsAs: 'drums', part: 'drums' }),
        { instrument: 'drums', kind: 'chart' });
    assert.equal(k.partFor({ arrangements: [{ name: 'Lead' }] }, { playsAs: 'drums', part: 'drums' }), null);
});

test('each kind names the arrangement its lane streams', () => {
    const plan = { laneArrangement: 3 };
    const song = { arrangementIndex: 1 };
    assert.equal(CONTROLLER_KINDS.five_fret.laneArrangement(plan, song), 1, 'the song\'s current arrangement');
    assert.equal(CONTROLLER_KINDS.drums.laneArrangement(plan, song), 3, 'the real drum lane\'s');
    assert.equal(CONTROLLER_KINDS.drums.laneArrangement({ laneArrangement: undefined }, song), undefined);
});
