// Band session runtime: Go -> playSong -> stage on song:ready -> end, with a
// fake feedBack bus, the shared fake DOM, in-memory storage and manual timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBandRuntime } from '../src/band-runtime.js';
import { makeDoc, flush } from './fake-dom.mjs';
import { starsFromScore } from '../src/yarg-rules.js';

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

function setup({ slider = '80', storageInit = { splitscreenActive: 'true' }, settings = { master_difficulty: 60 },
    karaoke = true, karaokePitch = true, mountFails = false, drumLane = true,
    stems = ['guitar', 'drums'], caps = true, pauseStatus = 'paused', overlayApi = true, confirmDialog = true } = {}) {
    const bus = new EventTarget();
    const calls = { playSong: [], showScreen: [], setReturnScreen: [], hold: 0, release: 0, setMastery: [],
        setDifficulty: [], clearDifficulty: [], splitStart: 0, fetch: [], setViz: [],
        karaoke: [], karaokeAt: [], playSongAt: [], hides: [], countIn: [], countInAt: [], nd: [], micHit: [],
        caps: [], audioPause: 0, setMasteryAt: [],
        // Plan 7: full screen, the sidebar's links, core's overlay pause, the loop, note_detect's quiet switch.
        fsRequest: 0, fsExit: 0, nav: [], pause: 0, resume: [], resumeAt: [], loop: [], exitSong: 0, togglePlay: 0,
        ndQuiet: [] };
    // Shared sequence counter: orders karaoke calls against playSong and unmount.
    let seq = 0;
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
    // The song's media element: pause() only records (nothing plays).
    const audio = doc.createElement('audio');
    audio.id = 'audio';
    audio.paused = false;
    audio.pause = () => { calls.audioPause++; audio.paused = true; };
    player.appendChild(audio);
    // The HTML Fullscreen API: records, and only moves doc.fullscreenElement
    // (fullscreenchange is fired by the tests through the doc's listeners).
    doc.fullscreenElement = null;
    doc.documentElement = doc.createElement('html');
    doc.documentElement.requestFullscreen = () => { calls.fsRequest++; doc.fullscreenElement = doc.documentElement; };
    doc.exitFullscreen = () => { calls.fsExit++; doc.fullscreenElement = null; };
    // Core's sidebar, its nav links (each with its own recording click
    // listener, as shell binds them) and the Settings screen.
    const sidebar = doc.createElement('nav');
    sidebar.id = 'v3-sidebar';
    doc.body.appendChild(sidebar);
    const navLinks = {};
    for (const key of ['settings', 'songs', 'build_a_band']) {
        const a = doc.createElement('a');
        a.setAttribute('data-v3-nav', key);
        a.addEventListener('click', () => calls.nav.push(key));
        sidebar.appendChild(a);
        navLinks[key] = a;
    }
    const settingsScreen = doc.createElement('div');
    settingsScreen.id = 'settings';
    settingsScreen.className = 'screen';
    doc.body.appendChild(settingsScreen);
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
        setSongCountInOverride: (v) => { calls.countIn.push(v); calls.countInAt.push(++seq); },
        getDisplayTime: () => clock.t,
        // Core's transport flag (window.feedBack.isPlaying): the song plays.
        isPlaying: true,
        // Core's A-B loop (null: unset).
        getLoop: () => ({ loopA: loop.a, loopB: loop.b }),
    };
    const loop = { a: null, b: null };
    // Core's overlay pause (plan 7 R10): records only, nothing plays.
    if (overlayApi) {
        fb.pauseForOverlay = () => { calls.pause++; ++seq; return { wasPlaying: true, gen: 1 }; };
        fb.resumeAfterOverlay = (token) => { calls.resume.push(token); calls.resumeAt.push(++seq); return true; };
    }
    // Core's capability host, recording [name, request] into calls.caps. Nothing plays:
    // stems mutes are only recorded, and playback pause answers with pauseStatus.
    if (caps) {
        fb.capabilities = {
            claim: (req) => { calls.caps.push(['claim', req]); return () => {}; },
            release: (req) => { calls.caps.push(['release', req]); return { ok: true }; },
            dispatch: (req) => {
                calls.caps.push(['dispatch', req]);
                if (req.capability === 'playback') return Promise.resolve({ outcome: 'handled', status: pauseStatus });
                return Promise.resolve({ outcome: 'handled', status: 'applied' });
            },
        };
    }
    // The song's display time, moved by the tests.
    const clock = { t: 0 };
    // The chart: highway time, beats and phrases (overdrive), moved by the tests.
    const chart = { t: 0, beats: [], phrases: null };
    // What the drums engine and karaoke report for overdrive (null: nothing).
    const od = { drums: null, vocals: null };
    let ssActive = false;
    const storage = memStorage(storageInit);
    const win = {
        feedBack: fb,
        localStorage: storage,
        highway: {
            setMastery: (f) => { calls.setMastery.push(f); calls.setMasteryAt.push(++seq); },
            // Ten single notes at the band mastery.
            getFilteredNotes: () => Array.from({ length: 10 }, (_, i) => ({ t: i, s: 0, f: 3 })),
            getFilteredChords: () => [],
            getBeats: () => chart.beats,
            getPhrases: () => chart.phrases,
            getTime: () => chart.t,
        },
        setMastery: () => { throw new Error('window.setMastery persists; never call it'); },
        playSong: (f, i) => { calls.playSongAt.push(++seq); calls.playSong.push([f, i]); },
        showScreen: (id) => calls.showScreen.push(id),
        setLoopStart: () => { calls.loop.push('start'); loop.a = 1; },
        setLoopEnd: () => { calls.loop.push('end'); loop.b = 2; },
        clearLoop: () => { calls.loop.push('clear'); loop.a = null; loop.b = null; },
        requestExitSong: () => { calls.exitSong++; },
        togglePlay: () => { calls.togglePlay++; },
        setViz: (id) => { calls.setViz.push(id); storage.setItem('vizSelection', id); },
        feedBackViz_drums: () => ({ draw() {} }),
        feedBackDrums: {
            setDifficulty: (id, c) => calls.setDifficulty.push([id, c]),
            clearDifficulty: (c) => calls.clearDifficulty.push(c),
            setScoreHudHidden: (c, v) => { calls.hides.push(['drums', c, v]); return true; },
            getInstanceState: (c) => (typeof od.drums === 'function' ? od.drums(c) : od.drums),
        },
        noteDetect: {
            setScoreHudHidden: (v) => { calls.hides.push(['nd', v]); return true; },
            // Detection on/off, recorded into calls.nd.
            enabled: false,
            isEnabled() { return this.enabled; },
            enable() { calls.nd.push(['enable']); this.enabled = true; return Promise.resolve(true); },
            disable(o) { calls.nd.push(['disable', o]); this.enabled = false; },
            // The input-error quiet switch (plan 7 R16), recorded into calls.ndQuiet.
            quiet: false,
            setInputErrorsQuiet(v) { calls.ndQuiet.push(v); this.quiet = !!v; },
            isInputErrorsQuiet() { return this.quiet; },
        },
        feedBackScorecard: { setHudHidden: (v) => { calls.hides.push(['scorecard', v]); return true; } },
        slopsmithSplitscreen: { isActive: () => ssActive, start: () => { calls.splitStart++; }, stop() { ssActive = false; } },
        stems: { getState: () => stems.map((id) => ({ id, on: true, vol: 1 })) },
    };
    // note_detect's judgments arrive on window.
    const winEvents = new EventTarget();
    win.addEventListener = (t, f) => winEvents.addEventListener(t, f);
    win.removeEventListener = (t, f) => winEvents.removeEventListener(t, f);
    win.dispatchEvent = (e) => winEvents.dispatchEvent(e);
    // Core's _confirmDialog: each prompt waits until the test settles it. As
    // core's, it appends a .feedBack-modal synchronously; its [data-cancel]
    // click answers false; any answer removes it.
    const prompts = [];
    if (confirmDialog) {
        win._confirmDialog = (args) => new Promise((resolve, reject) => {
            const modal = doc.createElement('div');
            modal.className = 'feedBack-modal';
            const cancel = doc.createElement('button');
            cancel.setAttribute('data-cancel', '');
            modal.appendChild(cancel);
            doc.body.appendChild(modal);
            const p = { args, modal, settled: false };
            const done = (f) => (v) => { if (p.settled) return; p.settled = true; modal.remove(); f(v); };
            p.resolve = done(resolve);
            p.reject = done(reject);
            cancel.addEventListener('click', () => p.resolve(false));
            prompts.push(p);
        });
    }
    // Lyrics Karaoke's v1 API, recording [name, arg] into calls.karaoke.
    if (karaoke) {
        const rec = (name, ...args) => { calls.karaoke.push([name, ...args]); calls.karaokeAt.push(++seq); };
        win.lyricsKaraoke = {
            apiVersion: 1,
            mountStrip: (el) => { rec('mountStrip', el); return true; },
            setKaraokeMode: (on) => { rec('setKaraokeMode', on); return Promise.resolve(on ? karaokePitch : false); },
            startMic: () => { rec('startMic'); return Promise.resolve('listening'); },
            stopMic: () => { rec('stopMic'); },
            setDifficulty: (id) => { rec('setDifficulty', id); return true; },
            setHearMyself: (on) => { rec('setHearMyself', on); return true; },
            // Recorded with the other plugins' hide switches.
            setScoreHudHidden: (v) => { calls.hides.push(['karaoke', v]); return true; },
            getOverdrive: () => od.vocals,
            setMicHitThreshold: (db) => { calls.micHit.push(db); },
        };
    }
    const mounts = [];
    const mountStage = ({ player: p, song, prefs }) => {
        if (mountFails) throw new Error('mount failed');
        // The real stage stops splitscreen, which clears the stored pref.
        storage.setItem('splitscreenActive', 'false');
        // The real stage's slots: a lane per playing part, a drum-lane canvas
        // beside a guitar lane (drums alone draws on #highway), the strip.
        const on = (id) => !!(prefs.parts[id] && prefs.parts[id].on);
        const root = doc.createElement('div');
        root.className = 'bab-stage-root';
        p.appendChild(root);
        const lanes = {};
        // drumLane false: the real stage's fallback to a guitar lane only.
        const laneParts = on('guitar') && !drumLane ? ['guitar'] : ['guitar', 'drums'];
        for (const id of laneParts) {
            if (!on(id)) continue;
            lanes[id] = doc.createElement('div');
            lanes[id].className = 'bab-lane';
            root.appendChild(lanes[id]);
        }
        const drumCanvas = on('guitar') && on('drums') && drumLane ? doc.createElement('canvas') : null;
        if (drumCanvas) lanes.drums.appendChild(drumCanvas);
        const stripSlot = on('vocals') ? doc.createElement('div') : null;
        if (stripSlot) root.appendChild(stripSlot);
        const s = { player: p, song, prefs, unmounted: 0, unmountedAt: null, stripSlot, lanes, drumCanvas,
            laneSlot: (id) => lanes[id] || null,
            getDrumCanvas: () => drumCanvas,
            unmount() { this.unmounted++; this.unmountedAt = ++seq; root.remove(); } };
        mounts.push(s);
        return s;
    };
    const timers = manualTimers();
    const fetchJson = async (url) => { calls.fetch.push(url); return settings; };
    const makeRuntime = () => createBandRuntime({ win, doc, mountStage, loadPrefs: () => prefsWith(), storage, fetchJson,
        setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    const rt = makeRuntime();

    // Core's playSong side: loading, then the song becomes current and is ready.
    function loadSong(item, { hasPhraseData = true } = {}) {
        fb.emit('song:loading', { filename: item.filename });
        fb.currentSong = { filename: item.filename, arrangements: item.arrangements, hasDrumTab: !!item.has_drum_tab,
            hasVocalPitch: !!item.has_vocal_pitch };
        fb.emit('song:loaded', fb.currentSong);
        fb.emit('song:ready', { hasPhraseData });
    }
    const fireWin = (type, detail) => win.dispatchEvent(new CustomEvent(type, { detail }));
    // A cancelable keydown on window (the runtime's and the overlays' capture listeners).
    const keyWin = (code, key, mods = {}) => {
        const e = new Event('keydown', { cancelable: true });
        Object.assign(e, { code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
        win.dispatchEvent(e);
        return e;
    };
    return { rt, fb, doc, win, calls, mounts, storage, timers, player, highwayCanvas, bandScreen, loadSong, clock, chart, od, fireWin, audio,
        sidebar, navLinks, settingsScreen, prompts, keyWin,
        makeRuntime, setSplit: (v) => { ssActive = v; },
        // The next mount's stage: with or without a drum lane beside guitar.
        setDrumLane: (v) => { drumLane = v; } };
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

test('drums only: plays the drum arrangement, mounts the stage (R10), pins the drum difficulty to #highway', () => {
    const { rt, fb, doc, calls, mounts, loadSong, highwayCanvas } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false }, drums: { difficulty: 'hard' } }) });
    assert.deepEqual(calls.playSong, [['Beat.sloppak', 1]]);
    loadSong(DRUM_ITEM);
    assert.equal(mounts.length, 1, 'drums alone gets a stage');
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

test('song:ended holds auto-exit and shows the results; Next song releases once and shows the band screen', () => {
    const { rt, fb, calls, mounts, loadSong, timers, player } = setup();
    rt.startSession({ song: { ...ITEM, title: 'Everlong', artist: 'Foo Fighters' }, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    assert.equal(calls.hold, 1);
    assert.equal(calls.release, 0);
    assert.equal(rt.phase(), 'ending');
    const results = player.querySelector('.bab-results');
    assert.ok(results, 'the results show in #player');
    assert.equal(results.querySelector('.bab-results-sub').textContent, 'Everlong · Foo Fighters');
    assert.deepEqual(results.querySelectorAll('.bab-card').map((c) => c.getAttribute('data-part')), ['guitar'], 'ITEM has no drum chart');
    assert.ok(!timers.delays().includes(1500), 'no 1.5 s exit');
    assert.equal(mounts[0].unmounted, 0, 'the stage stays under the results');
    rt.next();
    assert.equal(calls.release, 1);
    assert.equal(mounts[0].unmounted, 1);
    assert.deepEqual(calls.showScreen, ['plugin-build_a_band']);
    assert.equal(player.querySelector('.bab-results'), null);
    assert.equal(rt.phase(), 'idle');
    rt.next();
    assert.equal(calls.release, 1, 'released once');
    fb.emit('song:ended', {});
    assert.equal(calls.hold, 1, 'no hold outside a session');
    rt.dispose();
});

test('the band screen is not re-shown when release already returned to it', () => {
    const { rt, fb, calls, loadSong, bandScreen } = setup();
    fb.holdAutoExit = () => () => {
        calls.release++;
        bandScreen.classList.add('active');
        fb.emit('screen:changing', { id: 'plugin-build_a_band', from: 'player' });
    };
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    rt.next();
    assert.equal(calls.release, 1);
    assert.deepEqual(calls.showScreen, []);
    rt.dispose();
});

test('Play again tears down and starts the same song with the same prefs', async () => {
    const { rt, fb, calls, mounts, loadSong, player } = setup();
    const prefs = prefsWith({ guitar: { arrangement: 'Bass', difficulty: 'hard' } });
    rt.startSession({ song: ITEM, prefs });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    rt.again();
    assert.equal(calls.release, 0, 'the held exit is dropped, never released');
    assert.equal(mounts[0].unmounted, 1);
    assert.equal(player.querySelector('.bab-results'), null);
    assert.deepEqual(calls.playSong, [['My%20Song.sloppak', 1], ['My%20Song.sloppak', 1]]);
    assert.deepEqual(calls.showScreen, []);
    assert.equal(rt.phase(), 'armed');
    loadSong(ITEM);
    assert.equal(rt.phase(), 'playing');
    assert.equal(mounts.length, 2);
    assert.equal(mounts[1].prefs.parts.guitar.difficulty, 'hard');
    assert.equal(calls.hold, 1);
    fb.emit('song:ended', {});
    assert.equal(calls.hold, 2, 'the replayed session ends with results too');
    assert.ok(player.querySelector('.bab-results'));
    rt.dispose();
    assert.equal(player.querySelector('.bab-results'), null);
});

test('a Play again whose playSong rejects warns and leaves the runtime idle', async () => {
    const { rt, fb, win, loadSong } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    win.playSong = () => Promise.reject(new Error('load failed'));
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a);
    try {
        rt.again();
        await flush();
    } finally { console.warn = warn; }
    assert.equal(rt.phase(), 'idle');
    assert.ok(warns.some((a) => a.some((x) => x instanceof Error && /load failed/.test(x.message))));
    rt.dispose();
});

test('leaving while the results show tears down without releasing', () => {
    for (const leave of [
        (e) => e.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' }),
        (e) => e.fb.emit('song:loading', { filename: 'next.psarc' }),
        (e) => e.fb.emit('song:stop', {}),
    ]) {
        const env = setup();
        env.rt.startSession({ song: ITEM, prefs: prefsWith() });
        env.loadSong(ITEM);
        env.fb.emit('song:ended', {});
        assert.ok(env.player.querySelector('.bab-results'));
        leave(env);
        assert.equal(env.rt.phase(), 'idle');
        assert.equal(env.calls.release, 0);
        assert.equal(env.mounts[0].unmounted, 1);
        assert.equal(env.player.querySelector('.bab-results'), null);
        assert.deepEqual(env.calls.showScreen, []);
        env.rt.next();
        env.rt.again();
        assert.equal(env.calls.release, 0);
        assert.equal(env.calls.playSong.length, 1);
        env.rt.dispose();
    }
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

// ── Effective parts: a part plays only when it is on AND the song has its chart ──

test('a drum-only pack with default prefs is a drums-only session', () => {
    const { rt, calls, mounts, loadSong, highwayCanvas } = setup();
    const kit = { filename: 'Kit.sloppak', arrangements: [{ index: 0, name: 'Drums' }] };
    rt.startSession({ song: kit, prefs: prefsWith() });
    assert.deepEqual(calls.playSong, [['Kit.sloppak', 0]]);
    loadSong(kit);
    assert.equal(mounts.length, 1, 'drums alone gets a stage');
    assert.equal(mounts[0].prefs.parts.guitar.on, false, 'no guitar lane for a song with no guitar part');
    assert.deepEqual(calls.setMastery, [], 'no guitar mastery');
    assert.deepEqual(calls.setDifficulty, [['medium', highwayCanvas]]);
    assert.deepEqual(calls.setViz, [], 'a Drums arrangement needs no view switch');
    rt.dispose();
});

test('guitar set to Bass on a song with no Bass plays the Lead index', () => {
    const { rt, calls } = setup();
    const song = { filename: 'g.sloppak', arrangements: [{ index: 0, name: 'Rhythm' }, { index: 2, name: 'Lead' }] };
    rt.startSession({ song, prefs: prefsWith({ guitar: { arrangement: 'Bass' } }) });
    assert.deepEqual(calls.playSong, [['g.sloppak', 2]]);
    rt.dispose();
});

test('vocals on with no vocal pitch is ignored', async () => {
    const { rt, calls, mounts, loadSong, storage } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith({ vocals: { on: true, deviceId: 'usb-mic' } }) });
    loadSong(ITEM);
    await flush();
    assert.equal(mounts[0].prefs.parts.vocals.on, false);
    assert.equal(mounts[0].prefs.parts.drums.on, false, 'drums has no chart on this song either');
    assert.equal(storage.getItem('lyrics_karaoke.deviceId'), null, 'karaoke mic left alone');
    rt.dispose();
    assert.deepEqual(calls.karaoke, [], 'karaoke never called');
});

test('drums only plays the drum arrangement index, not its list position', () => {
    const { rt, calls } = setup();
    const song = { filename: 'd.sloppak', arrangements: [{ index: 0, name: 'Lead' }, { index: 2, name: 'Drums' }] };
    rt.startSession({ song, prefs: prefsWith({ guitar: { on: false } }) });
    assert.deepEqual(calls.playSong, [['d.sloppak', 2]]);
    rt.dispose();
});

const TAB = { filename: 'deep.feedpak', has_drum_tab: true,
    arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Bass' }] };

// Watches every write to the saved view.
function trackViz(storage) {
    const writes = [];
    const set = storage.setItem, remove = storage.removeItem;
    storage.setItem = (k, v) => { if (k === 'vizSelection') writes.push(['set', v]); set(k, v); };
    storage.removeItem = (k) => { if (k === 'vizSelection') writes.push(['remove']); remove(k); };
    return writes;
}

test('drums only on a drum-tab-only pack installs the drums renderer on song:ready without saving it', () => {
    const { rt, fb, win, calls, mounts, loadSong, highwayCanvas, storage } = setup({
        storageInit: { splitscreenActive: 'true', vizSelection: 'highway_3d' } });
    const installed = [];
    const drumsRenderer = { draw() {} };
    win.feedBackViz_drums = () => drumsRenderer;
    win.highway.setRenderer = (r) => installed.push(r);
    const writes = trackViz(storage);
    rt.startSession({ song: TAB, prefs: prefsWith({ guitar: { on: false } }) });
    assert.deepEqual(calls.playSong, [['deep.feedpak', undefined]], 'any arrangement streams the drum tab');
    assert.deepEqual(installed, [], 'nothing before the band song is ready');
    loadSong(TAB);
    assert.equal(mounts.length, 1, 'drums alone gets a stage');
    assert.deepEqual(installed, [drumsRenderer], 'installed on song:ready');
    assert.deepEqual(calls.setViz, [], 'never through setViz, which saves the pick');
    assert.equal(storage.getItem('vizSelection'), 'highway_3d');
    assert.deepEqual(calls.setDifficulty, [['medium', highwayCanvas]]);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.setViz, ['highway_3d'], "the user's saved view is re-applied");
    assert.equal(storage.getItem('vizSelection'), 'highway_3d');
    assert.ok(writes.every((w) => w[0] === 'set' && w[1] === 'highway_3d'), JSON.stringify(writes));
    rt.dispose();
});

test('with no saved view, teardown re-applies the picker view and leaves nothing saved', () => {
    const { rt, fb, win, doc, calls, loadSong, storage } = setup();
    win.highway.setRenderer = () => {};
    const picker = doc.createElement('select');
    picker.id = 'viz-picker';
    picker.value = 'highway_3d';
    doc.body.appendChild(picker);
    rt.startSession({ song: TAB, prefs: prefsWith({ guitar: { on: false } }) });
    loadSong(TAB);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.setViz, ['highway_3d']);
    assert.equal(storage.getItem('vizSelection'), null, "never 'auto' or anything else");
    rt.dispose();
});

// ── Vocals: karaoke joins the band session ──

const PITCH_ITEM = { ...ITEM, filename: 'Sing.sloppak', has_vocal_pitch: true };
const SINGER = { on: true, difficulty: 'hard', hearMyself: false, deviceId: 'usb-mic' };
const names = (calls) => calls.karaoke.map((c) => c[0]);

test('Go with vocals arms difficulty and hear-myself before playSong', () => {
    const { rt, calls } = setup();
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    assert.deepEqual(calls.karaoke.slice(0, 2), [['setDifficulty', 'hard'], ['setHearMyself', false]]);
    assert.equal(calls.playSong.length, 1);
    assert.ok(calls.karaokeAt[1] < calls.playSongAt[0], 'armed before playSong');
    assert.ok(!names(calls).includes('setKaraokeMode'), 'karaoke mode waits for song:ready');
    rt.dispose();
});

test('song:ready hosts the strip in the stage slot, then starts the mic with the band mic', async () => {
    const { rt, calls, mounts, loadSong, storage } = setup();
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    assert.equal(mounts.length, 1);
    assert.ok(mounts[0].stripSlot);
    assert.deepEqual(calls.karaoke.slice(2), [['mountStrip', mounts[0].stripSlot], ['setKaraokeMode', true], ['startMic']]);
    assert.equal(storage.getItem('lyrics_karaoke.deviceId'), 'usb-mic');
    rt.dispose();
});

test('vocals alone is a session: no arrangement index, the stage mounts', async () => {
    const { rt, calls, mounts, loadSong } = setup();
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ guitar: { on: false }, drums: { on: false }, vocals: SINGER }) });
    assert.deepEqual(calls.playSong, [['Sing.sloppak', undefined]]);
    loadSong(PITCH_ITEM);
    await flush();
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].prefs.parts.vocals.on, true);
    assert.equal(rt.isMounted(), true);
    assert.ok(names(calls).includes('startMic'));
    rt.dispose();
});

