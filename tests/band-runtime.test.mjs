// Band session runtime: Go -> playSong -> stage on song:ready -> end, with a
// fake feedBack bus, the shared fake DOM, in-memory storage and manual timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBandRuntime } from '../src/band-runtime.js';
import { makeDoc, flush } from './fake-dom.mjs';

function memStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        has: (k) => m.has(k),
    };
}

function manualTimers() {
    const pending = new Map();
    let next = 1;
    return {
        setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id; },
        clearTimer: (id) => { pending.delete(id); },
        delays: () => [...pending.values()].map((t) => t.ms),
        // Fire every pending timer with the given delay.
        fire(ms) {
            for (const [id, t] of [...pending]) {
                if (t.ms !== ms) continue;
                pending.delete(id);
                t.fn();
            }
        },
    };
}

function prefsWith({ guitar = {}, drums = {}, vocals = {} } = {}) {
    return {
        split: 62,
        labelScale: 1,
        parts: {
            guitar: { on: true, deviceKey: '', arrangement: 'Lead', difficulty: 'medium', ...guitar },
            drums: { on: true, deviceKey: '', difficulty: 'medium', soundMode: 'song', ...drums },
            vocals: { on: false, deviceId: '', difficulty: 'medium', hearMyself: false, ...vocals },
        },
    };
}

