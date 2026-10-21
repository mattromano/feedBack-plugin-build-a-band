// Build-a-Band session runtime: Go plays the picked song, the band stage
// mounts on that song's song:ready, and the session ends on song end (back to
// the band screen) or on leaving the player. The state machine lives in
// session.js; this file feeds it bus events and runs the effects it names.
// Everything is injected, so this is testable under node; screen.js passes
// the real window/document. Nothing here plays sound.
import { initialSession, reduceSession } from './session.js';
import { drumsDifficultyId, guitarArrIndex, masteryFor, masteryFromPct } from './mappings.js';
import { findDrumArrangement } from './arrangements.js';
import { applyDevices } from './devices.js';
import { planStage } from './stage.js';
import { songFacts } from './parts.js';

const BAND_SCREEN = 'plugin-build_a_band';
const SPLIT_KEY = 'splitscreenActive';
const EXIT_WAIT_MS = 1500;
const TOAST_MS = 4000;
const ONE_DIFFICULTY = 'This chart has one difficulty';
const STEM_SOUND_MODES = ['rockband', 'kit'];

function safe(fn) {
    try { return fn(); } catch (e) { console.warn('[build-a-band]', e); return undefined; }
}

// The prefs a session runs with: Rock Band / My kit need a drum stem, so a
// song without one plays with the song's own drums.
function sessionPrefs(prefs, item) {
    const drums = prefs && prefs.parts && prefs.parts.drums;
    if (!drums || !STEM_SOUND_MODES.includes(drums.soundMode)) return prefs;
    if (songFacts(item).stemIds.includes('drums')) return prefs;
    return { ...prefs, parts: { ...prefs.parts, drums: { ...drums, soundMode: 'song' } } };
}

const isOn = (prefs, id) => !!(prefs && prefs.parts && prefs.parts[id] && prefs.parts[id].on);