test('teardown stops karaoke before the stage unmounts and clears every override', async () => {
    const { rt, fb, calls, mounts, loadSong } = setup();
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    const n = calls.karaoke.length;
    fb.emit('screen:changing', { id: 'v3-songs', from: 'player' });
    assert.deepEqual(calls.karaoke.slice(n), [
        ['stopMic'], ['setKaraokeMode', false], ['mountStrip', null], ['setDifficulty', null], ['setHearMyself', null],
    ]);
    assert.equal(mounts[0].unmounted, 1);
    assert.ok(calls.karaokeAt.slice(n).every((at) => at < mounts[0].unmountedAt), 'all before the stage unmounts');
    rt.dispose();
});

test('no karaoke plugin: vocals sits out and karaoke is never called', async () => {
    const { rt, calls, mounts, loadSong, storage } = setup({ karaoke: false });
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    assert.equal(mounts[0].prefs.parts.vocals.on, false);
    assert.equal(mounts[0].stripSlot, null);
    assert.deepEqual(calls.karaoke, []);
    assert.equal(storage.getItem('lyrics_karaoke.deviceId'), null);
    rt.dispose();
});

// Vocals only plays at Go when the library item has_vocal_pitch, so a refused
// karaoke mode is a failure, not a missing chart.
test('karaoke mode refused for a song the library lists with pitch: "Vocals couldn\'t start", no mic', async () => {
    const { rt, calls, loadSong, player } = setup({ karaokePitch: false });
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    const toasts = player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
    assert.deepEqual(toasts, ["Vocals couldn't start"]);
    assert.ok(!names(calls).includes('startMic'));
    rt.dispose();
});

test('karaoke\'s mic failing to start (no mic picked, denied) says "Vocals couldn\'t start"', async () => {
    const { rt, win, calls, loadSong, player } = setup();
    win.lyricsKaraoke.startMic = () => { calls.karaoke.push(['startMic']); return Promise.resolve('error'); };
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    assert.ok(names(calls).includes('startMic'));
    const toasts = player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
    assert.deepEqual(toasts, ["Vocals couldn't start"]);
    rt.dispose();
});

test('the stage failing to mount with vocals armed says "Vocals couldn\'t start" and opens no mic', async () => {
    const { rt, calls, loadSong, player } = setup({ mountFails: true });
    const error = console.error;
    const errors = [];
    console.error = (...a) => errors.push(a.join(' '));
    try {
        rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
        loadSong(PITCH_ITEM);
    } finally {
        console.error = error;
    }
    await flush();
    assert.ok(errors.some((e) => /stage failed to mount/.test(e)));
    const toasts = player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
    assert.deepEqual(toasts, ["Vocals couldn't start"]);
    assert.ok(!names(calls).includes('startMic'));
    rt.dispose();
});

test('the stage failing to mount without vocals shows no vocals toast', () => {
    const { rt, loadSong, player } = setup({ mountFails: true });
    const error = console.error;
    console.error = () => {};
    try {
        rt.startSession({ song: ITEM, prefs: prefsWith() });
        loadSong(ITEM);
    } finally {
        console.error = error;
    }
    const toasts = player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
    assert.ok(!toasts.includes("Vocals couldn't start"), JSON.stringify(toasts));
    rt.dispose();
});

test('leaving the player while karaoke is loading never opens the mic', async () => {
    const { rt, fb, win, calls, loadSong } = setup();
    let resolve;
    const real = win.lyricsKaraoke.setKaraokeMode;
    win.lyricsKaraoke.setKaraokeMode = (on) => {
        real(on);
        return on ? new Promise((r) => { resolve = r; }) : Promise.resolve(false);
    };
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    assert.equal(typeof resolve, 'function', 'karaoke mode requested');
    fb.emit('screen:changing', { from: 'player', id: 'v3-songs' });
    resolve(true);
    await flush();
    assert.ok(!names(calls).includes('startMic'));
    assert.deepEqual(calls.karaoke.at(-1), ['setKaraokeMode', false], 'karaoke mode not left on');
    rt.dispose();
});