const ITEM = { filename: 'My Song.sloppak', arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Bass' }] };
const DRUM_ITEM = { filename: 'Beat.sloppak', arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Drums' }] };

function setup({ slider = '80', storageInit = { splitscreenActive: 'true' }, settings = { master_difficulty: 60 } } = {}) {
    const bus = new EventTarget();
    const calls = { playSong: [], showScreen: [], setReturnScreen: [], hold: 0, release: 0, setMastery: [],
        setDifficulty: [], clearDifficulty: [], splitStart: 0, fetch: [] };
    const doc = makeDoc();
    const player = doc.createElement('div');
    player.id = 'player';
    doc.body.appendChild(player);
    const highwayCanvas = doc.createElement('canvas');
    highwayCanvas.id = 'highway';
    player.appendChild(highwayCanvas);
    if (slider !== null) {
        const s = doc.createElement('input');
        s.id = 'mastery-slider';
        s.value = slider;
        doc.body.appendChild(s);
    }
    const bandScreen = doc.createElement('div');
    bandScreen.id = 'plugin-build_a_band';
    bandScreen.className = 'screen';
    doc.body.appendChild(bandScreen);

    const fb = {
        currentSong: { filename: 'old.psarc', arrangements: [] },
        on: (ev, fn) => bus.addEventListener(ev, fn),
        off: (ev, fn) => bus.removeEventListener(ev, fn),
        emit: (ev, detail) => bus.dispatchEvent(new CustomEvent(ev, { detail })),
        _nextReturnScreen: null,
        setReturnScreen: (id) => { calls.setReturnScreen.push(id); fb._nextReturnScreen = id; },
        holdAutoExit: () => { calls.hold++; return () => { calls.release++; }; },
    };
    let ssActive = false;
    const storage = memStorage(storageInit);
    const win = {
        feedBack: fb,
        localStorage: storage,
        highway: { setMastery: (f) => calls.setMastery.push(f) },
        setMastery: () => { throw new Error('window.setMastery persists; never call it'); },
        playSong: (f, i) => calls.playSong.push([f, i]),
        showScreen: (id) => calls.showScreen.push(id),
        feedBackDrums: {
            setDifficulty: (id, c) => calls.setDifficulty.push([id, c]),
            clearDifficulty: (c) => calls.clearDifficulty.push(c),
        },
        slopsmithSplitscreen: { isActive: () => ssActive, start: () => { calls.splitStart++; }, stop() { ssActive = false; } },
    };
    const mounts = [];
    const mountStage = ({ player: p, song, prefs }) => {
        // The real stage stops splitscreen, which clears the stored pref.
        storage.setItem('splitscreenActive', 'false');
        const s = { player: p, song, prefs, unmounted: 0, unmount() { this.unmounted++; } };
        mounts.push(s);
        return s;
    };
    const timers = manualTimers();
    const fetchJson = async (url) => { calls.fetch.push(url); return settings; };
    const rt = createBandRuntime({ win, doc, mountStage, loadPrefs: () => prefsWith(), storage, fetchJson,
        setTimer: timers.setTimer, clearTimer: timers.clearTimer });

    // Core's playSong side: loading, then the song becomes current and is ready.
    function loadSong(item, { hasPhraseData = true } = {}) {
        fb.emit('song:loading', { filename: item.filename });
        fb.currentSong = { filename: item.filename, arrangements: item.arrangements };
        fb.emit('song:loaded', fb.currentSong);
        fb.emit('song:ready', { hasPhraseData });
    }
    return { rt, fb, doc, win, calls, mounts, storage, timers, player, highwayCanvas, bandScreen, loadSong,
        setSplit: (v) => { ssActive = v; } };
}

test('no Band button is injected any more', () => {
    const { rt, fb, doc } = setup();
    fb.emit('song:loaded', fb.currentSong);
    assert.equal(doc.getElementById('bab-band-btn'), null);
    assert.equal(rt.toggle, undefined);
    rt.dispose();
});

test('Go plays the chosen guitar arrangement from the band screen', async () => {
    const { rt, calls } = setup();
    const prefs = prefsWith({ guitar: { arrangement: 'Bass' } });
    const started = rt.startSession({ song: ITEM, prefs });
    assert.equal(typeof started.then, 'function', 'a started session returns a promise');
    assert.deepEqual(calls.playSong, [['My%20Song.sloppak', 1]]);
    assert.deepEqual(calls.setReturnScreen, ['plugin-build_a_band']);
    assert.equal(rt.phase(), 'armed');
    assert.equal(rt.startSession({ song: ITEM, prefs }), false);
    assert.equal(calls.playSong.length, 1);
    assert.equal(await started, true);
    rt.dispose();
});

test("the band song's song:ready mounts the stage and applies guitar mastery", () => {
    const { rt, calls, mounts, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'medium' } }) });
    loadSong(ITEM, { hasPhraseData: true });
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].player, player);
    assert.equal(mounts[0].song.filename, 'My Song.sloppak');
    assert.equal(mounts[0].prefs.parts.guitar.difficulty, 'medium');
    assert.deepEqual(calls.setMastery, [0.5]);
    assert.equal(rt.phase(), 'playing');
    assert.equal(rt.isMounted(), true);
    rt.dispose();
});

test('a one-difficulty chart shows the toast and leaves mastery alone', () => {
    const { rt, calls, loadSong, player, timers } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM, { hasPhraseData: false });
    assert.deepEqual(calls.setMastery, []);
    const toast = player.querySelector('div.bab-toast');
    assert.ok(toast);
    assert.equal(toast.textContent, 'This chart has one difficulty');
    assert.ok(timers.delays().includes(4000));
    timers.fire(4000);
    assert.equal(player.querySelector('div.bab-toast'), null);
    rt.dispose();
});

test('song:ready for a different song ends the session without mounting', () => {
    const { rt, fb, mounts, calls } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    fb.currentSong = { filename: 'other.psarc', arrangements: [] };
    fb.emit('song:ready', { hasPhraseData: true });
    assert.equal(mounts.length, 0);
    assert.equal(rt.phase(), 'idle');
    assert.deepEqual(calls.setMastery, [0.8], 'only the restore');
    rt.dispose();
});

