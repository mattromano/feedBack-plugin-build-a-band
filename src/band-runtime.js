// Build-a-Band session runtime: Go plays the picked song, the band stage
// mounts on that song's song:ready, and the session ends on song end (back to
// the band screen) or on leaving the player. The state machine lives in
// session.js; this file feeds it bus events and runs the effects it names.
// Everything is injected, so this is testable under node; screen.js passes
// the real window/document. Nothing here plays sound.
import { initialSession, reduceSession } from './session.js';
import { drumsDifficultyId, masteryFor, masteryFromPct } from './mappings.js';
import { drumArrIndex } from './arrangements.js';
import { applyDevices } from './devices.js';
import { planStage } from './stage.js';
import { PART_TYPES, getPart, hasChart, songFacts } from './parts.js';
import { karaokeApi, armVocals, startVocals, stopVocals } from './vocals.js';

const BAND_SCREEN = 'plugin-build_a_band';
const SPLIT_KEY = 'splitscreenActive';
const VIZ_KEY = 'vizSelection';
const EXIT_WAIT_MS = 1500;
const TOAST_MS = 4000;
const ONE_DIFFICULTY = 'This chart has one difficulty';
const NO_PITCH = 'No vocal pitch for this song';
const VOCALS_FAILED = "Vocals couldn't start";
const STEM_SOUND_MODES = ['rockband', 'kit'];
// Splitscreen coming up mid-session is stopped and the stage remounted once it
// is down; the third time in one session ends the session (no stop/start loop).
const SPLIT_MAX_STARTS = 3;
const SPLIT_POLL_MS = 50;
const SPLIT_POLL_MAX = 100;

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

// The parts this session plays, decided once at Go: a part plays only when it
// is on AND the song has its chart (the band screen's rule for greying a
// column); vocals also needs the Lyrics Karaoke API. Every later step reads
// these `on` flags.
function effectivePrefs(prefs, item, win) {
    const parts = { ...((prefs && prefs.parts) || {}) };
    for (const part of PART_TYPES) {
        const pp = parts[part.id];
        if (!pp) continue;
        const usable = part.id !== 'vocals' || !!karaokeApi(win);
        parts[part.id] = { ...pp, on: !!pp.on && hasChart(part, item, pp) && usable };
    }
    return { ...prefs, parts };
}

// The same prefs with vocals switched off (vocals sat out at Go).
function withoutVocals(prefs) {
    const vocals = prefs.parts.vocals;
    return { ...prefs, parts: { ...prefs.parts, vocals: { ...vocals, on: false } } };
}