test('a splitscreen remount re-hosts the strip in the new slot', async () => {
    const env = setup();
    const { rt, calls, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    ss.start();
    timers.fire(50);
    assert.equal(mounts.length, 2);
    const strips = calls.karaoke.filter((c) => c[0] === 'mountStrip');
    assert.equal(strips.at(-1)[1], mounts[1].stripSlot);
    assert.notEqual(mounts[1].stripSlot, mounts[0].stripSlot);
    rt.dispose();
});

test('drums alone with vocals: the stage mounts and the drum difficulty is pinned to #highway', async () => {
    const { rt, fb, calls, mounts, loadSong, highwayCanvas } = setup();
    const item = { ...DRUM_ITEM, filename: 'BeatSing.sloppak', has_vocal_pitch: true };
    rt.startSession({ song: item, prefs: prefsWith({ guitar: { on: false }, drums: { difficulty: 'hard' }, vocals: SINGER }) });
    assert.deepEqual(calls.playSong, [['BeatSing.sloppak', 1]], 'the drum arrangement on the main highway');
    loadSong(item);
    await flush();
    assert.equal(mounts.length, 1, 'the strip needs a stage');
    assert.equal(mounts[0].prefs.parts.guitar.on, false);
    assert.equal(mounts[0].prefs.parts.drums.on, true);
    assert.equal(mounts[0].prefs.parts.vocals.on, true);
    assert.deepEqual(calls.setDifficulty, [['hard', highwayCanvas]]);
    assert.ok(names(calls).includes('startMic'));
    fb.emit('song:stop', {});
    assert.equal(mounts[0].unmounted, 1);
    assert.ok(calls.clearDifficulty.includes(highwayCanvas));
    rt.dispose();
});

test("hear-myself off that karaoke didn't take: no mic, toast, overrides still cleared", async () => {
    for (const broken of [() => false, () => { throw new Error('boom'); }]) {
        const { rt, fb, win, calls, mounts, loadSong, player, storage } = setup();
        const real = win.lyricsKaraoke.setHearMyself;
        win.lyricsKaraoke.setHearMyself = (on) => { real(on); return on === false ? broken() : true; };
        const warns = [];
        const warn = console.warn;
        console.warn = (...a) => warns.push(a.join(' '));
        try {
            rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
        } finally {
            console.warn = warn;
        }
        assert.ok(warns.some((w) => /hear-myself off could not be applied/.test(w)));
        loadSong(PITCH_ITEM);
        await flush();
        assert.deepEqual(names(calls), ['setDifficulty', 'setHearMyself'], 'nothing past arming');
        assert.equal(mounts[0].prefs.parts.vocals.on, false, 'vocals sits out: no strip');
        assert.equal(storage.getItem('lyrics_karaoke.deviceId'), null, 'mic id never written');
        const toasts = player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
        assert.ok(toasts.includes("Vocals couldn't start"), JSON.stringify(toasts));
        fb.emit('song:stop', {});
        assert.deepEqual(calls.karaoke.slice(-3), [['mountStrip', null], ['setDifficulty', null], ['setHearMyself', null]]);
        rt.dispose();
    }
});

test('splitscreen still up at song:ready: vocals start once the stage mounts after it is down', async () => {
    const env = setup();
    const { rt, calls, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    ss.stop = () => { ss.stops++; };
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    ss.active = true;
    env.fb.emit('splitscreen:panels-changed', {});
    loadSong(PITCH_ITEM);
    await flush();
    assert.equal(mounts.length, 0);
    assert.ok(!names(calls).includes('setKaraokeMode'), 'nothing before the stage');
    ss.active = false;
    timers.fire(50);
    await flush();
    assert.equal(mounts.length, 1);
    assert.deepEqual(calls.karaoke.slice(2), [['mountStrip', mounts[0].stripSlot], ['setKaraokeMode', true], ['startMic']]);
    rt.dispose();
});

// ── Plan 4: scoring, the band HUD and the plugins' hide switches ──

const scoreText = (player) => {
    const el = player.querySelector('.bab-hud-score');
    return el ? el.textContent : null;
};
const guitarHit = (extra = {}) => ({ isDefault: true, counted: true, hit: true, points: 50, multiplier: 1, streak: 1, ...extra });
const FULL_ITEM = { ...DRUM_ITEM, filename: 'Full.sloppak', has_vocal_pitch: true };

test('Go forces the song count-in, and teardown clears it', () => {
    const { rt, fb, calls, loadSong } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    assert.deepEqual(calls.countIn, [true]);
    assert.ok(calls.countInAt[0] < calls.playSongAt[0], 'forced before playSong');
    loadSong(ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.countIn, [true, null]);
    rt.dispose();
    assert.deepEqual(calls.countIn, [true, null], 'cleared once');
});

test("mount hides every plugin's own score display; leaving shows them again", () => {
    const { rt, fb, doc, calls, mounts, loadSong } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    assert.ok(doc.body.classList.contains('bab-band-song'), 'set at session start, before any count-in');
    loadSong(DRUM_ITEM);
    const lane = mounts[0].drumCanvas;
    assert.ok(lane);
    assert.deepEqual(calls.hides, [['nd', true], ['drums', lane, true], ['scorecard', true]]);
    assert.ok(doc.body.classList.contains('bab-band-song'));
    assert.ok(doc.getElementById('player').querySelector('.bab-hud'), 'the band HUD is up');
    fb.emit('screen:changing', { id: 'v3-songs', from: 'player' });
    assert.deepEqual(calls.hides.slice(3).sort(), [['drums', lane, false], ['nd', false], ['scorecard', false]].sort());
    assert.equal(doc.body.classList.contains('bab-band-song'), false);
    assert.equal(doc.getElementById('player').querySelector('.bab-hud'), null);
    rt.dispose();
});

test('every way a session ends gives each display back and clears the count-in override', () => {
    const exits = {
        stop: (e) => e.fb.emit('song:stop', {}),
        leave: (e) => e.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' }),
        'new song': (e) => e.fb.emit('song:loading', { filename: 'next.psarc' }),
        'song end': (e) => { e.fb.emit('song:ended', {}); e.rt.next(); },
        'end then leave': (e) => { e.fb.emit('song:ended', {}); e.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' }); },
        dispose: (e) => e.rt.dispose(),
        'splitscreen thrice': (e) => {
            const ss = fakeSplitscreen(e);
            const warn = console.warn;
            console.warn = () => {};
            try { ss.start(); e.timers.fire(50); ss.start(); e.timers.fire(50); ss.start(); } finally { console.warn = warn; }
        },
    };
    for (const [name, exit] of Object.entries(exits)) {
        const env = setup();
        env.rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
        env.fb.emit('count-in:tick', { n: 1, total: 4 });
        env.loadSong(FULL_ITEM, { hasPhraseData: false });
        assert.ok(env.player.querySelector('.bab-toasts'), `${name}: a toast is up`);
        assert.ok(env.player.querySelector('.bab-countin'), `${name}: the count-in is up`);
        assert.ok(env.calls.hides.some((h) => h[0] === 'karaoke' && h[1] === true), name);
        exit(env);
        assert.equal(env.rt.phase(), 'idle', name);
        const last = new Map();
        // The last call per switch (per canvas for drums).
        for (const h of env.calls.hides) last.set(h.length === 3 ? h[1] : h[0], h.at(-1));
        assert.ok(last.size >= 3, name);
        assert.ok([...last.values()].every((v) => v === false), `${name}: ${JSON.stringify([...last].map(([k, v]) => [typeof k === 'string' ? k : 'canvas', v]))}`);
        assert.equal(env.calls.countIn.at(-1), null, name);
        assert.equal(env.doc.body.classList.contains('bab-band-song'), false, name);
        assert.equal(env.player.querySelector('.bab-hud'), null, name);
        assert.equal(env.player.querySelector('.bab-part-hud'), null, name);
        assert.equal(env.player.querySelector('.bab-toasts'), null, `${name}: toasts cleared`);
        assert.equal(env.player.querySelector('.bab-countin'), null, `${name}: count-in gone`);
        assert.equal(last.get('karaoke'), false, `${name}: karaoke's own HUD back`);
        env.rt.dispose();
    }
});

test('a failed mount or a failed Go still clears the count-in override and the body class', async () => {
    const a = setup({ mountFails: true });
    const error = console.error;
    console.error = () => {};
    try {
        a.rt.startSession({ song: ITEM, prefs: prefsWith() });
        a.loadSong(ITEM);
    } finally { console.error = error; }
    assert.deepEqual(a.calls.hides, [], 'no band HUD, so the plugins keep theirs');
    a.fb.emit('song:stop', {});
    assert.deepEqual(a.calls.countIn, [true, null]);
    assert.equal(a.doc.body.classList.contains('bab-band-song'), false);
    a.rt.dispose();
    const b = setup();
    b.win.playSong = () => Promise.reject(new Error('load failed'));
    await assert.rejects(b.rt.startSession({ song: ITEM, prefs: prefsWith() }), /load failed/);
    assert.deepEqual(b.calls.countIn, [true, null]);
    assert.equal(b.doc.body.classList.contains('bab-band-song'), false);
    b.rt.dispose();
});

test("a guitar hit from the default detector scores; a panel detector's doesn't", () => {
    const { rt, loadSong, player, fireWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    assert.equal(scoreText(player), '0');
    fireWin('notedetect:hit', guitarHit());
    assert.equal(scoreText(player), '50');
    fireWin('notedetect:hit', guitarHit({ isDefault: false }));
    assert.equal(scoreText(player), '50');
    fireWin('notedetect:hit', guitarHit({ counted: false }));
    assert.equal(scoreText(player), '50');
    rt.dispose();
});

test('a guitar judgment delivered twice (window, then bubbled from its instance root) counts once', () => {
    const { rt, loadSong, player, fireWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    const detail = guitarHit();
    fireWin('notedetect:hit', detail);
    fireWin('notedetect:hit', detail);
    assert.equal(scoreText(player), '50');
    const miss = { isDefault: true, counted: true, hit: false, points: 0, multiplier: 1, streak: 0 };
    fireWin('notedetect:miss', miss);
    fireWin('notedetect:miss', miss);
    assert.equal(rt.snapshot().parts.guitar.misses, 1);
    fireWin('notedetect:hit', guitarHit());
    assert.equal(scoreText(player), '100', 'a new judgment still scores');
    rt.dispose();
});

test("drums events score only from the band's drum canvas", () => {
    const { rt, fb, doc, mounts, loadSong, player, clock } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    const lane = mounts[0].drumCanvas;
    clock.t = 3;
    fb.emit('drums:hit', { canvas: doc.createElement('canvas'), points: 30, multiplier: 1, combo: 1 });
    assert.equal(scoreText(player), '0');
    fb.emit('drums:hit', { canvas: lane, points: 30, multiplier: 1, combo: 1, stars: 0.5 });
    assert.equal(scoreText(player), '30');
    fb.emit('drums:miss', { canvas: lane, multiplier: 1, combo: 0 });
    fb.emit('drums:overhit', { canvas: lane, multiplier: 1, combo: 0 });
    const d = rt.snapshot().parts.drums;
    assert.deepEqual([d.hits, d.misses, d.overhits, d.stars], [1, 1, 1, 0.5]);
    rt.dispose();
});

test('drums alone scores from #highway and follows its replacement, hiding the new canvas', () => {
    const { rt, fb, doc, calls, loadSong, player, highwayCanvas } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false } }) });
    loadSong(DRUM_ITEM);
    assert.deepEqual(calls.hides, [['drums', highwayCanvas, true], ['scorecard', true]], 'no guitar: note_detect untouched');
    fb.emit('drums:hit', { canvas: highwayCanvas, points: 20, multiplier: 1, combo: 1 });
    assert.equal(scoreText(player), '20');
    const fresh = doc.createElement('canvas');
    fb.emit('highway:canvas-replaced', { oldCanvas: highwayCanvas, newCanvas: fresh });
    assert.deepEqual(calls.hides.at(-1), ['drums', fresh, true]);
    fb.emit('drums:hit', { canvas: highwayCanvas, points: 20, multiplier: 1, combo: 2 });
    assert.equal(scoreText(player), '20', 'the old canvas is no longer the band one');
    fb.emit('drums:hit', { canvas: fresh, points: 20, multiplier: 1, combo: 2 });
    assert.equal(scoreText(player), '40');
    fb.emit('song:stop', {});
    const shown = calls.hides.filter((h) => h[0] === 'drums' && h[2] === false).map((h) => h[1]);
    assert.ok(shown.includes(highwayCanvas) && shown.includes(fresh), 'both canvases shown again');
    rt.dispose();
});

test("the drum lane's replaced canvas is hidden and becomes the band's", () => {
    const { rt, fb, doc, calls, mounts, loadSong, player } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    const lane = mounts[0].drumCanvas;
    const fresh = doc.createElement('canvas');
    // The real stage adopts the clone; the fake follows it.
    mounts[0].getDrumCanvas = () => fresh;
    fb.emit('highway:canvas-replaced', { oldCanvas: lane, newCanvas: fresh });
    assert.deepEqual(calls.hides.at(-1), ['drums', fresh, true]);
    fb.emit('drums:hit', { canvas: fresh, points: 25, multiplier: 1, combo: 1 });
    assert.equal(scoreText(player), '25');
    // A core swap the stage found without an announcement is hidden on first use.
    const quiet = doc.createElement('canvas');
    mounts[0].getDrumCanvas = () => quiet;
    fb.emit('drums:hit', { canvas: quiet, points: 25, multiplier: 1, combo: 2 });
    assert.deepEqual(calls.hides.at(-1), ['drums', quiet, true]);
    assert.equal(scoreText(player), '50');
    fb.emit('song:stop', {});
    const shown = calls.hides.filter((h) => h[0] === 'drums' && h[2] === false).map((h) => h[1]);
    for (const c of [lane, fresh, quiet]) assert.ok(shown.includes(c));
    rt.dispose();
});

test('karaoke phrases score with their totals', async () => {
    const { rt, fb, loadSong, player, clock } = setup();
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    clock.t = 12;
    fb.emit('karaoke:phrase', { phraseIndex: 0, rating: 'Great', accuracy: 0.9, points: 400, multiplier: 2, streak: 3, stars: 2.4 });
    assert.equal(scoreText(player), '400');
    const v = rt.snapshot().parts.vocals;
    assert.deepEqual([v.multiplier, v.streak, v.stars, v.hits], [2, 3, 2.4, 1]);
    fb.emit('karaoke:reset', { multiplier: 1, streak: 0, stars: 1.1 });
    const r = rt.snapshot().parts.vocals;
    assert.deepEqual([r.multiplier, r.streak, r.stars, r.score], [1, 0, 1.1, 400]);
    fb.emit('karaoke:reset', null);
    assert.equal(rt.snapshot().parts.vocals.stars, null);
    rt.dispose();
});

test("a backward seek rewinds the band score; a loop wrap doesn't", () => {
    const { rt, fb, loadSong, player, clock, fireWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    clock.t = 10;
    fireWin('notedetect:hit', guitarHit());
    clock.t = 20;
    fireWin('notedetect:hit', guitarHit({ points: 70, streak: 2 }));
    assert.equal(scoreText(player), '120');
    fb.emit('song:seek', { from: 20, to: 10.5, reason: 'loop-wrap' });
    assert.equal(scoreText(player), '120', 'a loop wrap stays cumulative');
    fb.emit('song:seek', { from: 20, to: 19.98 });
    assert.equal(scoreText(player), '120', 'within 50 ms is not a rewind');
    fb.emit('song:seek', { from: 20, to: 15 });
    assert.equal(scoreText(player), '50');
    fb.emit('song:seek', { from: 15, to: 30 });
    fb.emit('song:seek', { from: NaN, to: 0 });
    assert.equal(scoreText(player), '50', 'forward and malformed seeks keep the score');
    rt.dispose();
});

test("a seek rewinds the ledger before karaoke's reset applies, in either listener order", async () => {
    for (const karaokeFirst of [true, false]) {
        const { rt, fb, loadSong, clock } = setup();
        const onSeek = () => fb.emit('karaoke:reset', { multiplier: 1, streak: 0, stars: 0.3 });
        // Karaoke emits its reset from its own song:seek listener.
        if (karaokeFirst) fb.on('song:seek', onSeek);
        rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
        loadSong(PITCH_ITEM);
        await flush();
        if (!karaokeFirst) fb.on('song:seek', onSeek);
        clock.t = 10;
        fb.emit('karaoke:phrase', { rating: 'Good', accuracy: 0.8, points: 100, multiplier: 1, streak: 1, stars: 1 });
        clock.t = 20;
        fb.emit('karaoke:phrase', { rating: 'Great', accuracy: 0.9, points: 200, multiplier: 2, streak: 2, stars: 2 });
        fb.emit('song:seek', { from: 20, to: 15 });
        const v = rt.snapshot().parts.vocals;
        assert.deepEqual([v.score, v.multiplier, v.streak, v.stars], [100, 1, 0, 0.3], `karaokeFirst=${karaokeFirst}`);
        rt.dispose();
    }
});

test("judgments after the song ended don't score", () => {
    const { rt, fb, loadSong, player, mounts, fireWin } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fireWin('notedetect:hit', guitarHit());
    fb.emit('song:ended', {});
    assert.equal(rt.phase(), 'ending');
    fireWin('notedetect:hit', guitarHit());
    fb.emit('drums:hit', { canvas: mounts[0].drumCanvas, points: 30, multiplier: 1, combo: 1 });
    fb.emit('karaoke:phrase', { points: 100, multiplier: 1, streak: 1 });
    fb.emit('song:seek', { from: 20, to: 0 });
    assert.equal(scoreText(player), '50');
    assert.equal(rt.snapshot().score, 50);
    rt.dispose();
});

test('guitar star thresholds come from the filtered notes at the band mastery', () => {
    const a = setup();
    a.rt.startSession({ song: ITEM, prefs: prefsWith() });
    a.loadSong(ITEM);
    assert.equal(a.rt.snapshot().parts.guitar.stars, 0);
    a.rt.dispose();
    const b = setup();
    b.win.highway.getFilteredNotes = () => [];
    b.rt.startSession({ song: ITEM, prefs: prefsWith() });
    b.loadSong(ITEM);
    assert.equal(b.rt.snapshot().parts.guitar.stars, null);
    b.rt.dispose();
    // The band mastery is applied before the notes are read.
    const c = setup();
    let mastery = null;
    c.win.highway.setMastery = (f) => { mastery = f; };
    c.win.highway.getFilteredNotes = () => (mastery === 0.5 ? [{ t: 1 }] : []);
    c.rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'medium' } }) });
    c.loadSong(ITEM);
    assert.equal(c.rt.snapshot().parts.guitar.stars, 0);
    c.rt.dispose();
});

test('only the parts playing are in the band score', async () => {
    const { rt, loadSong } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(ITEM);
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar'], 'no drum chart, no vocal pitch');
    rt.dispose();
    assert.equal(rt.snapshot(), null, 'no session, no snapshot');
});

test("vocals that couldn't start leave the band, so they never pin it at ×1", async () => {
    const { rt, loadSong, player, fireWin } = setup({ karaokePitch: false });
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    assert.ok(rt.snapshot().parts.vocals);
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar']);
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 1, 'the strip HUD goes too');
    fireWin('notedetect:hit', guitarHit({ multiplier: 2, streak: 10 }));
    assert.equal(rt.snapshot().bandMultiplier, 2);
    assert.ok(Number.isFinite(rt.snapshot().parts.guitar.stars), 'guitar thresholds kept');
    rt.dispose();
});

test('a splitscreen remount keeps the score and re-hosts the HUD', () => {
    const env = setup();
    const { rt, mounts, loadSong, timers, player, fireWin } = env;
    const ss = fakeSplitscreen(env);
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fireWin('notedetect:hit', guitarHit({ multiplier: 2, streak: 12, points: 100 }));
    ss.start();
    timers.fire(50);
    assert.equal(mounts.length, 2);
    assert.equal(scoreText(player), '100');
    assert.equal(player.querySelectorAll('.bab-hud').length, 1);
    const hud = mounts[1].laneSlot('guitar').querySelector('.bab-part-hud');
    assert.ok(hud, 'the guitar lane HUD is in the new lane');
    assert.equal(hud.querySelector('.bab-mult').textContent, '×2');
    assert.ok(mounts[1].laneSlot('drums').querySelector('.bab-part-hud'));
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 2);
    assert.ok(env.calls.hides.some((h) => h[0] === 'drums' && h[1] === mounts[1].drumCanvas && h[2] === true),
        'the new drum lane canvas is hidden');
    rt.dispose();
});