test('drums only: plays the drum arrangement, mounts nothing, pins the drum difficulty to #highway', () => {
    const { rt, fb, doc, calls, mounts, loadSong, highwayCanvas } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false }, drums: { difficulty: 'hard' } }) });
    assert.deepEqual(calls.playSong, [['Beat.sloppak', 1]]);
    loadSong(DRUM_ITEM);
    assert.equal(mounts.length, 0);
    assert.deepEqual(calls.setMastery, [], 'no guitar mastery when guitar is off');
    assert.deepEqual(calls.setDifficulty, [['hard', highwayCanvas]]);
    const fresh = doc.createElement('canvas');
    fb.emit('highway:canvas-replaced', { oldCanvas: highwayCanvas, newCanvas: fresh });
    assert.deepEqual(calls.setDifficulty.at(-1), ['hard', fresh]);
    fb.emit('song:stop', {});
    assert.ok(calls.clearDifficulty.includes(highwayCanvas));
    const n = calls.setDifficulty.length;
    fb.emit('highway:canvas-replaced', { oldCanvas: fresh, newCanvas: doc.createElement('canvas') });
    assert.equal(calls.setDifficulty.length, n, 'listener removed at teardown');
    rt.dispose();
});

test('song:ended holds auto-exit, then after 1500 ms releases once and shows the band screen', () => {
    const { rt, fb, calls, mounts, loadSong, timers } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    assert.equal(calls.hold, 1);
    assert.equal(calls.release, 0);
    assert.equal(rt.phase(), 'ending');
    assert.ok(timers.delays().includes(1500));
    timers.fire(1500);
    assert.equal(calls.release, 1);
    assert.equal(mounts[0].unmounted, 1);
    assert.deepEqual(calls.showScreen, ['plugin-build_a_band']);
    assert.equal(rt.phase(), 'idle');
    fb.emit('song:ended', {});
    assert.equal(calls.hold, 1, 'no hold outside a session');
    rt.dispose();
});

test('the band screen is not re-shown when release already returned to it', () => {
    const { rt, fb, calls, loadSong, timers, bandScreen } = setup();
    fb.holdAutoExit = () => () => {
        calls.release++;
        bandScreen.classList.add('active');
        fb.emit('screen:changing', { id: 'plugin-build_a_band', from: 'player' });
    };
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    timers.fire(1500);
    assert.equal(calls.release, 1);
    assert.deepEqual(calls.showScreen, []);
    rt.dispose();
});

test('leaving the player ends the session and restores mastery and the splitscreen pref', () => {
    const { rt, fb, calls, mounts, storage, loadSong } = setup({ storageInit: { splitscreenActive: 'true' } });
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'expert' } }) });
    loadSong(ITEM);
    assert.equal(storage.getItem('splitscreenActive'), 'false');
    fb.emit('screen:changing', { id: 'player', from: 'player' });
    assert.equal(mounts[0].unmounted, 0, 'staying on the player keeps the session');
    fb.emit('screen:changing', { id: 'v3-songs', from: 'player' });
    assert.equal(mounts[0].unmounted, 1);
    assert.deepEqual(calls.setMastery, [1, 0.8]);
    assert.equal(storage.getItem('splitscreenActive'), 'true');
    assert.equal(calls.splitStart, 0);
    assert.equal(rt.phase(), 'idle');
    rt.dispose();
});

test('a null splitscreen pref is removed again on teardown', () => {
    const { rt, fb, storage, loadSong } = setup({ storageInit: {} });
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    assert.equal(storage.getItem('splitscreenActive'), 'false');
    fb.emit('song:stop', {});
    assert.equal(storage.has('splitscreenActive'), false);
    rt.dispose();
});

test('mastery falls back to /api/settings when the slider is missing', async () => {
    const { rt, fb, calls, loadSong } = setup({ slider: null, settings: { master_difficulty: 60 } });
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'hard' } }) });
    await flush();
    assert.deepEqual(calls.fetch, ['/api/settings']);
    loadSong(ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.setMastery, [0.75, 0.6]);
    rt.dispose();
});

