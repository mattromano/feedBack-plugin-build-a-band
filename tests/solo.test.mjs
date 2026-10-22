import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soloPrefs, pickSoloController, createSoloPlay } from '../src/solo.js';
import { normalizePrefs } from '../src/prefs.js';

const KEY = 'Xbox#1';

test('soloPrefs: one controller player, every fixed part off, the saved look kept', () => {
    const saved = normalizePrefs({ split: 70, failMode: 'fail', parts: { guitar: { deviceKey: 'g' } },
        controllers: [{ key: 'Other#1', playsAs: 'drums' }] });
    const p = soloPrefs(saved, { kind: 'five_fret', part: 'bass', difficulty: 'hard', controllerKey: KEY, name: 'Xbox' });
    assert.equal(p.split, 70);
    assert.equal(p.failMode, 'fail');
    assert.deepEqual([p.parts.guitar.on, p.parts.drums.on, p.parts.vocals.on], [false, false, false]);
    assert.equal(p.parts.guitar.deviceKey, 'g');
    assert.equal(p.controllers.length, 1);
    const c = p.controllers[0];
    assert.deepEqual([c.key, c.playsAs, c.part, c.difficulty, c.partAudio, c.on], [KEY, 'five_fret', 'bass', 'hard', 'rockband', true]);
});

test('soloPrefs: drums plays drums; bad part / difficulty fall back; no key or kind is null', () => {
    const d = soloPrefs({}, { kind: 'drums', difficulty: 'expert', controllerKey: KEY });
    assert.deepEqual([d.controllers[0].playsAs, d.controllers[0].part, d.controllers[0].soundMode], ['drums', 'drums', 'rockband']);
    const f = soloPrefs({}, { kind: 'five_fret', part: 'keys', difficulty: 'insane', controllerKey: KEY });
    assert.deepEqual([f.controllers[0].part, f.controllers[0].difficulty], ['guitar', 'medium']);
    assert.equal(soloPrefs({}, { kind: 'five_fret' }), null);
    assert.equal(soloPrefs({}, { kind: 'keys', controllerKey: KEY }), null);
});

const kindsWith = (list) => ({
    five_fret: { api: () => ({ listControllers: async () => list }) },
});

test('pickSoloController: connected, set up, free first', async () => {
    const list = [
        { controllerKey: 'A#1', connected: false, kind: 'gamepad' },
        { controllerKey: 'B#1', connected: true, kind: null },
        { controllerKey: 'C#1', connected: true, kind: 'gamepad', claimedBy: 'drums', name: 'C' },
        { controllerKey: 'D#1', connected: true, kind: 'guitar', name: 'D' },
    ];
    assert.deepEqual(await pickSoloController('five_fret', kindsWith(list)), { controllerKey: 'D#1', name: 'D' });
    assert.deepEqual(await pickSoloController('five_fret', kindsWith(list.slice(0, 3))), { controllerKey: 'C#1', name: 'C' });
    assert.equal(await pickSoloController('five_fret', kindsWith(list.slice(0, 2))), null);
    assert.equal(await pickSoloController('drums', kindsWith(list)), null);
});

function harness({ list, phase = 'idle', start = () => Promise.resolve(true) } = {}) {
    const calls = [];
    const play = createSoloPlay({
        getRuntime: () => ({ phase: () => phase, startSession: (a) => { calls.push(['start', a]); return start(a); } }),
        getScreen: () => ({ openWithSong: (i) => calls.push(['openWithSong', i.filename]) }),
        loadPrefs: () => normalizePrefs({}),
        showScreen: (id) => calls.push(['show', id]),
        kinds: { five_fret: { api: () => ({ listControllers: async () => list || [{ controllerKey: KEY, connected: true, kind: 'gamepad' }] }) } },
    });
    return { play, calls };
}

test('playSolo starts a one-player session with the song', async () => {
    const { play, calls } = harness();
    const item = { filename: 'a.sloppak', five_fret_parts: ['guitar:chart'] };
    assert.equal(await play(item, { kind: 'five_fret', part: 'guitar', difficulty: 'expert' }), 'started');
    assert.equal(calls.length, 1);
    const [, arg] = calls[0];
    assert.equal(arg.song, item);
    assert.equal(arg.prefs.controllers[0].key, KEY);
    assert.equal(arg.prefs.controllers[0].difficulty, 'expert');
});

test('playSolo opens the band screen with the song when no controller can play', async () => {
    const { play, calls } = harness({ list: [] });
    assert.equal(await play({ filename: 'a.sloppak' }, { kind: 'five_fret' }), 'setup');
    assert.deepEqual(calls, [['openWithSong', 'a.sloppak'], ['show', 'plugin-rockherosmith']]);
});

test('playSolo does nothing mid-session or without a file; a refused start goes to setup', async () => {
    assert.equal(await harness({ phase: 'playing' }).play({ filename: 'a' }, { kind: 'five_fret' }), false);
    assert.equal(await harness().play({}, { kind: 'five_fret' }), false);
    const refused = harness({ start: () => false });
    assert.equal(await refused.play({ filename: 'a' }, { kind: 'five_fret' }), 'setup');
});