test('toasts stack: one difficulty and no pitch both show', async () => {
    const { rt, loadSong, player } = setup({ karaokePitch: false });
    const item = { ...ITEM, filename: 'Sing2.sloppak', has_vocal_pitch: true };
    rt.startSession({ song: item, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(item, { hasPhraseData: false });
    await flush();
    const box = player.querySelector('.bab-toasts');
    assert.ok(box);
    assert.deepEqual(box.querySelectorAll('div.bab-toast').map((t) => t.textContent),
        ['This chart has one difficulty', "Vocals couldn't start"]);
    rt.dispose();
    assert.equal(player.querySelector('.bab-toasts'), null, 'cleared at teardown');
});

test("the band's count-in shows over the player and goes at teardown", () => {
    const { rt, fb, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    fb.emit('count-in:tick', { n: 1, total: 4 });
    assert.equal(player.querySelector('.bab-countin').textContent, '4', 'drawn before the stage mounts');
    loadSong(ITEM);
    fb.emit('count-in:tick', { n: 2, total: 4 });
    assert.equal(player.querySelector('.bab-countin').textContent, '3');
    fb.emit('song:stop', {});
    assert.equal(player.querySelector('.bab-countin'), null);
    fb.emit('count-in:tick', { n: 3, total: 4 });
    assert.equal(player.querySelector('.bab-countin'), null, 'no longer listening');
    rt.dispose();
});

test('dispose removes every listener: a second runtime on the same bus scores once', () => {
    const env = setup();
    const { fb, win, loadSong, player, fireWin, mounts } = env;
    // Every listener a runtime holds on the bus and on window: [where, event, fn].
    let held = [];
    const track = (where, addFn, removeFn) => [
        (ev, fn, o) => { held.push([where, ev, fn]); addFn(ev, fn, o); },
        (ev, fn, o) => { held = held.filter((h) => !(h[0] === where && h[1] === ev && h[2] === fn)); removeFn(ev, fn, o); },
    ];
    [fb.on, fb.off] = track('bus', fb.on, fb.off);
    [win.addEventListener, win.removeEventListener] = track('win', win.addEventListener, win.removeEventListener);
    const live = { get size() { return held.length; }, [Symbol.iterator]: () => held.map((h) => h[0] + ':' + h[1])[Symbol.iterator]() };
    const first = env.makeRuntime();
    assert.ok(live.size > 0);
    first.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    first.dispose();
    assert.deepEqual([...live], [], 'nothing left listening');
    const second = env.makeRuntime();
    second.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fireWin('notedetect:hit', guitarHit());
    fb.emit('drums:hit', { canvas: mounts.at(-1).drumCanvas, points: 30, multiplier: 1, combo: 1 });
    assert.equal(second.snapshot().score, 80);
    assert.equal(first.snapshot(), null);
    assert.equal(player.querySelectorAll('.bab-hud').length, 1, 'one band HUD');
    assert.equal(scoreText(player), '80');
    second.dispose();
    env.rt.dispose();
});

test('guitar star thresholds apply when the stage mounts after splitscreen went down', () => {
    const env = setup();
    const { rt, mounts, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    ss.stop = () => { ss.stops++; };
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    ss.active = true;
    env.fb.emit('splitscreen:panels-changed', {});
    loadSong(ITEM);
    assert.equal(mounts.length, 0);
    ss.active = false;
    timers.fire(50);
    assert.equal(mounts.length, 1);
    assert.equal(rt.snapshot().parts.guitar.stars, 0);
    rt.dispose();
});

test("the results show this session's numbers", () => {
    const { rt, fb, loadSong, player, fireWin, mounts } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fireWin('notedetect:hit', guitarHit());
    fb.emit('song:ended', {});
    const card = player.querySelector('.bab-results').querySelector('.bab-card[data-part="guitar"]');
    const stats = card.querySelectorAll('.bab-stat').map((r) => r.children.map((c) => c.textContent));
    assert.ok(stats.some(([label, value]) => label === 'Notes hit' && value === '1 / 1'), JSON.stringify(stats));
    assert.equal(card.querySelector('.bab-card-pct').textContent, '100%');
    assert.equal(player.querySelector('.bab-results-score').textContent, '50');
    assert.ok(mounts[0].drumCanvas);
    rt.dispose();
});

test("the drums card reads star power phrases from the band's drum canvas", () => {
    const { rt, fb, win, loadSong, player, mounts } = setup();
    const asked = [];
    win.feedBackDrums.getInstanceState = (c) => {
        asked.push(c);
        return { starPower: { active: false, amount: 0, phrasesHit: 4, phrasesTotal: 5 } };
    };
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fb.emit('song:ended', {});
    assert.deepEqual(asked, [mounts[0].drumCanvas]);
    const stats = player.querySelector('.bab-card[data-part="drums"]').querySelectorAll('.bab-stat')
        .map((r) => r.children.map((c) => c.textContent));
    assert.ok(stats.some(([label, value]) => label === 'Star power phrases' && value === '4 / 5'), JSON.stringify(stats));
    rt.dispose();
});

test('a throwing getInstanceState still shows the results, without star power', () => {
    const { rt, fb, win, loadSong, player } = setup();
    win.feedBackDrums.getInstanceState = () => { throw new Error('boom'); };
    const warn = console.warn;
    console.warn = () => {};
    try {
        rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
        loadSong(DRUM_ITEM);
        fb.emit('song:ended', {});
    } finally { console.warn = warn; }
    const drums = player.querySelector('.bab-card[data-part="drums"]');
    assert.ok(drums);
    assert.ok(!drums.querySelectorAll('.bab-stat').some((r) => r.children[0].textContent === 'Star power phrases'));
    rt.dispose();
});

test('a session whose stage never mounted still ends on the results', () => {
    const { rt, fb, calls, loadSong, player } = setup({ mountFails: true });
    const error = console.error;
    console.error = () => {};
    try {
        rt.startSession({ song: ITEM, prefs: prefsWith() });
        loadSong(ITEM);
    } finally { console.error = error; }
    fb.emit('song:ended', {});
    const results = player.querySelector('.bab-results');
    assert.ok(results);
    assert.equal(results.querySelector('.bab-results-score').textContent, '0');
    assert.equal(results.querySelectorAll('.bab-card').length, 0);
    rt.next();
    assert.equal(calls.release, 1);
    assert.deepEqual(calls.showScreen, ['plugin-build_a_band']);
    rt.dispose();
});

test('results that cannot show fall through to Next song, so the held exit is released', () => {
    const { rt, fb, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    player.remove();
    fb.emit('song:ended', {});
    assert.equal(rt.phase(), 'idle');
    assert.equal(calls.hold, 1);
    assert.equal(calls.release, 1);
    assert.deepEqual(calls.showScreen, ['plugin-build_a_band']);
    rt.dispose();
});

// ── Parts that can't play leave the band (final review I1) ──

test('a drum lane that failed to start leaves the band: ×N from the other parts, no drums HUD or card', () => {
    const { rt, fb, loadSong, player, fireWin } = setup({ drumLane: false });
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar']);
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 1, 'no drums HUD');
    fireWin('notedetect:hit', guitarHit({ multiplier: 3, streak: 20 }));
    assert.equal(rt.snapshot().bandMultiplier, 3);
    fb.emit('song:ended', {});
    assert.deepEqual(player.querySelector('.bab-results').querySelectorAll('.bab-card').map((c) => c.getAttribute('data-part')), ['guitar']);
    rt.dispose();
});

test('drums alone with the drums plugin missing leaves the band', async () => {
    const { rt, win, loadSong, player } = setup();
    delete win.feedBackDrums;
    delete win.feedBackViz_drums;
    const item = { ...DRUM_ITEM, filename: 'BeatSing.sloppak', has_vocal_pitch: true };
    rt.startSession({ song: item, prefs: prefsWith({ guitar: { on: false }, vocals: SINGER }) });
    loadSong(item);
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['vocals']);
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 1, 'the strip HUD only');
    rt.dispose();
});

test('drums alone with the drums plugin present stays in the band', () => {
    const { rt, loadSong } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false } }) });
    loadSong(DRUM_ITEM);
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['drums']);
    rt.dispose();
});

test("vocals' mic failing after guitar judgments still drops vocals", async () => {
    const { rt, win, loadSong, player, fireWin } = setup();
    let fail;
    win.lyricsKaraoke.startMic = () => new Promise((r) => { fail = () => r('error'); });
    rt.startSession({ song: PITCH_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    fireWin('notedetect:hit', guitarHit({ multiplier: 2, streak: 10 }));
    assert.equal(rt.snapshot().bandMultiplier, 1, 'vocals still pins it while it may start');
    fail();
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar']);
    assert.equal(rt.snapshot().bandMultiplier, 2);
    assert.equal(rt.snapshot().parts.guitar.score, 50, 'the guitar judgment is kept');
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 1, 'the strip HUD goes');
    rt.dispose();
});

// ── Play again keeps the plugins' own HUDs hidden (final review M2) ──

test("Play again never shows the plugins' own HUDs between the two sessions", async () => {
    const { rt, fb, calls, loadSong } = setup();
    rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    await flush();
    fb.emit('song:ended', {});
    const n = calls.hides.length;
    rt.again();
    assert.ok(calls.hides.slice(n).every((h) => h.at(-1) === true), 'nothing shown again at the replay teardown');
    loadSong(FULL_ITEM);
    await flush();
    assert.ok(calls.hides.slice(n).every((h) => h.at(-1) === true), JSON.stringify(calls.hides.slice(n).map((h) => [h[0], h.at(-1)])));
    fb.emit('song:stop', {});
    const last = new Map();
    for (const h of calls.hides) last.set(h.length === 3 ? h[1] : h[0], h.at(-1));
    assert.ok([...last.values()].every((v) => v === false), 'a real exit still gives every display back');
    rt.dispose();
});

test('a Play again that fails to start still gives the displays back', async () => {
    const { rt, fb, win, calls, loadSong } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    fb.emit('song:ended', {});
    win.playSong = () => Promise.reject(new Error('load failed'));
    const warn = console.warn;
    console.warn = () => {};
    try {
        rt.again();
        await flush();
    } finally { console.warn = warn; }
    assert.equal(rt.phase(), 'idle');
    const last = new Map();
    for (const h of calls.hides) last.set(h.length === 3 ? h[1] : h[0], h.at(-1));
    assert.ok(last.size >= 3);
    assert.ok([...last.values()].every((v) => v === false));
    rt.dispose();
});

test('stopVocals keepHud leaves karaoke\'s score HUD hidden for a replay', async () => {
    const { stopVocals } = await import('../src/vocals.js');
    const seen = [];
    const api = { stopMic() {}, setKaraokeMode: () => Promise.resolve(false), mountStrip() {}, setDifficulty() {}, setHearMyself() {},
        setScoreHudHidden: (v) => seen.push(v) };
    stopVocals(api, { keepHud: true });
    assert.deepEqual(seen, []);
    stopVocals(api);
    assert.deepEqual(seen, [false]);
});

test("a replay that doesn't arm karaoke again gives karaoke's HUD back", async () => {
    const { rt, fb, win, calls, loadSong } = setup();
    rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    await flush();
    fb.emit('song:ended', {});
    const karaoke = win.lyricsKaraoke;
    delete win.lyricsKaraoke;
    rt.again();
    assert.deepEqual(calls.hides.filter((h) => h[0] === 'karaoke').at(-1), ['karaoke', false]);
    win.lyricsKaraoke = karaoke;
    rt.dispose();
});

// ── Guitar scoring needs note_detect's detection on (final review M7) ──

const GUITARIST = { deviceKey: 'usb-guitar' };

test('a guitar input turns note_detect detection on at mount and silently off at teardown', () => {
    const { rt, fb, calls, loadSong } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: GUITARIST }) });
    assert.deepEqual(calls.nd, [], 'nothing before the stage mounts');
    loadSong(ITEM);
    assert.deepEqual(calls.nd, [['enable']]);
    const hiddenFirst = calls.hides.findIndex((h) => h[0] === 'nd' && h[1] === true);
    assert.ok(hiddenFirst >= 0, 'its HUD is hidden');
    fb.emit('song:stop', {});
    assert.deepEqual(calls.nd, [['enable'], ['disable', { silent: true }]], 'silent: never its summary');
    rt.dispose();
    assert.equal(calls.nd.length, 2);
});

test('no guitar input picked: note_detect is never enabled', () => {
    const { rt, fb, calls, loadSong } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.nd, []);
    rt.dispose();
});

test('note_detect already on: left on, never disabled by the band', () => {
    const { rt, fb, win, calls, loadSong } = setup();
    win.noteDetect.enabled = true;
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: GUITARIST }) });
    loadSong(ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.nd, []);
    assert.equal(win.noteDetect.enabled, true);
    rt.dispose();
});

test('guitar not playing: note_detect is never enabled', () => {
    const { rt, fb, calls, loadSong } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false, deviceKey: 'usb-guitar' } }) });
    loadSong(DRUM_ITEM);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.nd, []);
    rt.dispose();
});

test('a splitscreen remount does not enable twice; Play again enables once per session', () => {
    const env = setup();
    const { rt, fb, calls, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: GUITARIST }) });
    loadSong(ITEM);
    ss.start();
    timers.fire(50);
    assert.deepEqual(calls.nd, [['enable']]);
    fb.emit('song:ended', {});
    rt.again();
    loadSong(ITEM);
    assert.deepEqual(calls.nd, [['enable'], ['disable', { silent: true }], ['enable']]);
    rt.dispose();
    assert.deepEqual(calls.nd.at(-1), ['disable', { silent: true }]);
});

test('an enable that rejects is only warned about', async () => {
    const { rt, win, loadSong } = setup();
    win.noteDetect.enable = () => Promise.reject(new Error('no mic'));
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a);
    try {
        rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: GUITARIST }) });
        loadSong(ITEM);
        await flush();
    } finally { console.warn = warn; }
    assert.equal(rt.phase(), 'playing');
    assert.ok(warns.length >= 1);
    rt.dispose();
});

// ── Overdrive (plan 5 Task 10) ──

// Two phrases over nine notes (0..8), then a 12 s gap before the note at 20.
const OD_NOTES = [...Array.from({ length: 9 }, (_, i) => ({ t: i, s: 0, f: 3 })), { t: 20, s: 0, f: 3 }];
const OD_PHRASES = [{ start_time: 0, end_time: 4.5 }, { start_time: 4.5, end_time: 9 }];

function odSetup(opts) {
    const env = setup(opts);
    env.win.highway.getFilteredNotes = () => OD_NOTES;
    env.chart.phrases = OD_PHRASES;
    // Display time and chart time move together here.
    env.at = (t) => { env.clock.t = t; env.chart.t = t; };
    return env;
}

const odHud = (player, part) => {
    const hud = player.querySelectorAll('.bab-part-hud').find((h) => h.getAttribute('data-part') === part);
    return hud ? hud.querySelector('.bab-od').querySelector('i') : null;
};

// Nine hits clear both phrases; two ticks past them fill half a bar; three
// onsets in the gap deploy. Guitar overdrive is active from display time 11.5.
function deployGuitar(env) {
    const { fireWin, timers, at } = env;
    for (let i = 0; i < 9; i++) {
        at(i);
        fireWin('notedetect:hit', guitarHit({ noteTime: i, points: 100 }));
    }
    at(6);
    timers.fire(100);
    at(10);
    timers.fire(100);
    for (const t of [10.5, 11, 11.5]) {
        at(t);
        const onset = { t, midi: null, confidence: null, level: 0.3, source: 'level', isDefault: true };
        fireWin('notedetect:onset', onset);
        fireWin('notedetect:onset', onset);
    }
}

test('guitar overdrive doubles guitar points while active', () => {
    const env = odSetup();
    const { rt, loadSong, fireWin, at } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    deployGuitar(env);
    assert.equal(rt.snapshot().parts.guitar.deploys, 1, 'one deploy entry for three onsets each dispatched twice');
    assert.equal(rt.overdrive().guitar.active, true);
    at(12);
    const before = rt.snapshot().parts.guitar.score;
    fireWin('notedetect:hit', guitarHit({ noteTime: 20, points: 100 }));
    assert.equal(rt.snapshot().parts.guitar.score - before, 200);
    rt.dispose();
});

test('onsets before the bar is ready never deploy', () => {
    const env = odSetup();
    const { rt, loadSong, fireWin, at } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    for (const t of [10.5, 11, 11.5, 12]) {
        at(t);
        fireWin('notedetect:onset', { t, source: 'level', isDefault: true });
    }
    fireWin('notedetect:onset', { t: 12.5, source: 'level', isDefault: false });
    assert.equal(rt.snapshot().parts.guitar.deploys, 0);
    rt.dispose();
});