// Splitscreen's real start/stop shape: start() flips active and announces
// panels-changed while still _starting, so stop() then only defers (persists
// 'false' and stops once start finishes, without another event).
function fakeSplitscreen(env) {
    const ss = { active: false, starting: false, stopAfterStart: false, starts: 0, stops: 0 };
    ss.isActive = () => ss.active;
    ss.stop = () => {
        ss.stops++;
        if (ss.starting) { env.storage.setItem('splitscreenActive', 'false'); ss.stopAfterStart = true; return; }
        if (!ss.active) return;
        env.storage.setItem('splitscreenActive', 'false');
        ss.active = false;
    };
    ss.start = () => {
        ss.starts++;
        ss.starting = true;
        ss.active = true;
        env.fb.emit('splitscreen:panels-changed', {});
        ss.starting = false;
        if (ss.stopAfterStart) { ss.stopAfterStart = false; ss.active = false; }
    };
    env.win.slopsmithSplitscreen = ss;
    return ss;
}

test('a saved splitscreen pref does not auto-start splitscreen on the band song', () => {
    const env = setup({ storageInit: { splitscreenActive: 'true' } });
    const { rt, win, storage, mounts, loadSong } = env;
    const ss = fakeSplitscreen(env);
    const play = win.playSong;
    let wasActive = null;
    // Splitscreen's playSong wrapper reads the stored pref, then starts on ready.
    win.playSong = (f, a) => { wasActive = storage.getItem('splitscreenActive') === 'true'; return play(f, a); };
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    if (wasActive) ss.start();
    assert.equal(wasActive, false);
    assert.equal(ss.starts, 0);
    assert.equal(rt.phase(), 'playing');
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].unmounted, 0);
    assert.equal(rt.isMounted(), true);
    env.fb.emit('song:stop', {});
    assert.equal(storage.getItem('splitscreenActive'), 'true', 'the saved pref comes back at teardown');
    rt.dispose();
});

test('Always Split starting after mount is stopped and the stage remounted', () => {
    const env = setup();
    const { rt, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    ss.start();
    assert.equal(ss.stops, 1);
    assert.equal(rt.phase(), 'playing');
    assert.equal(mounts[0].unmounted, 1, 'the stage yields while splitscreen is up');
    timers.fire(50);
    assert.equal(mounts.length, 2, 'remounted once splitscreen is down');
    assert.equal(mounts[1].unmounted, 0);
    assert.equal(rt.isMounted(), true);
    env.fb.emit('splitscreen:panels-changed', {}); // inactive: a rename etc.
    assert.equal(rt.phase(), 'playing');
    rt.dispose();
});

test('splitscreen starting before song:ready delays the mount until it is down', () => {
    const env = setup();
    const { rt, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    // Stays up a while: active until the stop is honoured on a later tick.
    ss.stop = () => { ss.stops++; };
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    ss.active = true;
    env.fb.emit('splitscreen:panels-changed', {});
    env.fb.emit('splitscreen:panels-changed', {}); // same start, announced again
    assert.equal(ss.stops, 1);
    loadSong(ITEM);
    assert.equal(mounts.length, 0, 'no mount while splitscreen is up');
    timers.fire(50);
    assert.equal(mounts.length, 0);
    ss.active = false;
    timers.fire(50);
    assert.equal(mounts.length, 1);
    assert.equal(rt.phase(), 'playing');
    rt.dispose();
});

test('splitscreen starting a third time in one session ends it with a warning', () => {
    const env = setup();
    const { rt, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
        rt.startSession({ song: ITEM, prefs: prefsWith() });
        loadSong(ITEM);
        ss.start(); timers.fire(50);
        ss.start(); timers.fire(50);
        assert.equal(rt.phase(), 'playing');
        assert.equal(mounts.length, 3);
        ss.start();
    } finally {
        console.warn = warn;
    }
    assert.equal(rt.phase(), 'idle');
    assert.ok(mounts.every((m) => m.unmounted === 1));
    assert.ok(warns.some((w) => /splitscreen keeps starting/.test(w)));
    rt.dispose();
});

test('mastery is restored from the slider as it is at teardown', () => {
    const { rt, fb, doc, calls, loadSong } = setup({ slider: '80' });
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'easy' } }) });
    loadSong(ITEM);
    doc.getElementById('mastery-slider').value = '40'; // the user moved it mid-song
    fb.emit('song:stop', {});
    assert.deepEqual(calls.setMastery, [0.25, 0.4]);
    rt.dispose();
});