// createBandRuntime({ win, doc, mountStage, loadPrefs, storage, fetchJson, setTimer, clearTimer })
//   -> { dispose(), isMounted(), startSession({ song, prefs }): false | Promise<true>, phase() }
// startSession returns false when it refuses (a session is running, no song);
// otherwise a promise of core's playSong that rejects, after the session went
// back to idle, when playSong throws or rejects.
export function createBandRuntime({
    win, doc, mountStage, loadPrefs, storage = win.localStorage, fetchJson,
    setTimer = win.setTimeout, clearTimer = win.clearTimeout,
}) {
    const fb = win.feedBack;
    const getJson = fetchJson || ((url) => win.fetch(url).then((r) => r.json()));
    // loadPrefs is kept in the signature for screen.js; a session runs with
    // the prefs Go hands it.
    void loadPrefs;

    let state = initialSession();
    // Per-session runtime data the pure reducer does not hold.
    let session = null;
    let stage = null;
    let release = null;
    let exitTimer = null;

    function newSession(item, prefs) {
        return {
            item, prefs,
            drumsOnly: !isOn(prefs, 'guitar') && isOn(prefs, 'drums'),
            savedSplit: null,
            savedMastery: null,
            readyDetail: null,
            drumCanvas: null,
            toast: null,
            toastTimer: null,
            canvasListener: false,
            played: null,
        };
    }

    function unmountStage() {
        if (!stage) return;
        const s = stage;
        stage = null;
        try { s.unmount(); } catch (e) { console.error('[build-a-band] unmount failed', e); }
    }

    function showToast(s, text) {
        const player = doc.getElementById('player');
        if (!player) return;
        const el = doc.createElement('div');
        el.className = 'bab-toast';
        el.setAttribute('role', 'status');
        el.textContent = text;
        player.appendChild(el);
        s.toast = el;
        s.toastTimer = setTimer(() => {
            s.toastTimer = null;
            safe(() => el.remove());
            if (s.toast === el) s.toast = null;
        }, TOAST_MS);
    }

    // Drums-only: the main highway shows the drum chart, so the band drum
    // difficulty goes on #highway and follows a canvas replacement.
    function onCanvasReplaced(e) {
        const d = e && e.detail;
        const s = session;
        if (!s || state.phase !== 'playing' || !d || !d.newCanvas) return;
        if (d.oldCanvas && s.drumCanvas && d.oldCanvas !== s.drumCanvas) return;
        s.drumCanvas = d.newCanvas;
        pinDrumDifficulty(s);
    }

    function pinDrumDifficulty(s) {
        const api = win.feedBackDrums;
        if (!api || typeof api.setDifficulty !== 'function' || !s.drumCanvas) return;
        safe(() => api.setDifficulty(drumsDifficultyId(s.prefs.parts.drums.difficulty), s.drumCanvas));
    }

    const EFFECTS = {
        saveRestorePoint(s) {
            s.savedSplit = safe(() => storage.getItem(SPLIT_KEY)) ?? null;
            const slider = doc.getElementById('mastery-slider');
            s.savedMastery = slider ? masteryFromPct(parseFloat(slider.value)) : null;
            if (s.savedMastery !== null) return;
            Promise.resolve()
                .then(() => getJson('/api/settings'))
                .then((settings) => {
                    if (s.savedMastery !== null) return;
                    s.savedMastery = masteryFromPct(settings && settings.master_difficulty);
                })
                .catch(() => { /* keep null: nothing to restore */ });
        },
        play(s) {
            const arrs = s.item.arrangements;
            let arrIndex;
            if (isOn(s.prefs, 'guitar')) {
                arrIndex = guitarArrIndex(arrs, s.prefs.parts.guitar.arrangement);
            } else if (isOn(s.prefs, 'drums')) {
                const i = findDrumArrangement(arrs);
                arrIndex = i >= 0 ? i : undefined;
            }
            safe(() => fb.setReturnScreen(BAND_SCREEN));
            try {
                s.played = Promise.resolve(win.playSong(encodeURIComponent(s.item.filename), arrIndex));
            } catch (e) {
                s.played = Promise.reject(e);
            }
        },
        mount(s) {
            const player = doc.getElementById('player');
            const song = fb.currentSong;
            if (!player || !song || planStage(song, s.prefs.parts).lanes.length === 0) return;
            unmountStage();
            try {
                stage = mountStage({ player, song, prefs: s.prefs });
            } catch (e) {
                console.error('[build-a-band] stage failed to mount', e);
                stage = null;
            }
        },
        applyDifficulties(s) {
            if (isOn(s.prefs, 'guitar')) {
                if (s.readyDetail && s.readyDetail.hasPhraseData) {
                    safe(() => win.highway.setMastery(masteryFor(s.prefs.parts.guitar.difficulty)));
                } else {
                    showToast(s, ONE_DIFFICULTY);
                }
            }
            if (s.drumsOnly) {
                s.drumCanvas = doc.getElementById('highway');
                pinDrumDifficulty(s);
                fb.on('highway:canvas-replaced', onCanvasReplaced);
                s.canvasListener = true;
            }
        },
        applyDevices(s) {
            Promise.resolve()
                .then(() => applyDevices(s.prefs, win, storage))
                .catch((e) => console.warn('[build-a-band] device routing failed', e));
        },
        holdExit() {
            release = (typeof fb.holdAutoExit === 'function') ? safe(() => fb.holdAutoExit()) || null : null;
        },
        startExitTimer() {
            exitTimer = setTimer(() => { exitTimer = null; dispatch({ type: 'exitTimer' }); }, EXIT_WAIT_MS);
        },
        cancelExitTimer() {
            if (exitTimer !== null) { clearTimer(exitTimer); exitTimer = null; }
            release = null;
        },
        teardown(s) {
            // 1. Stage.
            unmountStage();
            // 2. Drums-only: the main highway's band difficulty.
            if (s.drumsOnly) {
                const api = win.feedBackDrums;
                if (api && typeof api.clearDifficulty === 'function') {
                    const canvases = new Set([doc.getElementById('highway'), s.drumCanvas].filter(Boolean));
                    for (const c of canvases) safe(() => api.clearDifficulty(c));
                }
            }
            // 3. The user's mastery, unpersisted (window.setMastery would save it).
            if (s.savedMastery !== null) safe(() => win.highway.setMastery(s.savedMastery));
            // 4. The user's splitscreen pref, without starting splitscreen.
            safe(() => {
                if (s.savedSplit === null) storage.removeItem(SPLIT_KEY);
                else storage.setItem(SPLIT_KEY, s.savedSplit);
            });
            // 5. Toast and the canvas-replaced listener.
            if (s.toastTimer !== null) { clearTimer(s.toastTimer); s.toastTimer = null; }
            if (s.toast) { safe(() => s.toast.remove()); s.toast = null; }
            if (s.canvasListener) { safe(() => fb.off('highway:canvas-replaced', onCanvasReplaced)); s.canvasListener = false; }
            s.drumCanvas = null;
        },
        releaseExit() {
            const r = release;
            release = null;
            if (typeof r === 'function') safe(r);
        },
        showBandScreen() {
            const el = doc.getElementById(BAND_SCREEN);
            if (el && el.classList.contains('active')) return;
            if (typeof win.showScreen === 'function') safe(() => win.showScreen(BAND_SCREEN));
        },
    };

    // State is committed before effects run, so an effect that re-enters
    // (release() closes the player and announces screen:changing) sees it.
    function dispatch(event) {
        const { state: next, effects } = reduceSession(state, event);
        state = next;
        const s = session;
        if (state.phase === 'idle') session = null;
        if (!s) return;
        for (const name of effects) {
            const fn = EFFECTS[name];
            if (!fn) continue;
            try { fn(s); } catch (e) { console.error(`[build-a-band] session effect ${name} failed`, e); }
        }
    }

    function startSession({ song, prefs } = {}) {
        if (state.phase !== 'idle' || !song || !song.filename) return false;
        const s = newSession(song, sessionPrefs(prefs, song));
        session = s;
        dispatch({ type: 'go', filename: song.filename });
        if (state.phase === 'idle') return false;
        return (s.played || Promise.resolve()).then(() => true, (e) => {
            // The song never started: undo this session, then report it.
            if (session === s) dispatch({ type: 'left' });
            throw e;
        });
    }

    const handlers = {
        'song:loading': () => dispatch({ type: 'loading' }),
        'song:ready': (e) => {
            const detail = (e && e.detail) || {};
            if (session) session.readyDetail = detail;
            const cur = fb.currentSong;
            dispatch({ type: 'ready', filename: cur && cur.filename, hasPhraseData: !!detail.hasPhraseData });
        },
        'song:ended': () => dispatch({ type: 'ended' }),
        'song:stop': () => dispatch({ type: 'left' }),
        'screen:changing': (e) => {
            const d = (e && e.detail) || {};
            if (d.from === 'player' && d.id !== 'player') dispatch({ type: 'left' });
        },
        // Band mode and splitscreen never run at once: splitscreen coming up
        // ends the session.
        'splitscreen:panels-changed': () => {
            const ss = win.slopsmithSplitscreen;
            let on = false;
            try { on = !!(ss && typeof ss.isActive === 'function' && ss.isActive()); } catch (_) { /* ignore */ }
            if (on) dispatch({ type: 'left' });
        },
    };
    for (const [ev, fn] of Object.entries(handlers)) fb.on(ev, fn);

    return {
        dispose() {
            dispatch({ type: 'left' });
            for (const [ev, fn] of Object.entries(handlers)) fb.off(ev, fn);
        },
        isMounted: () => !!stage,
        startSession,
        phase: () => state.phase,
    };
}