test('drums and vocals points are never doubled', () => {
    const env = odSetup();
    const { rt, fb, loadSong, mounts, at } = env;
    rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    deployGuitar(env);
    assert.equal(rt.overdrive().guitar.active, true, 'the band meter is active');
    at(12);
    const before = rt.snapshot().parts;
    fb.emit('drums:hit', { canvas: mounts[0].drumCanvas, points: 120, multiplier: 4, combo: 9, spActive: true });
    fb.emit('karaoke:phrase', { rating: 'Great', accuracy: 0.9, points: 1600, multiplier: 2, streak: 2 });
    const after = rt.snapshot().parts;
    assert.equal(after.drums.score - before.drums.score, 120);
    assert.equal(after.vocals.score - before.vocals.score, 1600);
    rt.dispose();
});

test('drums sp-activate and karaoke od-activate record deploys', () => {
    const env = odSetup();
    const { rt, fb, doc, loadSong, mounts } = env;
    rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    fb.emit('drums:sp-activate', { canvas: doc.createElement('canvas'), spActive: true, spAmount: 0.5 });
    assert.equal(rt.snapshot().parts.drums.deploys, 0, 'another canvas does nothing');
    fb.emit('drums:sp-activate', { canvas: mounts[0].drumCanvas, spActive: true, spAmount: 0.5 });
    fb.emit('karaoke:od-activate', { fill: 0.5, t: 3 });
    const parts = rt.snapshot().parts;
    assert.equal(parts.drums.deploys, 1);
    assert.equal(parts.vocals.deploys, 1);
    assert.equal(parts.guitar.deploys, 0);
    rt.dispose();
});

test('the tick mirrors drums and vocals bars', () => {
    const env = odSetup();
    const { rt, loadSong, mounts, player, timers, od } = env;
    const asked = [];
    od.drums = (c) => { asked.push(c); return { starPower: { amount: 0.5, active: false } }; };
    od.vocals = { fill: 0.25, active: false, ready: false };
    rt.startSession({ song: FULL_ITEM, prefs: prefsWith({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    timers.fire(100);
    assert.equal(odHud(player, 'drums').style.width, '50%');
    assert.equal(odHud(player, 'vocals').style.width, '25%');
    assert.ok(asked.length > 0 && asked.every((c) => c === mounts[0].drumCanvas), 'read from the band drum canvas');
    assert.ok(timers.delays().includes(100), 'the tick runs again');
    rt.dispose();
});

test('drums stars use the full chart after a seek (M6)', () => {
    const env = odSetup();
    const { rt, fb, loadSong, mounts, timers, od, at } = env;
    const full = [60, 120, 200, 450, 750, 1090];
    od.drums = { starPower: { amount: 0, active: false }, starThresholds: full };
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith() });
    loadSong(DRUM_ITEM);
    timers.fire(100);
    at(3);
    fb.emit('drums:hit', { canvas: mounts[0].drumCanvas, points: 300, multiplier: 1, combo: 1, stars: 5 });
    fb.emit('song:seek', { from: 30, to: 20 });
    // The drums engine rebuilt from the seek: thresholds for the rest only.
    od.drums = { starPower: { amount: 0, active: false }, starThresholds: [6, 12, 20, 45, 75, 109] };
    at(20);
    timers.fire(100);
    assert.equal(rt.snapshot().parts.drums.stars, starsFromScore(300, full));
    rt.dispose();
});

test('rewinding restores the guitar bar', () => {
    const env = odSetup();
    const { rt, fb, loadSong, fireWin, timers, at } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    for (let i = 0; i < 5; i++) {
        at(i);
        fireWin('notedetect:hit', guitarHit({ noteTime: i }));
    }
    at(6);
    timers.fire(100);
    assert.equal(rt.overdrive().guitar.fill, 0.25, 'a gain');
    fb.emit('song:seek', { from: 30, to: 5 });
    at(5);
    assert.equal(rt.overdrive().guitar.fill, 0);
    rt.dispose();
});

test('a loop wrap keeps the guitar bar and reopens the looped phrases', () => {
    const env = odSetup();
    const { rt, fb, loadSong, fireWin, timers, at } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    for (let i = 0; i < 5; i++) {
        at(i);
        fireWin('notedetect:hit', guitarHit({ noteTime: i }));
    }
    at(6);
    timers.fire(100);
    fb.emit('song:seek', { from: 6, to: 0, reason: 'loop-wrap' });
    // Display time keeps moving across a wrap; the chart goes back.
    env.clock.t = 7;
    env.chart.t = 1;
    for (let i = 0; i < 5; i++) fireWin('notedetect:hit', guitarHit({ noteTime: i }));
    env.clock.t = 12;
    env.chart.t = 6;
    timers.fire(100);
    assert.equal(rt.overdrive().guitar.fill, 0.5, 'the reopened phrase earns again');
    rt.dispose();
});

test('teardown stops the overdrive tick', () => {
    const env = odSetup();
    const { rt, fb, loadSong, timers } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    assert.ok(timers.delays().includes(100));
    fb.emit('song:ended', {});
    rt.next();
    assert.ok(!timers.delays().includes(100));
    assert.equal(rt.overdrive(), null);
    rt.dispose();
});

test('splitscreen up at song:ready: overdrive starts once the stage mounts', () => {
    const env = odSetup();
    const { rt, loadSong, timers } = env;
    const ss = fakeSplitscreen(env);
    ss.stop = () => { ss.stops++; };
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    ss.active = true;
    env.fb.emit('splitscreen:panels-changed', {});
    loadSong(ITEM);
    assert.equal(rt.overdrive(), null, 'no ledger yet');
    ss.active = false;
    timers.fire(50);
    assert.ok(rt.overdrive(), 'started with the ledger');
    assert.deepEqual(timers.delays().filter((ms) => ms === 100), [100], 'one tick chain');
    rt.dispose();
});

// ── Fail mode (plan 5 Task 11) ──

const failPrefs = (opts) => ({ ...prefsWith(opts), failMode: 'fail' });
const guitarMiss = () => ({ isDefault: true, counted: true, hit: false, points: 0, multiplier: 1, streak: 0 });
const FAIL_CLAIM = 'build_a_band:fail:guitar';
const capCalls = (calls, name, pred = () => true) => calls.caps.filter((c) => c[0] === name && pred(c[1])).map((c) => c[1]);
const stemsCommand = (calls, command) => capCalls(calls, 'dispatch', (r) => r.capability === 'stems' && r.command === command);
const toastTexts = (player) => player.querySelectorAll('div.bab-toast').map((t) => t.textContent);
const partCallout = (player, part) => {
    const hud = player.querySelectorAll('.bab-part-hud').find((h) => h.getAttribute('data-part') === part);
    return hud ? hud.querySelector('.bab-callout').textContent : null;
};

// 14 guitar misses empty the crowd from its 0.66 start (−0.05 each), at display times from..from+13.
function dropGuitar(env, from = 1) {
    for (let i = 0; i < 14; i++) {
        env.clock.t = from + i;
        env.fireWin('notedetect:miss', guitarMiss());
    }
}

test('an empty crowd drops the player: grey lane, stem muted, toast', () => {
    const env = setup();
    const { rt, loadSong, mounts, calls, player } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    assert.equal(rt.snapshot().parts.guitar.failed, true);
    assert.ok(mounts[0].lanes.guitar.classList.contains('bab-failed'));
    assert.equal(mounts[0].lanes.drums.classList.contains('bab-failed'), false);
    assert.deepEqual(capCalls(calls, 'claim'), [{ capability: 'stems', claimId: FAIL_CLAIM, requester: 'build_a_band' }]);
    assert.deepEqual(stemsCommand(calls, 'mute').map((r) => r.args), [{ id: 'guitar', claimId: FAIL_CLAIM }]);
    assert.ok(toastTexts(player).includes('Guitar dropped out: overdrive brings them back'));
    assert.equal(partCallout(player, 'guitar'), 'DROPPED OUT');
    assert.equal(rt.phase(), 'playing', 'drums still play');
    rt.dispose();
});

test("a bandmate's overdrive rescues them", async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls, player } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    fb.emit('drums:sp-activate', { canvas: mounts[0].drumCanvas, spActive: true, spAmount: 0.5 });
    assert.equal(mounts[0].lanes.guitar.classList.contains('bab-failed'), false);
    assert.equal(rt.snapshot().parts.guitar.crowd, 0.4);
    assert.equal(partCallout(player, 'guitar'), 'SAVED!');
    await flush();   // the restore follows the mute's answer
    assert.deepEqual(stemsCommand(calls, 'restore').map((r) => r.args), [{ claimId: FAIL_CLAIM }]);
    assert.deepEqual(capCalls(calls, 'release'), [{ capability: 'stems', claimId: FAIL_CLAIM, requester: 'build_a_band' }]);
    rt.dispose();
});

test('no fail never drops', () => {
    const env = setup();
    const { rt, loadSong, mounts, calls } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: { ...prefsWith(), failMode: 'nofail' } });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    assert.equal(rt.snapshot().parts.guitar.crowd, 0);
    assert.deepEqual(stemsCommand(calls, 'mute'), []);
    assert.deepEqual(capCalls(calls, 'claim'), []);
    assert.equal(mounts[0].lanes.guitar.classList.contains('bab-failed'), false);
    rt.dispose();
});

test('everyone out: the song pauses and the results say Band failed', async () => {
    const env = setup();
    const { rt, loadSong, calls, player } = env;
    rt.startSession({ song: ITEM, prefs: failPrefs({ drums: { on: false } }) });
    loadSong(ITEM);
    dropGuitar(env);
    assert.equal(rt.phase(), 'ending');
    assert.deepEqual(capCalls(calls, 'dispatch', (r) => r.capability === 'playback'), [
        { capability: 'playback', command: 'pause', requester: 'build_a_band', args: { requesterId: 'build_a_band' } },
    ]);
    await flush();
    assert.equal(calls.audioPause, 0, "core's pause answered 'paused'");
    const results = player.querySelector('.bab-results');
    assert.ok(results);
    assert.equal(results.querySelector('.bab-results-failed').textContent, 'Band failed');
    assert.equal(calls.hold, 0, 'the song never ended: no exit is held');
    rt.dispose();
});

test("band failed: #audio pauses when core's pause doesn't answer 'paused' or there is no capability host", async () => {
    for (const opts of [{ pauseStatus: 'no-target' }, { caps: false }]) {
        const env = setup(opts);
        const { rt, loadSong, calls } = env;
        rt.startSession({ song: ITEM, prefs: failPrefs({ drums: { on: false } }) });
        loadSong(ITEM);
        dropGuitar(env);
        assert.equal(rt.phase(), 'ending');
        await flush();
        assert.equal(calls.audioPause, 1, JSON.stringify(opts));
        rt.dispose();
    }
});

test('after Band failed, Next song reaches the band screen and Play again replays, with no exit held', async () => {
    for (const exit of ['next', 'again']) {
        const env = setup();
        const { rt, loadSong, calls, player } = env;
        rt.startSession({ song: ITEM, prefs: failPrefs({ drums: { on: false } }) });
        loadSong(ITEM);
        dropGuitar(env);
        assert.equal(rt.phase(), 'ending');
        rt[exit]();
        await flush();
        assert.equal(calls.hold, 0, exit);
        assert.equal(calls.release, 0, `${exit}: no exit to release`);
        assert.equal(player.querySelector('.bab-results'), null, exit);
        if (exit === 'next') {
            assert.deepEqual(calls.showScreen, ['plugin-build_a_band']);
            assert.equal(rt.phase(), 'idle');
        } else {
            assert.deepEqual(calls.playSong, [['My%20Song.sloppak', 0], ['My%20Song.sloppak', 0]]);
            assert.equal(rt.phase(), 'armed');
            loadSong(ITEM);
            assert.equal(rt.phase(), 'playing', 'the replay plays');
            assert.equal(rt.snapshot().parts.guitar.failed, false, 'a fresh ledger');
        }
        rt.dispose();
    }
});

test('a seek back before the drop restores the player silently', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls, player } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    assert.ok(mounts[0].lanes.guitar.classList.contains('bab-failed'));
    fb.emit('song:seek', { from: 20, to: 0.5 });
    assert.equal(rt.snapshot().parts.guitar.failed, false);
    assert.equal(mounts[0].lanes.guitar.classList.contains('bab-failed'), false);
    assert.notEqual(partCallout(player, 'guitar'), 'SAVED!');
    await flush();   // the restore follows the mute's answer
    assert.deepEqual(stemsCommand(calls, 'restore').map((r) => r.args), [{ claimId: FAIL_CLAIM }]);
    assert.equal(capCalls(calls, 'release').length, 1);
    // Dropping again after the rewind claims and mutes again.
    dropGuitar(env, 21);
    assert.equal(stemsCommand(calls, 'mute').length, 2);
    rt.dispose();
});

test('every exit path releases the stem claim', async () => {
    const exits = {
        'Next song': (e) => { e.fb.emit('song:ended', {}); e.rt.next(); },
        'Play again': (e) => { e.fb.emit('song:ended', {}); e.rt.again(); },
        'song:stop': (e) => e.fb.emit('song:stop', {}),
        'screen:changing away': (e) => e.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' }),
    };
    for (const [name, exit] of Object.entries(exits)) {
        const env = setup();
        env.rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
        env.loadSong(DRUM_ITEM);
        dropGuitar(env);
        assert.equal(stemsCommand(env.calls, 'mute').length, 1, name);
        exit(env);
        await flush();
        assert.deepEqual(stemsCommand(env.calls, 'restore').map((r) => r.args), [{ claimId: FAIL_CLAIM }], name);
        assert.deepEqual(capCalls(env.calls, 'release'), [{ capability: 'stems', claimId: FAIL_CLAIM, requester: 'build_a_band' }], name);
        const kinds = env.calls.caps.map((c) => c[0] + (c[1].command ? ':' + c[1].command : ''));
        assert.ok(kinds.indexOf('dispatch:restore') < kinds.indexOf('release'), `${name}: restore before release`);
        env.rt.dispose();
        await flush();
        assert.equal(capCalls(env.calls, 'release').length, 1, `${name}: released once`);
    }
});

test('a song without that stem still drops the player', () => {
    const env = setup({ stems: [] });
    const { rt, loadSong, mounts, calls } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    assert.ok(mounts[0].lanes.guitar.classList.contains('bab-failed'));
    assert.deepEqual(calls.caps, []);
    rt.dispose();
});

test('a HUD remount keeps a dropped part greyed', async () => {
    const env = setup();
    const { rt, loadSong, player } = env;
    let fail;
    env.win.lyricsKaraoke.startMic = () => new Promise((r) => { fail = () => r('error'); });
    rt.startSession({ song: FULL_ITEM, prefs: failPrefs({ vocals: SINGER }) });
    loadSong(FULL_ITEM);
    await flush();
    dropGuitar(env);
    fail();
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar', 'drums'], 'vocals left the band');
    const hud = player.querySelectorAll('.bab-part-hud').find((h) => h.getAttribute('data-part') === 'guitar');
    assert.ok(hud.classList.contains('bab-failed'), 'the remounted HUD is greyed again');
    assert.equal(rt.phase(), 'playing');
    rt.dispose();
});