test('a missing master_difficulty restores full mastery', async () => {
    const { rt, fb, calls, loadSong } = setup({ slider: null, settings: {} });
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'hard' } }) });
    await flush();
    loadSong(ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.setMastery, [0.75, 1]);
    rt.dispose();
});

test('a late playSong rejection does not tear down a playing session', async () => {
    const { rt, win, fb, calls, mounts, loadSong } = setup();
    let reject;
    win.playSong = (f, i) => { calls.playSong.push([f, i]); return new Promise((_, r) => { reject = r; }); };
    const started = rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    reject(new Error('late failure'));
    await assert.rejects(started, /late failure/);
    assert.equal(rt.phase(), 'playing');
    assert.equal(mounts[0].unmounted, 0);
    assert.equal(fb._nextReturnScreen, 'plugin-build_a_band', 'a started song keeps its origin');
    rt.dispose();
});

test('a failed Go clears the return screen it set', async () => {
    const { rt, win, fb } = setup();
    win.playSong = () => Promise.reject(new Error('load failed'));
    await assert.rejects(rt.startSession({ song: ITEM, prefs: prefsWith() }), /load failed/);
    assert.equal(fb._nextReturnScreen, null);
    rt.dispose();
});

test('drum sound mode falls back to song when the picked song has no drum stem', () => {
    const { rt, mounts, loadSong } = setup();
    const item = { ...DRUM_ITEM, stem_ids: ['guitar'] };
    rt.startSession({ song: item, prefs: prefsWith({ drums: { soundMode: 'rockband' } }) });
    loadSong(item);
    assert.equal(mounts[0].prefs.parts.drums.soundMode, 'song');
    rt.dispose();
    const b = setup();
    const withStem = { ...DRUM_ITEM, stem_ids: ['drums'] };
    b.rt.startSession({ song: withStem, prefs: prefsWith({ drums: { soundMode: 'kit' } }) });
    b.loadSong(withStem);
    assert.equal(b.mounts[0].prefs.parts.drums.soundMode, 'kit');
    b.rt.dispose();
});

test('dispose ends a running session and removes every listener', () => {
    const { rt, fb, calls, mounts, loadSong, storage } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    rt.dispose();
    assert.equal(mounts[0].unmounted, 1);
    assert.equal(storage.getItem('splitscreenActive'), 'true');
    assert.equal(rt.phase(), 'idle');
    const masteryCalls = calls.setMastery.length;
    fb.emit('song:ended', {});
    fb.emit('song:ready', { hasPhraseData: true });
    fb.emit('song:stop', {});
    assert.equal(calls.hold, 0);
    assert.equal(mounts.length, 1);
    assert.equal(calls.setMastery.length, masteryCalls);
});

test('a failed playSong rejects startSession and returns the runtime to idle', async () => {
    for (const fail of [
        () => Promise.reject(new Error('load failed')),
        () => { throw new Error('sync failure'); },
    ]) {
        const { rt, win, calls } = setup();
        const real = win.playSong;
        win.playSong = (f, i) => { calls.playSong.push([f, i]); return fail(); };
        await assert.rejects(rt.startSession({ song: ITEM, prefs: prefsWith() }), /failure|failed/);
        assert.equal(rt.phase(), 'idle');
        win.playSong = real;
        const again = rt.startSession({ song: ITEM, prefs: prefsWith() });
        assert.equal(await again, true, 'the next Go starts');
        assert.equal(rt.phase(), 'armed');
        rt.dispose();
    }
});