// createBandRuntime({ win, doc, mountStage, loadPrefs, storage, fetchJson, setTimer, clearTimer, deviceMemo })
//   deviceMemo: the inputs last handed to note_detect / drums (devices.js),
//   shared with the band screen so a Go doesn't re-apply a device just picked.
//   -> { dispose(), isMounted(), startSession({ song, prefs }): false | Promise<true>, phase() }
// startSession returns false when it refuses (a session is running, no song);
// otherwise a promise of core's playSong that rejects, after the session went
// back to idle, when playSong throws or rejects.
export function createBandRuntime({
    win, doc, mountStage, loadPrefs, storage = win.localStorage, fetchJson,
    setTimer = win.setTimeout, clearTimer = win.clearTimeout, deviceMemo = {},
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

    function sliderMastery() {
        const slider = doc.getElementById('mastery-slider');
        return slider ? masteryFromPct(parseFloat(slider.value)) : null;
    }

    function newSession(item, prefs) {
        const guitarOn = isOn(prefs, 'guitar');
        const drumsOnly = !guitarOn && isOn(prefs, 'drums');
        const drumIndex = drumsOnly ? drumArrIndex(item.arrangements, { hasDrumTab: songFacts(item).hasDrumTab }) : -1;
        return {
            item, prefs,
            // The guitar part's arrangement, with the Lead fallback.
            guitarIndex: guitarOn ? getPart('guitar').chartFrom(item, prefs.parts.guitar) : undefined,
            drumsOnly,
            drumIndex,
            // Drums only on a drum-tab-only pack: the drums view draws the tab
            // on whatever arrangement the main highway opens.
            drumView: drumsOnly && drumIndex < 0,
            viewSwitched: false,
            savedSplit: null,
            savedMastery: null,
            readyDetail: null,
            drumCanvas: null,
            toast: null,
            toastTimer: null,
            canvasListener: false,
            played: null,
            setReturn: false,
            splitStarts: 0,
            splitWaiting: false,
            splitTimer: null,
            splitPolls: 0,
            vocals: isOn(prefs, 'vocals'),
            vocalsArmed: false,
            vocalsStarted: false,
            // Hear-myself off couldn't be applied: vocals sits out (no mic).
            vocalsFailed: false,
            karaoke: null,
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

    const splitscreen = () => win.slopsmithSplitscreen;
    function splitActive() {
        const ss = splitscreen();
        try { return !!(ss && typeof ss.isActive === 'function' && ss.isActive()); } catch (_) { return false; }
    }

    // Splitscreen came up during the session (its playSong wrapper on Always
    // Split, or a start after mount). Stop it, as the user toggling it off
    // would, and remount the stage once it is down: stopSplitScreen restores
    // #highway, so the stage's sizing and drum lane must be re-established.
    function onSplitStarted(s) {
        if (s.splitWaiting) return; // the same start announcing again
        s.splitStarts++;
        if (s.splitStarts >= SPLIT_MAX_STARTS) {
            console.warn('[build-a-band] splitscreen keeps starting; ending the band session');
            dispatch({ type: 'left' });
            return;
        }
        s.splitWaiting = true;
        s.splitPolls = 0;
        unmountStage();
        const ss = splitscreen();
        safe(() => ss && typeof ss.stop === 'function' && ss.stop());
        waitForSplitDown(s);
    }

    function waitForSplitDown(s) {
        if (session !== s || !s.splitWaiting) return;
        if (!splitActive()) {
            s.splitWaiting = false;
            if (state.phase === 'playing') {
                EFFECTS.mount(s);
                // Splitscreen was still up at song:ready, so vocals had no
                // strip slot then: start them now the stage is up.
                if (s.vocals && !s.vocalsStarted && !s.vocalsFailed) EFFECTS.startVocals(s);
            }
            return;
        }
        if (++s.splitPolls > SPLIT_POLL_MAX) {
            console.warn('[build-a-band] splitscreen did not stop; ending the band session');
            dispatch({ type: 'left' });
            return;
        }
        s.splitTimer = setTimer(() => { s.splitTimer = null; waitForSplitDown(s); }, SPLIT_POLL_MS);
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

    // Core's Auto view and its instrument takeover both leave a guitar part on
    // a guitar view, so the drums renderer is installed straight onto the main
    // highway, as core's takeover does (viz.js _installVizRenderer): nothing
    // is saved, so a crash mid-session leaves the user's view as it was. Runs
    // on the band song's song:ready, after core's own viz pick for it (core
    // subscribes at app.js load, before any plugin).
    function showDrumView(s) {
        const hw = win.highway;
        if (!s.drumView || !hw || typeof hw.setRenderer !== 'function' || typeof win.feedBackViz_drums !== 'function') return;
        let renderer = null;
        try { renderer = win.feedBackViz_drums(); } catch (e) { console.warn('[build-a-band] drums view failed', e); }
        if (!renderer || typeof renderer.draw !== 'function') return;
        if (safe(() => { hw.setRenderer(renderer); return true; })) s.viewSwitched = true;
    }

    // Re-apply the user's view the way the picker does. setViz saves its id,
    // so it is replayed with the saved id itself (an unchanged value); with
    // nothing saved, the picker's view is replayed and the key removed again.
    function restoreView(s) {
        if (!s.viewSwitched) return;
        s.viewSwitched = false;
        const saved = safe(() => storage.getItem(VIZ_KEY)) ?? null;
        if (typeof win.setViz !== 'function') return;
        if (saved !== null) { safe(() => win.setViz(saved)); return; }
        const picker = doc.getElementById('viz-picker');
        const picked = picker && picker.value;
        if (picked) {
            safe(() => win.setViz(picked));
            safe(() => storage.removeItem(VIZ_KEY));
        } else {
            safe(() => win.highway.setRenderer(null));
        }
    }

    function pinDrumDifficulty(s) {
        const api = win.feedBackDrums;
        if (!api || typeof api.setDifficulty !== 'function' || !s.drumCanvas) return;
        safe(() => api.setDifficulty(drumsDifficultyId(s.prefs.parts.drums.difficulty), s.drumCanvas));
    }

    const EFFECTS = {
        saveRestorePoint(s) {
            s.savedSplit = safe(() => storage.getItem(SPLIT_KEY)) ?? null;
            s.savedMastery = sliderMastery();
            if (s.savedMastery !== null) return;
            Promise.resolve()
                .then(() => getJson('/api/settings'))
                .then((settings) => {
                    if (s.savedMastery !== null) return;
                    // No saved master_difficulty means core's default, full mastery.
                    s.savedMastery = masteryFromPct(settings && settings.master_difficulty) ?? 1;
                })
                .catch(() => { /* keep null: nothing to restore */ });
        },
        // Before playSong, so the scorer karaoke builds on song load already
        // uses the band difficulty. Teardown clears these overrides.
        armVocals(s) {
            if (!s.vocals) return;
            const api = karaokeApi(win);
            if (!api) { s.vocals = false; s.prefs = withoutVocals(s.prefs); return; }
            s.karaoke = api;
            s.vocalsArmed = true;
            if (armVocals(api, s.prefs.parts.vocals)) return;
            // Karaoke's default is hear-myself on: opening the mic would put the
            // singer through the speakers. Sit vocals out for this session.
            console.warn('[build-a-band] hear-myself off could not be applied; vocals skipped');
            s.vocals = false;
            s.vocalsFailed = true;
            s.prefs = withoutVocals(s.prefs);
        },
        play(s) {
            let arrIndex;
            if (isOn(s.prefs, 'guitar')) arrIndex = s.guitarIndex;
            else if (s.drumsOnly && s.drumIndex >= 0) arrIndex = s.drumIndex;
            safe(() => fb.setReturnScreen(BAND_SCREEN));
            s.setReturn = true;
            // Splitscreen's playSong wrapper auto-starts from this pref; a band
            // session runs without it (teardown puts the saved value back).
            safe(() => storage.setItem(SPLIT_KEY, 'false'));
            try {
                s.played = Promise.resolve(win.playSong(encodeURIComponent(s.item.filename), arrIndex));
            } catch (e) {
                s.played = Promise.reject(e);
            }
        },
        mount(s) {
            const player = doc.getElementById('player');
            const song = fb.currentSong;
            if (!player || !song) return;
            const plan = planStage(song, s.prefs.parts);
            // Drums alone without vocals plays on the main highway: no stage.
            if (!plan.strip && plan.lanes.length === 0) return;
            if (s.splitWaiting) return; // mounted once splitscreen is down
            unmountStage();
            try {
                stage = mountStage({ player, song, prefs: s.prefs });
            } catch (e) {
                console.error('[build-a-band] stage failed to mount', e);
                stage = null;
                // No strip slot: vocals can't start (startVocals bails silently).
                if (s.vocals && !s.vocalsStarted) showToast(s, VOCALS_FAILED);
                return;
            }
            // A remount (splitscreen) re-hosts the running strip in the new slot.
            if (s.vocalsStarted && stage && stage.stripSlot && s.karaoke) {
                const api = s.karaoke;
                safe(() => api.mountStrip(stage.stripSlot));
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
                showDrumView(s);
                s.drumCanvas = doc.getElementById('highway');
                pinDrumDifficulty(s);
                fb.on('highway:canvas-replaced', onCanvasReplaced);
                s.canvasListener = true;
            }
        },
        applyDevices(s) {
            Promise.resolve()
                .then(() => applyDevices(s.prefs, win, storage, deviceMemo))
                .catch((e) => console.warn('[build-a-band] device routing failed', e));
        },
        // After the band song's song:ready and the mount (R9): karaoke mode,
        // the band mic, then karaoke's mic. A session that ended meanwhile
        // never opens the mic (startVocals re-checks after every await).
        startVocals(s) {
            if (s.vocalsFailed) { showToast(s, VOCALS_FAILED); return; }
            if (!s.vocals || s.vocalsStarted || !s.karaoke || !stage || !stage.stripSlot) return;
            s.vocalsStarted = true;
            const isCurrent = () => session === s && state.phase === 'playing';
            startVocals({
                api: s.karaoke, slot: stage.stripSlot, deviceId: s.prefs.parts.vocals.deviceId, storage, isCurrent,
            }).then((result) => {
                // Karaoke refused a song the library lists with pitch: a failure.
                if (result === 'no-pitch' && isCurrent()) {
                    showToast(s, songFacts(s.item).hasVocalPitch ? VOCALS_FAILED : NO_PITCH);
                }
            }, (e) => console.warn('[build-a-band] vocals failed to start', e));
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
            // 0. Karaoke, before its strip's slot goes: mic off, karaoke mode
            // off, strip back to its own place, band overrides cleared.
            if (s.vocalsArmed && s.karaoke) {
                s.vocalsArmed = false;
                s.vocalsStarted = false;
                const api = s.karaoke;
                safe(() => stopVocals(api));
            }
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
            // The user's own view, when drums only switched it.
            restoreView(s);
            // 3. The user's mastery, unpersisted (window.setMastery would save
            // it): the slider's current value, else the one saved at Go.
            const mastery = sliderMastery() ?? s.savedMastery;
            if (mastery !== null) safe(() => win.highway.setMastery(mastery));
            // 4. The user's splitscreen pref, without starting splitscreen.
            safe(() => {
                if (s.savedSplit === null) storage.removeItem(SPLIT_KEY);
                else storage.setItem(SPLIT_KEY, s.savedSplit);
            });
            // 5. Toast and the canvas-replaced listener.
            if (s.toastTimer !== null) { clearTimer(s.toastTimer); s.toastTimer = null; }
            if (s.toast) { safe(() => s.toast.remove()); s.toast = null; }
            if (s.canvasListener) { safe(() => fb.off('highway:canvas-replaced', onCanvasReplaced)); s.canvasListener = false; }
            if (s.splitTimer !== null) { clearTimer(s.splitTimer); s.splitTimer = null; }
            s.splitWaiting = false;
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
        const s = newSession(song, effectivePrefs(sessionPrefs(prefs, song), song, win));
        session = s;
        dispatch({ type: 'go', filename: song.filename });
        if (state.phase === 'idle') return false;
        return (s.played || Promise.resolve()).then(() => true, (e) => {
            // The song never started: undo this session, then report it. A
            // late rejection never tears down a session that is playing.
            if (session === s && state.phase === 'armed') {
                dispatch({ type: 'left' });
                // Our one-shot return override must not steer the next song.
                if (s.setReturn && fb._nextReturnScreen === BAND_SCREEN) fb._nextReturnScreen = null;
            }
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
        // Band mode and splitscreen never run at once. Armed or playing,
        // splitscreen is stopped and the stage comes back; while ending, the
        // session simply ends.
        'splitscreen:panels-changed': () => {
            if (!splitActive()) return;
            if (session && (state.phase === 'armed' || state.phase === 'playing')) onSplitStarted(session);
            else dispatch({ type: 'left' });
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