// Review carry-forward: dropPart can fail the band.
test('dropping the last part still alive fails the band', async () => {
    const env = setup();
    const { rt, loadSong, player, calls } = env;
    let fail;
    env.win.lyricsKaraoke.startMic = () => new Promise((r) => { fail = () => r('error'); });
    rt.startSession({ song: PITCH_ITEM, prefs: failPrefs({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    dropGuitar(env);
    assert.equal(rt.phase(), 'playing', 'vocals are still in');
    fail();
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar']);
    assert.equal(rt.phase(), 'ending');
    assert.equal(player.querySelector('.bab-results-failed').textContent, 'Band failed');
    assert.equal(capCalls(calls, 'dispatch', (r) => r.capability === 'playback').length, 1);
    rt.dispose();
});

// Review carry-forward (ledger): dropPart keeps the deploys that took effect.
test("a dropped part's rescue stays: the rescued player is still in", async () => {
    const env = setup();
    const { rt, fb, loadSong, player, calls } = env;
    let fail;
    env.win.lyricsKaraoke.startMic = () => new Promise((r) => { fail = () => r('error'); });
    rt.startSession({ song: PITCH_ITEM, prefs: failPrefs({ vocals: SINGER }) });
    loadSong(PITCH_ITEM);
    await flush();
    dropGuitar(env);
    env.clock.t = 16;
    fb.emit('karaoke:od-activate', { fill: 0.5, t: 16 });
    assert.equal(rt.snapshot().parts.guitar.failed, false, 'rescued');
    fail();
    await flush();
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar']);
    assert.equal(rt.snapshot().parts.guitar.failed, false, 'still rescued after vocals left');
    assert.equal(rt.phase(), 'playing');
    const hud = player.querySelectorAll('.bab-part-hud').find((h) => h.getAttribute('data-part') === 'guitar');
    assert.equal(hud.classList.contains('bab-failed'), false);
    assert.equal(stemsCommand(calls, 'mute').length, 1, 'no new mute');
    rt.dispose();
});

// Review carry-forward (ledger): a failed part's streak resets and its deploy is ignored.
test("a dropped drummer's star power rescues nobody, and a rescue restarts the player at ×1", () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls, player } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    const lane = mounts[0].drumCanvas;
    fb.emit('drums:hit', { canvas: lane, points: 30, multiplier: 3, combo: 25 });
    assert.equal(rt.snapshot().parts.drums.multiplier, 3);
    for (let i = 0; i < 14; i++) fb.emit('drums:miss', { canvas: lane, multiplier: 1, combo: 0 });
    assert.equal(rt.snapshot().parts.drums.failed, true);
    assert.equal(rt.snapshot().parts.drums.streak, 0);
    assert.equal(rt.snapshot().parts.drums.multiplier, 1);
    assert.deepEqual(stemsCommand(calls, 'mute').map((r) => r.args.id), ['drums']);
    const before = partCallout(player, 'drums');
    fb.emit('drums:sp-activate', { canvas: lane, spActive: true, spAmount: 0.5 });
    assert.equal(rt.snapshot().parts.drums.failed, true, "its own deploy doesn't bring it back");
    assert.equal(rt.snapshot().parts.drums.deploys, 0);
    assert.equal(partCallout(player, 'drums'), before, 'no OVERDRIVE! on a dropped lane');
    assert.deepEqual(stemsCommand(calls, 'restore'), []);
    rt.dispose();
});

test("a dropped guitar's noodle never deploys", () => {
    const env = odSetup();
    const { rt, loadSong, fireWin, timers, at } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    // Two cleared phrases fill half a bar: ready.
    for (let i = 0; i < 9; i++) {
        at(i);
        fireWin('notedetect:hit', guitarHit({ noteTime: i, points: 100 }));
    }
    at(6);
    timers.fire(100);
    at(10);
    timers.fire(100);
    assert.equal(rt.overdrive().guitar.ready, true);
    // Nine hits lift the crowd to 0.84: 17 misses empty it.
    for (let i = 0; i < 17; i++) { at(10 + i * 0.01); fireWin('notedetect:miss', guitarMiss()); }
    assert.equal(rt.snapshot().parts.guitar.failed, true);
    for (const t of [10.5, 11, 11.5]) {
        at(t);
        fireWin('notedetect:onset', { t, midi: null, confidence: null, level: 0.3, source: 'level', isDefault: true });
    }
    assert.equal(rt.overdrive().guitar.active, false, 'the bar is not spent');
    assert.equal(rt.snapshot().parts.guitar.deploys, 0);
    assert.equal(rt.snapshot().parts.guitar.failed, true);
    rt.dispose();
});

// ── Final review fixes (plan 5) ──

// Fix 4: deploy handlers.
test('karaoke od-activate without a vocals part records and calls out nothing', () => {
    const env = odSetup();
    const { rt, fb, loadSong, player } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    fb.emit('karaoke:od-activate', { fill: 0.5, t: 16 });
    const parts = rt.snapshot().parts;
    assert.deepEqual(Object.keys(parts), ['guitar', 'drums']);
    assert.equal(parts.guitar.failed, true, 'a karaoke deploy outside the band rescues nobody');
    assert.equal(parts.drums.deploys, 0);
    assert.ok(!player.querySelectorAll('.bab-callout').some((c) => c.textContent === 'OVERDRIVE!'));
    rt.dispose();
});

test('with no overdrive session, a drums deploy still rescues', (t) => {
    t.mock.method(console, 'warn', () => {});   // createOverdriveSession's throw is logged
    for (const by of ['drums', 'vocals']) {
        const env = setup();
        const { rt, fb, loadSong, mounts } = env;
        // Malformed beats: createOverdriveSession throws, so the band has no overdrive.
        env.chart.beats = new Proxy([], { get() { throw new Error('bad beats'); } });
        rt.startSession({ song: FULL_ITEM, prefs: failPrefs({ vocals: SINGER }) });
        loadSong(FULL_ITEM);
        assert.equal(rt.overdrive(), null, `${by}: no overdrive session`);
        dropGuitar(env);
        assert.equal(rt.snapshot().parts.guitar.failed, true, by);
        if (by === 'drums') fb.emit('drums:sp-activate', { canvas: mounts[0].drumCanvas, spActive: true, spAmount: 0.5 });
        else fb.emit('karaoke:od-activate', { fill: 0.5, t: 16 });
        assert.equal(rt.snapshot().parts[by].deploys, 1, by);
        assert.equal(rt.snapshot().parts.guitar.failed, false, `${by}: rescued`);
        rt.dispose();
    }
});

// Fix 5: each part's stem claim operations run in order. Stems mutes answer
// only when the test resolves them; everything else answers at once.
function holdMutes(env) {
    const held = [];
    const answer = env.fb.capabilities.dispatch;
    env.fb.capabilities.dispatch = (req) => {
        if (req.capability !== 'stems' || req.command !== 'mute') return answer(req);
        env.calls.caps.push(['dispatch', req]);
        return new Promise((r) => held.push(() => r({ outcome: 'handled', status: 'applied' })));
    };
    return held;
}
const capKinds = (calls) => calls.caps.map((c) => c[0] + (c[1].command ? ':' + c[1].command : ''));

test('fail → rescue while the mute is pending: restore is dispatched after the mute resolves', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    const held = holdMutes(env);
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    assert.equal(held.length, 1, 'the mute is in flight');
    fb.emit('drums:sp-activate', { canvas: mounts[0].drumCanvas, spActive: true, spAmount: 0.5 });
    assert.equal(rt.snapshot().parts.guitar.failed, false);
    await flush();
    assert.deepEqual(stemsCommand(calls, 'restore'), [], 'the restore waits for the mute');
    assert.deepEqual(capCalls(calls, 'release'), []);
    held[0]();
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    rt.dispose();
});

test('teardown while the mute is pending still restores and releases after it', async () => {
    const env = setup();
    const { rt, fb, loadSong, calls } = env;
    const held = holdMutes(env);
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    fb.emit('song:stop', {});
    assert.equal(rt.phase(), 'idle');
    await flush();
    assert.deepEqual(stemsCommand(calls, 'restore'), []);
    held[0]();
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    rt.dispose();
});

test("Play again while the mute is pending: the replay's mute follows the old restore and release", async () => {
    const env = setup();
    const { rt, fb, loadSong, calls } = env;
    const held = holdMutes(env);
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    fb.emit('song:ended', {});
    rt.again();
    loadSong(DRUM_ITEM);
    assert.equal(rt.phase(), 'playing');
    dropGuitar(env, 30);
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute'], 'everything waits for the first mute');
    held[0]();
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release', 'claim', 'dispatch:mute']);
    held[1]();
    rt.dispose();
    await flush();
    assert.deepEqual(capKinds(calls).slice(-2), ['dispatch:restore', 'release']);
});

// Parked T11 M3.
test('dispose() mid-song after a drop restores and releases', async () => {
    const env = setup();
    const { rt, loadSong, calls } = env;
    rt.startSession({ song: DRUM_ITEM, prefs: failPrefs() });
    loadSong(DRUM_ITEM);
    dropGuitar(env);
    rt.dispose();
    await flush();
    assert.deepEqual(stemsCommand(calls, 'restore').map((r) => r.args), [{ claimId: FAIL_CLAIM }]);
    assert.deepEqual(capCalls(calls, 'release'), [{ capability: 'stems', claimId: FAIL_CLAIM, requester: 'build_a_band' }]);
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
});

// Fix 6 (controller ruling): guitar onsets never deploy while the song is paused.
test('onsets while paused never deploy', () => {
    const env = odSetup();
    const { rt, fb, loadSong, fireWin, at } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    fb.isPlaying = false;
    deployGuitar(env);
    assert.equal(rt.snapshot().parts.guitar.deploys, 0);
    assert.equal(rt.overdrive().guitar.active, false, 'the bar is not spent');
    // Playing again: the gap's deploy is still there.
    fb.isPlaying = true;
    for (const t of [12, 12.5, 13]) {
        at(t);
        fireWin('notedetect:onset', { t, midi: null, confidence: null, level: 0.3, source: 'level', isDefault: true });
    }
    assert.equal(rt.snapshot().parts.guitar.deploys, 1);
    rt.dispose();
});

// Residual (re-review): in browser-audio mode feedBack.isPlaying can stay true
// across an ordinary pause, so a highway clock that stood still between the
// last two OD ticks also counts as paused.
function readyGuitar(env) {
    const { fireWin, at, timers } = env;
    for (let i = 0; i < 9; i++) {
        at(i);
        fireWin('notedetect:hit', guitarHit({ noteTime: i, points: 100 }));
    }
    at(6);
    timers.fire(100);
    at(10);
    timers.fire(100);
    assert.equal(env.rt.overdrive().guitar.ready, true);
}
const onsetAt = (env, t) => env.fireWin('notedetect:onset', { t, midi: null, confidence: null, level: 0.3, source: 'level', isDefault: true });

test('with isPlaying stuck true and the chart clock frozen across two ticks, onsets never deploy', () => {
    const env = odSetup();
    const { rt, fb, loadSong, clock, timers } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    readyGuitar(env);
    assert.equal(fb.isPlaying, true, 'core never flipped it');
    timers.fire(100);   // chart time still 10: paused
    for (const t of [10.5, 11, 11.5]) { clock.t = t; onsetAt(env, t); }
    assert.equal(rt.snapshot().parts.guitar.deploys, 0);
    assert.equal(rt.overdrive().guitar.active, false, 'the bar is not spent');
    rt.dispose();
});

test('with isPlaying true and the chart clock advancing, onsets still deploy', () => {
    const env = odSetup();
    const { rt, loadSong, at, timers } = env;
    rt.startSession({ song: ITEM, prefs: prefsWith({ drums: { on: false } }) });
    loadSong(ITEM);
    readyGuitar(env);
    at(10.2);
    timers.fire(100);
    for (const t of [10.5, 11, 11.5]) { at(t); onsetAt(env, t); }
    assert.equal(rt.snapshot().parts.guitar.deploys, 1);
    assert.equal(rt.overdrive().guitar.active, true);
    rt.dispose();
});

// ── Drum sound modes (plan 6 Task 3): My kit only holds the sound claim ──

const STEM_ITEM = { ...DRUM_ITEM, stem_ids: ['guitar', 'drums'] };
const SOUND_CLAIM = 'build_a_band:sound:drums';
const isSound = (r) => !!r && (r.claimId === SOUND_CLAIM || !!(r.args && r.args.claimId === SOUND_CLAIM));
const soundCommand = (calls, command) => stemsCommand(calls, command).filter(isSound);
const soundCaps = (calls) => calls.caps.filter((c) => isSound(c[1]));
const kitPrefs = (drums = {}) => prefsWith({ drums: { soundMode: 'kit', ...drums } });

test('My kit only mutes the drum stem under its own claim', () => {
    const env = setup();
    const { rt, loadSong, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    assert.deepEqual(capCalls(calls, 'claim', isSound), [{ capability: 'stems', claimId: SOUND_CLAIM, requester: 'build_a_band' }]);
    assert.deepEqual(soundCommand(calls, 'mute').map((r) => r.args), [{ id: 'drums', claimId: SOUND_CLAIM }]);
    assert.deepEqual(rt.drumSound(), { mode: 'kit', muted: true });
    rt.dispose();
});

test('the stems graph arriving after song:ready still gets the mute', async () => {
    const ids = [];
    const env = setup({ stems: ids });
    const { rt, loadSong, calls, fireWin } = env;
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    assert.deepEqual(stemsCommand(calls, 'mute'), [], 'no stems yet');
    ids.push('guitar', 'drums');
    fireWin('stems:state', { event: 'provider-ready', stemIds: ids });
    assert.equal(soundCommand(calls, 'mute').length, 1);
    fireWin('stems:state', { event: 'provider-ready', stemIds: ids });
    await flush();   // the forced re-mute queues behind the first one
    assert.equal(soundCommand(calls, 'mute').length, 2, 'a rebuilt graph is muted again');
    assert.deepEqual(soundCommand(calls, 'restore'), []);
    fireWin('stems:state', { event: 'state' });
    await flush();
    assert.equal(soundCaps(calls).length, 4, 'nothing more: two claims, two mutes');
    rt.dispose();
});

test('song drums never claim; nothing without a playing drums part', () => {
    const cases = [
        ['song', {}, prefsWith({ drums: { soundMode: 'song' } })],
        ['drums off', {}, kitPrefs({ on: false })],
        ['no drum lane', { drumLane: false }, kitPrefs()],
    ];
    for (const [name, opts, prefs] of cases) {
        const env = setup(opts);
        const { rt, loadSong, calls, fireWin } = env;
        rt.startSession({ song: STEM_ITEM, prefs });
        loadSong(STEM_ITEM);
        fireWin('stems:state', { event: 'provider-ready', stemIds: ['guitar', 'drums'] });
        assert.deepEqual(soundCaps(calls), [], name);
        assert.equal(rt.drumSound(), null, name);
        rt.dispose();
    }
});

test('no capability host or no drum stem: no dispatch, no throw', () => {
    {
        const env = setup({ caps: false });
        const { rt, loadSong, fireWin } = env;
        rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
        loadSong(STEM_ITEM);
        fireWin('stems:state', { event: 'provider-ready', stemIds: ['guitar', 'drums'] });
        assert.equal(rt.drumSound().muted, false);
        rt.dispose();
    }
    {
        const env = setup({ stems: ['guitar'] });
        const { rt, loadSong, calls } = env;
        rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
        loadSong(STEM_ITEM);
        assert.deepEqual(soundCaps(calls), []);
        rt.dispose();
    }
});

test('every exit path restores and releases the kit claim', async () => {
    const exits = {
        'Next song': (e) => { e.fb.emit('song:ended', {}); e.rt.next(); },
        'Play again': (e) => { e.fb.emit('song:ended', {}); e.rt.again(); },
        'song:stop': (e) => e.fb.emit('song:stop', {}),
        'screen:changing away': (e) => e.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' }),
        'song change': (e) => e.fb.emit('song:loading', { filename: 'next.psarc' }),
        'dispose()': (e) => e.rt.dispose(),
    };
    for (const [name, exit] of Object.entries(exits)) {
        const env = setup();
        env.rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
        env.loadSong(STEM_ITEM);
        assert.equal(soundCommand(env.calls, 'mute').length, 1, name);
        exit(env);
        await flush();
        assert.deepEqual(soundCommand(env.calls, 'restore').map((r) => r.args), [{ claimId: SOUND_CLAIM }], name);
        assert.deepEqual(capCalls(env.calls, 'release', isSound), [{ capability: 'stems', claimId: SOUND_CLAIM, requester: 'build_a_band' }], name);
        const kinds = soundCaps(env.calls).map((c) => c[0] + (c[1].command ? ':' + c[1].command : ''));
        assert.ok(kinds.indexOf('dispatch:restore') < kinds.indexOf('release'), `${name}: restore before release`);
        assert.equal(env.rt.drumSound(), null, name);
        env.rt.dispose();
        await flush();
        assert.equal(capCalls(env.calls, 'release', isSound).length, 1, `${name}: released once`);
    }
});

test("Play again: the replay's kit mute follows the old restore and release", async () => {
    const env = setup();
    const { rt, fb, loadSong, calls } = env;
    const held = holdMutes(env);
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    fb.emit('song:ended', {});
    rt.again();
    loadSong(STEM_ITEM);
    assert.equal(rt.phase(), 'playing');
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute'], 'everything waits for the first mute');
    held[0]();
    await flush();
    assert.deepEqual(capKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release', 'claim', 'dispatch:mute']);
    assert.deepEqual(rt.drumSound(), { mode: 'kit', muted: true });
    held[1]();
    rt.dispose();
    await flush();
    assert.deepEqual(capKinds(calls).slice(-2), ['dispatch:restore', 'release']);
});

test('pausing changes nothing', () => {
    const env = setup();
    const { rt, fb, loadSong, calls, timers } = env;
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    fb.isPlaying = false;
    timers.fire(100);
    timers.fire(100);
    assert.deepEqual(soundCommand(calls, 'restore'), []);
    assert.equal(rt.drumSound().muted, true);
    rt.dispose();
});

// ── Task 3 review gaps ──

const FAIL_DRUMS = 'build_a_band:fail:drums';
const isFailDrums = (r) => !!r && (r.claimId === FAIL_DRUMS || !!(r.args && r.args.claimId === FAIL_DRUMS));
const soundKinds = (calls) => soundCaps(calls).map((c) => c[0] + (c[1].command ? ':' + c[1].command : ''));
// 14 drums misses on the band's drum canvas, at display times from..from+13.
function dropDrums(env, from = 1) {
    for (let i = 0; i < 14; i++) {
        env.clock.t = from + i;
        env.fb.emit('drums:miss', { canvas: env.mounts[0].drumCanvas, multiplier: 1, combo: 0 });
    }
}

test('the band-failed ending keeps the kit claim until teardown', async () => {
    const env = setup();
    const { rt, loadSong, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: failPrefs({ drums: { soundMode: 'kit' } }) });
    loadSong(STEM_ITEM);
    dropGuitar(env);
    dropDrums(env, 15);
    assert.equal(rt.phase(), 'ending', 'band failed');
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute'], 'the results keep the claim');
    env.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' });
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    assert.equal(rt.drumSound(), null);
    rt.dispose();
});

test('a stems provider-ready while the results show or after teardown sends nothing', async () => {
    const env = setup();
    const { rt, fb, loadSong, calls, fireWin } = env;
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    fb.emit('song:ended', {});
    assert.equal(rt.phase(), 'ending');
    fireWin('stems:state', { event: 'provider-ready', stemIds: ['guitar', 'drums'] });
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute'], 'results: nothing sent');
    rt.next();
    await flush();
    const after = soundKinds(calls);
    assert.deepEqual(after, ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    fireWin('stems:state', { event: 'provider-ready', stemIds: ['guitar', 'drums'] });
    await flush();
    assert.deepEqual(soundKinds(calls), after, 'after teardown: nothing sent');
    rt.dispose();
});

test('drums dropping out of the band mid-song release the sound claim', async () => {
    const env = setup();
    const { rt, loadSong, mounts, calls, timers } = env;
    const ss = fakeSplitscreen(env);
    rt.startSession({ song: STEM_ITEM, prefs: kitPrefs() });
    loadSong(STEM_ITEM);
    assert.equal(soundCommand(calls, 'mute').length, 1);
    // The remounted stage falls back to a guitar lane only: drums leave the band.
    env.setDrumLane(false);
    ss.start();
    timers.fire(50);
    assert.equal(mounts.length, 2);
    assert.deepEqual(Object.keys(rt.snapshot().parts), ['guitar'], 'drums left the band');
    assert.equal(rt.phase(), 'playing');
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    assert.equal(rt.drumSound(), null);
    rt.dispose();
    await flush();
    assert.equal(capCalls(calls, 'release', isSound).length, 1, 'released once');
});

// ── Drum sound modes (plan 6 Task 4): Rock Band judgments drive the drum stem ──

const rb = () => prefsWith({ drums: { soundMode: 'rockband' } });
const miss = (canvas) => ({ canvas, multiplier: 1, combo: 0 });
const hit = (canvas, combo = 1) => ({ canvas, points: 30, multiplier: 1, combo });

test('Rock Band: a miss drops the drum stem, the next hit brings it back', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    const lane = mounts[0].drumCanvas;
    assert.deepEqual(soundCaps(calls), [], 'no sound dispatch at load');
    fb.emit('drums:miss', miss(lane));
    assert.deepEqual(soundCommand(calls, 'mute').map((r) => r.args), [{ id: 'drums', claimId: SOUND_CLAIM }]);
    assert.equal(rt.drumSound().muted, true);
    fb.emit('drums:miss', miss(lane));
    await flush();
    assert.equal(soundCommand(calls, 'mute').length, 1, 'a second miss sends nothing more');
    fb.emit('drums:hit', hit(lane));
    await flush();
    assert.deepEqual(soundCommand(calls, 'restore').map((r) => r.args), [{ claimId: SOUND_CLAIM }]);
    assert.equal(capCalls(calls, 'release', isSound).length, 1);
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    assert.equal(rt.drumSound().muted, false);
    fb.emit('drums:hit', hit(lane, 2));
    await flush();
    assert.equal(soundCaps(calls).length, 4, 'a second hit sends nothing more');
    rt.dispose();
});

test('Rock Band: an overhit drops it too, but not while paused', () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    const lane = mounts[0].drumCanvas;
    fb.isPlaying = false;
    fb.emit('drums:overhit', { canvas: lane });
    assert.deepEqual(soundCaps(calls), [], 'a paused overhit is ignored');
    assert.equal(rt.drumSound().muted, false);
    fb.isPlaying = true;
    fb.emit('drums:overhit', { canvas: lane });
    assert.equal(soundCommand(calls, 'mute').length, 1);
    assert.equal(rt.drumSound().muted, true);
    rt.dispose();
});

test("Rock Band: another canvas's judgments are ignored", () => {
    const env = setup();
    const { rt, fb, doc, loadSong, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    fb.emit('drums:miss', miss(doc.createElement('canvas')));
    assert.deepEqual(soundCaps(calls), []);
    assert.equal(rt.drumSound().muted, false);
    rt.dispose();
});

test('Rock Band: drums alone on #highway follow the mode too', () => {
    const env = setup();
    const { rt, fb, loadSong, calls, highwayCanvas } = env;
    rt.startSession({ song: STEM_ITEM, prefs: prefsWith({ guitar: { on: false }, drums: { soundMode: 'rockband' } }) });
    loadSong(STEM_ITEM);
    fb.emit('drums:miss', miss(highwayCanvas));
    assert.deepEqual(soundCommand(calls, 'mute').map((r) => r.args), [{ id: 'drums', claimId: SOUND_CLAIM }]);
    rt.dispose();
});

test('Rock Band: any seek brings the drums back', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    const lane = mounts[0].drumCanvas;
    const seeks = [{ from: 20, to: 5 }, { from: 5, to: 30 }, { from: 30, to: 10, reason: 'loop-wrap' }];
    for (const [i, seek] of seeks.entries()) {
        fb.emit('drums:miss', miss(lane));
        assert.equal(rt.drumSound().muted, true, `muted before seek ${i}`);
        fb.emit('song:seek', seek);
        assert.equal(rt.drumSound().muted, false);
        await flush();   // the restore queues behind the mute
        assert.equal(soundCommand(calls, 'restore').length, i + 1, `seek ${JSON.stringify(seek)} restores`);
    }
    assert.equal(soundCommand(calls, 'mute').length, 3);
    fb.emit('song:seek', { from: 10, to: 2 });
    await flush();
    assert.equal(soundCommand(calls, 'restore').length, 3, 'a seek with the drums in sends nothing');
    rt.dispose();
});

test('Rock Band: a hit while the mute is still pending: the restore follows it', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    const held = holdMutes(env);
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    const lane = mounts[0].drumCanvas;
    fb.emit('drums:miss', miss(lane));
    fb.emit('drums:hit', hit(lane));
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute']);
    held[0]();
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute', 'dispatch:restore', 'release']);
    rt.dispose();
});

test('Rock Band stacked with fail mode: each claim follows its own rule', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: failPrefs({ drums: { soundMode: 'rockband' } }) });
    loadSong(STEM_ITEM);
    const lane = mounts[0].drumCanvas;
    dropDrums(env);
    assert.equal(rt.snapshot().parts.drums.failed, true, 'drums dropped out');
    await flush();
    assert.deepEqual(soundCommand(calls, 'mute').map((r) => r.args), [{ id: 'drums', claimId: SOUND_CLAIM }]);
    assert.deepEqual(stemsCommand(calls, 'mute').filter(isFailDrums).map((r) => r.args), [{ id: 'drums', claimId: FAIL_DRUMS }]);
    fb.emit('drums:hit', hit(lane));
    await flush();
    assert.equal(soundCommand(calls, 'restore').length, 1, 'the dropped drummer still drives Rock Band');
    assert.deepEqual(stemsCommand(calls, 'restore').filter(isFailDrums), [], 'the fail claim holds');
    const sound = soundCaps(calls).length;
    fb.emit('song:stop', {});
    await flush();
    assert.equal(stemsCommand(calls, 'restore').filter(isFailDrums).length, 1);
    assert.equal(capCalls(calls, 'release', isFailDrums).length, 1);
    assert.equal(soundCaps(calls).length, sound, 'nothing more for the sound claim');
    rt.dispose();
});

// ── Final review fixes (plan 6) ──

// Fix 2 (T4 M1): a fail-mode rescue while Rock Band holds the drums.
const RB_RESCUE_ITEM = { ...FULL_ITEM, stem_ids: ['guitar', 'drums', 'vocals'] };
const rbRescuePrefs = () => failPrefs({ vocals: SINGER, drums: { soundMode: 'rockband' } });

test('Rock Band: a rescue with the drums out restores the fail claim only', async () => {
    const env = setup();
    const { rt, fb, loadSong, calls } = env;
    rt.startSession({ song: RB_RESCUE_ITEM, prefs: rbRescuePrefs() });
    loadSong(RB_RESCUE_ITEM);
    await flush();
    dropDrums(env);
    assert.equal(rt.snapshot().parts.drums.failed, true);
    await flush();
    env.clock.t = 16;
    fb.emit('karaoke:od-activate', { fill: 0.5, t: 16 });
    assert.equal(rt.snapshot().parts.drums.failed, false, 'rescued');
    await flush();
    assert.deepEqual(stemsCommand(calls, 'restore').filter(isFailDrums).map((r) => r.args), [{ claimId: FAIL_DRUMS }]);
    assert.equal(capCalls(calls, 'release', isFailDrums).length, 1);
    assert.deepEqual(soundCommand(calls, 'restore'), [], 'Rock Band keeps the drums out until a hit');
    assert.deepEqual(rt.drumSound(), { mode: 'rockband', muted: true });
    rt.dispose();
});

test('Rock Band: a rescue with the drums back in sends only the fail restore', async () => {
    const env = setup();
    const { rt, fb, loadSong, mounts, calls } = env;
    rt.startSession({ song: RB_RESCUE_ITEM, prefs: rbRescuePrefs() });
    loadSong(RB_RESCUE_ITEM);
    await flush();
    dropDrums(env);
    fb.emit('drums:hit', hit(mounts[0].drumCanvas));
    await flush();
    assert.equal(soundCommand(calls, 'restore').length, 1);
    assert.equal(capCalls(calls, 'release', isSound).length, 1);
    const sound = soundCaps(calls).length;
    env.clock.t = 16;
    fb.emit('karaoke:od-activate', { fill: 0.5, t: 16 });
    await flush();
    assert.equal(stemsCommand(calls, 'restore').filter(isFailDrums).length, 1);
    assert.equal(capCalls(calls, 'release', isFailDrums).length, 1);
    assert.equal(soundCaps(calls).length, sound, 'nothing for the sound claim');
    assert.deepEqual(rt.drumSound(), { mode: 'rockband', muted: false });
    rt.dispose();
});

// Fix 3 (T4 M3): the Rock Band band-failed ending.
test('Rock Band: the band-failed ending keeps the drums out until teardown', async () => {
    const env = setup();
    const { rt, loadSong, calls } = env;
    rt.startSession({ song: STEM_ITEM, prefs: failPrefs({ drums: { soundMode: 'rockband' } }) });
    loadSong(STEM_ITEM);
    dropGuitar(env);
    dropDrums(env, 15);
    assert.equal(rt.phase(), 'ending', 'band failed');
    await flush();
    assert.deepEqual(soundKinds(calls), ['claim', 'dispatch:mute'], 'the band-failing miss muted; the results keep it');
    env.fb.emit('screen:changing', { id: 'v3-songs', from: 'player' });
    await flush();
    assert.deepEqual(soundKinds(calls).slice(-2), ['dispatch:restore', 'release']);
    assert.equal(soundKinds(calls).length, 4);
    for (const part of ['guitar', 'drums']) {
        const isFail = (r) => !!r && (r.claimId === `build_a_band:fail:${part}`
            || !!(r.args && r.args.claimId === `build_a_band:fail:${part}`));
        assert.equal(stemsCommand(calls, 'restore').filter(isFail).length, 1, `${part} fail restore`);
        assert.equal(capCalls(calls, 'release', isFail).length, 1, `${part} fail release`);
    }
    assert.equal(rt.drumSound(), null);
    const total = calls.caps.length;
    rt.dispose();
    await flush();
    assert.equal(calls.caps.length, total, 'dispose sends nothing more');
});

// Fix 4 (T4 M2): without overdrive, a stall tick still tracks the paused chart.
test('without overdrive, a stalled chart still ignores a paused overhit', async (t) => {
    t.mock.method(console, 'warn', () => {});   // createOverdriveSession's throw is logged
    const env = setup();
    const { rt, fb, loadSong, mounts, calls, timers } = env;
    env.chart.beats = new Proxy([], { get() { throw new Error('bad beats'); } });
    rt.startSession({ song: STEM_ITEM, prefs: rb() });
    loadSong(STEM_ITEM);
    assert.equal(rt.overdrive(), null, 'no overdrive session');
    const lane = mounts[0].drumCanvas;
    fb.isPlaying = true;
    env.chart.t = 5;
    timers.fire(100);
    timers.fire(100);
    fb.emit('drums:overhit', { canvas: lane });
    await flush();
    assert.deepEqual(soundCommand(calls, 'mute'), [], 'a stalled chart: the overhit is ignored');
    assert.equal(rt.drumSound().muted, false);
    env.chart.t = 6;
    timers.fire(100);
    fb.emit('drums:overhit', { canvas: lane });
    await flush();
    assert.equal(soundCommand(calls, 'mute').length, 1, 'the chart moves again: the overhit mutes');
    rt.dispose();
    assert.ok(!timers.delays().includes(100), 'no stall tick left after teardown');
});

// ---- Plan 7 Task 8: full screen, the hover chrome, the sidebar and Settings ----

const fullPrefs = (on = true, parts = {}) => ({ ...prefsWith(parts), fullScreenStage: on });
const bodyHas = (doc, cls) => doc.body.classList.contains(cls);

test('full screen on: Go asks once, Play again keeps it, Next song leaves it', () => {
    const { rt, fb, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
    loadSong(ITEM);
    assert.equal(calls.fsRequest, 1);
    assert.ok(player.classList.contains('bab-full'));
    assert.deepEqual(rt.stageUi(), { full: true, fullScreen: true, sidebar: false, overlay: null });
    fb.emit('song:ended', {});
    rt.again();
    loadSong(ITEM);
    assert.equal(calls.fsRequest, 1, 'Play again finds it already on');
    assert.equal(calls.fsExit, 0);
    assert.ok(player.classList.contains('bab-full'));
    fb.emit('song:ended', {});
    rt.next();
    assert.equal(calls.fsExit, 1);
    assert.ok(!player.classList.contains('bab-full'));
    assert.equal(rt.stageUi(), null);
    rt.dispose();
});

test("full screen off: no request until the chrome's Full screen button", () => {
    const { rt, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: fullPrefs(false) });
    loadSong(ITEM);
    assert.equal(calls.fsRequest, 0);
    assert.ok(!player.classList.contains('bab-full'));
    const btn = player.querySelector('.bab-chrome-full');
    btn.click();
    assert.equal(calls.fsRequest, 1);
    assert.ok(player.classList.contains('bab-full'));
    assert.equal(rt.stageUi().full, true);
    btn.click();
    assert.equal(calls.fsExit, 1);
    assert.ok(!player.classList.contains('bab-full'));
    assert.equal(rt.stageUi().full, false);
    rt.dispose();
});

test('leaving browser full screen turns full mode off', () => {
    const { rt, doc, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
    loadSong(ITEM);
    doc.fullscreenElement = null;
    doc.fire('fullscreenchange');
    assert.equal(rt.stageUi().full, false);
    assert.equal(rt.stageUi().fullScreen, false);
    assert.ok(!player.classList.contains('bab-full'));
    assert.equal(calls.fsExit, 0, 'nothing left to exit');
    rt.dispose();
    assert.equal(doc.listenerCount(), 0, 'dispose removes the fullscreenchange listener');
});

test('M opens the sidebar; Escape closes it and stays in the song', () => {
    const { rt, doc, win, calls, loadSong, keyWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    const m = keyWin('KeyM', 'm');
    assert.ok(m.defaultPrevented);
    assert.ok(bodyHas(doc, 'bab-sidebar-open'));
    assert.equal(rt.stageUi().sidebar, true);
    const esc = keyWin('Escape', 'Escape');
    assert.ok(esc.defaultPrevented);
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
    assert.equal(rt.phase(), 'playing');
    assert.deepEqual(calls.showScreen, []);
    // With the sidebar shut, Escape is core's again (leave the song).
    assert.equal(keyWin('Escape', 'Escape').defaultPrevented, false);
    // A modifier, or typing, leaves M alone.
    assert.equal(keyWin('KeyM', 'm', { ctrlKey: true }).defaultPrevented, false);
    const typing = new Event('keydown', { cancelable: true });
    Object.assign(typing, { code: 'KeyM', key: 'm' });
    Object.defineProperty(typing, 'target', { value: { tagName: 'INPUT' } });
    win.dispatchEvent(typing);
    assert.equal(typing.defaultPrevented, false);
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
    rt.dispose();
});

test('the Menu button opens the sidebar and never toggles it shut', () => {
    const { rt, doc, loadSong, keyWin, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    const menu = player.querySelector('.bab-chrome-menu');
    menu.click();
    assert.ok(bodyHas(doc, 'bab-sidebar-open'));
    menu.click();
    assert.ok(bodyHas(doc, 'bab-sidebar-open'), 'a second click keeps it open');
    keyWin('KeyM', 'm');
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'), 'M toggles');
    rt.dispose();
});

test('Settings from the sidebar pauses, shows over the stage and resumes with the same token', () => {
    const { rt, doc, win, calls, loadSong, keyWin, sidebar, navLinks, settingsScreen } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'medium' } }) });
    loadSong(ITEM);
    keyWin('KeyM', 'm');
    const click = sidebar.fire('click', { target: navLinks.settings });
    assert.ok(click.defaultPrevented);
    assert.equal(calls.pause, 1);
    assert.ok(bodyHas(doc, 'bab-settings-over'));
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'), 'the sidebar closed first');
    assert.deepEqual(calls.nav, [], 'the link itself is not followed');
    assert.equal(settingsScreen.getAttribute('aria-modal'), 'true');
    assert.equal(rt.stageUi().overlay, 'settings');
    assert.equal(rt.phase(), 'playing');
    // M does nothing under Settings.
    keyWin('KeyM', 'm');
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
    win.highway.setMastery(0.9); // core's loadSettings applies the solo mastery
    const esc = keyWin('Escape', 'Escape');
    assert.ok(esc.defaultPrevented);
    assert.ok(!bodyHas(doc, 'bab-settings-over'));
    assert.equal(calls.setMastery.at(-1), 0.5);
    assert.deepEqual(calls.resume, [{ wasPlaying: true, gen: 1 }]);
    assert.ok(calls.resumeAt[0] > calls.setMasteryAt.at(-1), 'the band mastery is back before the resume');
    assert.equal(rt.stageUi().overlay, null);
    assert.equal(rt.phase(), 'playing');
    // resumeAfterOverlay answered true (a scheduled resume): Settings opens again normally.
    sidebar.fire('click', { target: navLinks.settings });
    assert.equal(calls.pause, 2);
    keyWin('Escape', 'Escape');
    assert.equal(calls.resume.length, 2);
    rt.dispose();
});

test('another item asks first: Stay resumes, Leave follows the link', async () => {
    const { rt, calls, loadSong, sidebar, navLinks, prompts } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    sidebar.fire('click', { target: navLinks.songs });
    assert.equal(calls.pause, 1);
    assert.equal(prompts.length, 1);
    assert.deepEqual(prompts[0].args, { title: 'Leave the song?', body: 'This ends the band song.', confirmText: 'Leave', cancelText: 'Stay' });
    assert.equal(rt.stageUi().overlay, 'confirm');
    prompts[0].resolve(false);
    await flush();
    assert.equal(calls.resume.length, 1);
    assert.deepEqual(calls.nav, []);
    assert.equal(rt.stageUi().overlay, null);
    sidebar.fire('click', { target: navLinks.songs });
    prompts[1].resolve(true);
    await flush();
    assert.deepEqual(calls.nav, ['songs']);
    assert.equal(calls.resume.length, 1, 'no second resume');
    sidebar.fire('click', { target: navLinks.build_a_band });
    assert.equal(prompts.length, 3, 'the Build-a-Band entry asks too');
    prompts[2].reject(new Error('gone'));
    await flush();
    assert.equal(calls.resume.length, 2, 'a rejected prompt resumes');
    rt.dispose();
});

test('no confirm dialog in core: the item is followed directly', () => {
    const { rt, calls, loadSong, sidebar, navLinks } = setup({ confirmDialog: false });
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    sidebar.fire('click', { target: navLinks.songs });
    assert.deepEqual(calls.nav, ['songs']);
    rt.dispose();
});

test('every exit closes the sidebar, Settings and full screen', async () => {
    {
        const { rt, fb, doc, calls, loadSong, keyWin, sidebar, navLinks, settingsScreen } = setup();
        rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
        loadSong(ITEM);
        keyWin('KeyM', 'm');
        sidebar.fire('click', { target: navLinks.settings });
        keyWin('KeyM', 'm'); // ignored under Settings
        fb.emit('song:stop', {});
        assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
        assert.ok(!bodyHas(doc, 'bab-settings-over'));
        assert.equal(settingsScreen.getAttribute('role'), null);
        assert.deepEqual(calls.resume, []);
        assert.equal(calls.fsExit, 1);
        assert.equal(rt.stageUi(), null);
        rt.dispose();
    }
    {
        const { rt, fb, calls, loadSong, sidebar, navLinks, prompts } = setup();
        rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
        loadSong(ITEM);
        sidebar.fire('click', { target: navLinks.songs });
        fb.emit('song:stop', {});
        assert.equal(calls.fsExit, 1);
        prompts[0].resolve(false);
        await flush();
        assert.deepEqual(calls.resume, [], 'a prompt answered after the end resumes nothing');
        assert.deepEqual(calls.nav, []);
        rt.dispose();
    }
});

test('note_detect stays quiet in a band song and the band says why', () => {
    const { rt, fb, calls, loadSong, fireWin, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    assert.deepEqual(calls.ndQuiet, [true]);
    const d = { message: 'denied', isDefault: true };
    fireWin('notedetect:input-error', d);
    fireWin('notedetect:input-error', d);
    assert.deepEqual(toastTexts(player), ["Guitar input couldn't start"]);
    fireWin('notedetect:input-error', { message: 'x', isDefault: false });
    assert.equal(toastTexts(player).length, 1);
    fb.emit('song:stop', {});
    assert.deepEqual(calls.ndQuiet, [true, false], 'the previous value comes back');
    rt.dispose();
});

test('drums alone leaves note_detect alone', () => {
    const { rt, calls, loadSong, fireWin, player } = setup();
    rt.startSession({ song: DRUM_ITEM, prefs: prefsWith({ guitar: { on: false } }) });
    loadSong(DRUM_ITEM);
    fireWin('notedetect:input-error', { message: 'x', isDefault: true });
    assert.deepEqual(calls.ndQuiet, []);
    assert.deepEqual(toastTexts(player), []);
    rt.dispose();
});

test('the loop button cycles start, end and clear', () => {
    const { rt, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    const btn = player.querySelector('.bab-chrome-loop');
    assert.equal(btn.textContent, 'Loop A');
    btn.click();
    assert.equal(btn.textContent, 'Loop B');
    btn.click();
    assert.equal(btn.textContent, 'Clear loop');
    btn.click();
    assert.equal(btn.textContent, 'Loop A');
    assert.deepEqual(calls.loop, ['start', 'end', 'clear']);
    rt.dispose();
});

test('End asks core to leave the song', () => {
    const { rt, calls, loadSong, player } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    player.querySelector('.bab-chrome-end').click();
    assert.equal(calls.exitSong, 1);
    rt.dispose();
});

test("without core's overlay API the band pauses and resumes with togglePlay", () => {
    const { rt, fb, calls, loadSong, keyWin, sidebar, navLinks } = setup({ overlayApi: false });
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.isPlaying = true;
    sidebar.fire('click', { target: navLinks.settings });
    assert.equal(calls.togglePlay, 1);
    fb.isPlaying = false;
    keyWin('Escape', 'Escape');
    assert.equal(calls.togglePlay, 2);
    // Paused before Settings opened: nothing to resume.
    sidebar.fire('click', { target: navLinks.settings });
    keyWin('Escape', 'Escape');
    assert.equal(calls.togglePlay, 2);
    rt.dispose();
});

test('the sidebar, M and the chrome exist only while the song plays', () => {
    const { rt, fb, doc, calls, loadSong, keyWin, player, sidebar, navLinks } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    keyWin('KeyM', 'm');
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
    player.querySelector('.bab-chrome-menu').click();
    player.querySelector('.bab-edge').fire('pointerenter');
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'), 'the chrome opens nothing under the results');
    sidebar.fire('click', { target: navLinks.settings });
    assert.ok(!bodyHas(doc, 'bab-settings-over'));
    assert.equal(calls.pause, 0);
    rt.next();
    assert.equal(player.querySelector('.bab-chrome'), null);
    assert.equal(player.querySelector('.bab-edge'), null);
    rt.dispose();
});

test('a song ending with the sidebar open closes it for the results', () => {
    const { rt, fb, doc, loadSong, keyWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    keyWin('KeyM', 'm');
    fb.emit('song:ended', {});
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'));
    rt.dispose();
});

test("solo play keeps core's sidebar: the takeover lives only inside a band session", () => {
    const { rt, fb, loadSong, sidebar, navLinks, calls } = setup();
    assert.equal(sidebar.listenerCount(), 0, 'no takeover before a band song');
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    assert.equal(sidebar.listenerCount(), 1);
    fb.emit('song:ended', {});
    rt.again();
    loadSong(ITEM);
    assert.equal(sidebar.listenerCount(), 1, 'one sidebar per session');
    fb.emit('song:stop', {});
    assert.equal(sidebar.listenerCount(), 0, 'teardown destroys it');
    const click = sidebar.fire('click', { target: navLinks.songs });
    assert.equal(click.defaultPrevented, false);
    assert.deepEqual(calls.nav, []);
    rt.dispose();
});

test('every stage unmount takes the chrome with it (splitscreen remount)', () => {
    const env = setup();
    const { rt, fb, win, loadSong, player, timers } = env;
    rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
    loadSong(ITEM);
    win.slopsmithSplitscreen.stop = () => {}; // splitscreen takes its time going down
    env.setSplit(true);
    fb.emit('splitscreen:panels-changed', {});
    assert.equal(player.querySelectorAll('.bab-chrome').length, 0);
    assert.ok(!player.classList.contains('bab-full'), 'no full-mode CSS without a stage');
    env.setSplit(false);
    timers.fire(50);
    assert.equal(player.querySelectorAll('.bab-chrome').length, 1, 'the remount brings it back');
    assert.ok(player.classList.contains('bab-full'));
    fb.emit('song:stop', {});
    assert.equal(player.querySelectorAll('.bab-chrome').length, 0);
    assert.ok(!player.classList.contains('bab-full'));
    rt.dispose();
});

test('a Play again whose song fails to start leaves full screen', (t) => {
    t.mock.method(console, 'warn', () => {});
    const { rt, fb, calls, loadSong, win } = setup();
    rt.startSession({ song: ITEM, prefs: fullPrefs(true) });
    loadSong(ITEM);
    fb.emit('song:ended', {});
    const playSong = win.playSong;
    // The replayed song fails to start: the replayed session goes back to idle.
    win.playSong = () => { throw new Error('nope'); };
    rt.again();
    win.playSong = playSong;
    return Promise.resolve().then(flush).then(() => {
        assert.equal(rt.phase(), 'idle');
        assert.equal(calls.fsExit, 1);
        rt.dispose();
    });
});

// ---- Plan 7 final review fixes ----

test("a late loadSettings can't leave the solo mastery", async () => {
    for (const closedFirst of [true, false]) {
        const { rt, win, calls, loadSong, keyWin, sidebar, navLinks } = setup();
        let resolveLoad;
        win.loadSettings = () => new Promise((r) => { resolveLoad = r; });
        rt.startSession({ song: ITEM, prefs: prefsWith({ guitar: { difficulty: 'medium' } }) });
        loadSong(ITEM);
        sidebar.fire('click', { target: navLinks.settings });
        if (closedFirst) {
            keyWin('Escape', 'Escape');
            assert.equal(calls.setMastery.at(-1), 0.5);
            assert.equal(calls.resume.length, 1);
        }
        win.highway.setMastery(0.9); // the late _applyMastery
        resolveLoad();
        await flush();
        assert.equal(calls.setMastery.at(-1), 0.5, 'the band mastery wins');
        if (!closedFirst) {
            keyWin('Escape', 'Escape');
            assert.equal(calls.setMastery.at(-1), 0.5);
        }
        assert.equal(calls.resume.length, 1, 'the late load resumes nothing');
        rt.dispose();
    }
});

test('a loadSettings settling after song:stop sets no mastery', async () => {
    const { rt, fb, win, calls, loadSong, sidebar, navLinks } = setup();
    let resolveLoad;
    win.loadSettings = () => new Promise((r) => { resolveLoad = r; });
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    sidebar.fire('click', { target: navLinks.settings });
    fb.emit('song:stop', {});
    const n = calls.setMastery.length;
    resolveLoad();
    await flush();
    assert.equal(calls.setMastery.length, n);
    rt.dispose();
});

test('every exit closes the leave prompt through its own cancel', async () => {
    for (const exit of ['stop', 'dispose', 'newSong']) {
        const { rt, fb, doc, calls, loadSong, sidebar, navLinks, prompts } = setup();
        rt.startSession({ song: ITEM, prefs: prefsWith() });
        loadSong(ITEM);
        sidebar.fire('click', { target: navLinks.songs });
        assert.equal(prompts.length, 1);
        assert.ok(prompts[0].modal.parentNode, 'the prompt shows');
        if (exit === 'stop') fb.emit('song:stop', {});
        else if (exit === 'dispose') rt.dispose();
        else fb.emit('song:loading', { filename: 'Other.sloppak' });
        assert.ok(!prompts[0].modal.parentNode, `${exit}: the prompt is gone`);
        assert.ok(!doc.body.querySelector('.feedBack-modal'), `${exit}: no modal left`);
        assert.equal(prompts[0].settled, true, `${exit}: the prompt settled`);
        await flush();
        assert.deepEqual(calls.resume, [], `${exit}: nothing resumes`);
        assert.deepEqual(calls.nav, [], `${exit}: the link is not followed`);
        rt.dispose();
    }
});

test('the song ending under Settings closes it before the results and resumes nothing', () => {
    const { rt, fb, doc, player, calls, loadSong, keyWin, sidebar, navLinks, settingsScreen } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    sidebar.fire('click', { target: navLinks.settings });
    assert.ok(bodyHas(doc, 'bab-settings-over'));
    fb.emit('song:ended', {});
    assert.ok(!bodyHas(doc, 'bab-settings-over'));
    assert.equal(settingsScreen.getAttribute('role'), null);
    assert.ok(player.querySelector('.bab-results'), 'the results show');
    assert.deepEqual(calls.resume, []);
    assert.equal(rt.stageUi().overlay, null);
    keyWin('Escape', 'Escape');
    assert.deepEqual(calls.resume, [], 'a later Escape resumes nothing');
    rt.dispose();
});

test('the song ending under the leave prompt closes it before the results and resumes nothing', async () => {
    const { rt, fb, doc, player, calls, loadSong, sidebar, navLinks, prompts } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    sidebar.fire('click', { target: navLinks.songs });
    fb.emit('song:ended', {});
    assert.ok(!doc.body.querySelector('.feedBack-modal'), 'the prompt is gone');
    assert.ok(player.querySelector('.bab-results'));
    assert.equal(rt.stageUi().overlay, null);
    prompts[0].resolve(true);
    await flush();
    assert.deepEqual(calls.resume, []);
    assert.deepEqual(calls.nav, []);
    rt.dispose();
});

test('a held M opens the sidebar once', () => {
    const { rt, doc, loadSong, keyWin } = setup();
    rt.startSession({ song: ITEM, prefs: prefsWith() });
    loadSong(ITEM);
    keyWin('KeyM', 'm');
    assert.ok(bodyHas(doc, 'bab-sidebar-open'));
    for (let i = 0; i < 2; i++) {
        const e = keyWin('KeyM', 'm', { repeat: true });
        assert.ok(e.defaultPrevented, 'a repeat is still consumed');
        assert.ok(bodyHas(doc, 'bab-sidebar-open'), 'a repeat does not toggle');
    }
    keyWin('KeyM', 'm', { repeat: false });
    assert.ok(!bodyHas(doc, 'bab-sidebar-open'), 'a fresh press closes it');
    rt.dispose();
});
