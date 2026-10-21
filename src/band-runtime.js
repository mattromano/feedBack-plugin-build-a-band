// Build-a-Band session runtime: Go plays the picked song, the band stage
// mounts on that song's song:ready, and the session ends on song end (the
// results, then Play again or Next song) or on leaving the player. The state
// machine lives in session.js; this file feeds it bus events and runs the
// effects it names.
// Everything is injected, so this is testable under node; screen.js passes
// the real window/document. Nothing here plays sound.
import { initialSession, reduceSession } from './session.js';
import { drumsDifficultyId, masteryFor, masteryFromPct } from './mappings.js';
import { drumArrIndex } from './arrangements.js';
import { applyDevices } from './devices.js';
import { planStage } from './stage.js';
import { PART_TYPES, getPart, hasChart, songFacts } from './parts.js';
import { karaokeApi, armVocals, startVocals, stopVocals, showKaraokeHud } from './vocals.js';
import { createBandScore } from './band-score.js';
import { guitarEntry, drumsEntry, vocalsEntry, vocalsTotals } from './part-events.js';
import { guitarStarThresholds } from './stars.js';
import { createBandHud } from './hud.js';
import { createToastStack } from './toasts.js';
import { createCountInOverlay } from './count-in-overlay.js';
import { resultsModel } from './results.js';
import { showResultsScreen } from './results-screen.js';

const BAND_SCREEN = 'plugin-build_a_band';
const SPLIT_KEY = 'splitscreenActive';
const VIZ_KEY = 'vizSelection';
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
// A backward song:seek further than this rewinds the band score (plan 4 R2).
const REWIND_MIN_S = 0.05;
const BAND_SONG_CLASS = 'bab-band-song';
const DRUM_JUDGMENTS = ['hit', 'miss', 'overhit'];

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
// The parts the band score counts: only the ones playing (an absent part would
// pin the band multiplier at x1).
const playingParts = (prefs) => PART_TYPES.map((p) => p.id).filter((id) => isOn(prefs, id));

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
//   -> { dispose(), isMounted(), startSession({ song, prefs }): false | Promise<true>, phase(),
//        snapshot(): the current session's band score snapshot, or null,
//        again(), next(): Play again / Next song while the results show }
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
    // One toast stack per runtime, over the player (R18).
    const toasts = createToastStack({
        doc, getHost: () => doc.getElementById('player'), setTimer, clearTimer, ttlMs: TOAST_MS,
    });
    // note_detect hands each judgment to window twice (its own dispatch, then
    // the same detail bubbling from its instance root): count each once.
    const seenGuitar = new WeakSet();

    function sliderMastery() {
        const slider = doc.getElementById('mastery-slider');
        return slider ? masteryFromPct(parseFloat(slider.value)) : null;
    }

    function newSession(item, prefs, goPrefs) {
        const guitarOn = isOn(prefs, 'guitar');
        const drumsOnly = !guitarOn && isOn(prefs, 'drums');
        const drumIndex = drumsOnly ? drumArrIndex(item.arrangements, { hasDrumTab: songFacts(item).hasDrumTab }) : -1;
        return {
            item, prefs,
            // The prefs Go was given (Play again replays with them).
            goPrefs,
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
            canvasListener: false,
            // The results screen while the session is ending.
            results: null,
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
            // The band score ledger, kept past teardown for the results.
            score: null,
            scoreParts: [],
            guitarThresholds: null,
            hud: null,
            countIn: null,
            lastT: 0,
            // Karaoke's totals from its latest karaoke:reset, until a phrase
            // supersedes them: re-applied after a rewind replays the ledger.
            vocalsReset: undefined,
            // The plugins' own score displays this session hid (a replay
            // inherits them from the session before).
            hidden: { nd: false, drums: new Set(), scorecard: false },
            // Play again: teardown leaves the hides for the replayed session.
            keepHides: false,
            // Karaoke whose HUD stayed hidden for the replay.
            vocalsKept: null,
            countInOverride: false,
        };
    }

    function unmountStage() {
        if (!stage) return;
        const s = stage;
        stage = null;
        try { s.unmount(); } catch (e) { console.error('[build-a-band] unmount failed', e); }
    }

    function showToast(s, text) {
        void s;
        safe(() => toasts.show(text));
    }

    // The canvas the band's drums play on: the stage's drum lane, else (drums
    // alone) #highway, following canvas replacement.
    function bandDrumCanvas(s) {
        if (!isOn(s.prefs, 'drums')) return null;
        const lane = stage && typeof stage.getDrumCanvas === 'function' ? safe(() => stage.getDrumCanvas()) : null;
        if (lane) return lane;
        if (!s.drumsOnly) return null;
        return s.drumCanvas || doc.getElementById('highway');
    }

    function hideDrumHud(s, canvas) {
        const api = win.feedBackDrums;
        if (!canvas || s.hidden.drums.has(canvas) || !api || typeof api.setScoreHudHidden !== 'function') return;
        s.hidden.drums.add(canvas);
        safe(() => api.setScoreHudHidden(canvas, true));
    }

    function listenCanvas(s) {
        if (s.canvasListener) return;
        fb.on('highway:canvas-replaced', onCanvasReplaced);
        s.canvasListener = true;
    }

    // The band HUD replaces the plugins' own score displays (R13). Each switch
    // set here is undone at teardown.
    function applyHides(s) {
        if (isOn(s.prefs, 'guitar') && !s.hidden.nd) {
            const nd = win.noteDetect;
            if (nd && typeof nd.setScoreHudHidden === 'function') {
                s.hidden.nd = true;
                safe(() => nd.setScoreHudHidden(true));
            }
        }
        if (isOn(s.prefs, 'drums')) {
            hideDrumHud(s, bandDrumCanvas(s));
            listenCanvas(s);
        }
        const sc = win.feedBackScorecard;
        if (!s.hidden.scorecard && sc && typeof sc.setHudHidden === 'function') {
            s.hidden.scorecard = true;
            safe(() => sc.setHudHidden(true));
        }
    }

    function undoHides(s) {
        if (s.hidden.nd) {
            s.hidden.nd = false;
            const nd = win.noteDetect;
            if (nd && typeof nd.setScoreHudHidden === 'function') safe(() => nd.setScoreHudHidden(false));
        }
        const drums = win.feedBackDrums;
        for (const canvas of s.hidden.drums) {
            if (drums && typeof drums.setScoreHudHidden === 'function') safe(() => drums.setScoreHudHidden(canvas, false));
        }
        s.hidden.drums.clear();
        if (s.hidden.scorecard) {
            s.hidden.scorecard = false;
            const sc = win.feedBackScorecard;
            if (sc && typeof sc.setHudHidden === 'function') safe(() => sc.setHudHidden(false));
        }
    }

    // The band HUD on the current stage (a remount re-hosts it).
    function mountHud(s, song) {
        if (s.hud) { const old = s.hud; s.hud = null; safe(() => old.destroy()); }
        const player = doc.getElementById('player');
        if (!player || !stage || !s.score) return;
        const cur = song || fb.currentSong || {};
        s.hud = safe(() => createBandHud({
            doc, player, stage, parts: s.scoreParts, prefs: s.prefs,
            song: { title: cur.title || s.item.title, artist: cur.artist || s.item.artist },
            oneLevel: !(s.readyDetail && s.readyDetail.hasPhraseData),
        })) || null;
        if (s.hud) safe(() => s.hud.update(s.score.snapshot()));
    }

    function startCountIn(s) {
        safe(() => doc.body.classList.add(BAND_SONG_CLASS));
        if (s.countIn) return;
        s.countIn = safe(() => createCountInOverlay({
            doc, bus: fb, getHost: () => doc.getElementById('player'), setTimer, clearTimer,
        })) || null;
    }

    // A part that can't play leaves the band score (the ledger holds only the
    // parts actually playing, so it never pins the band multiplier at x1),
    // and its HUD goes with it; the results then have no card for it.
    function dropPart(s, id) {
        if (!s.score || !s.scoreParts.includes(id)) return;
        s.scoreParts = s.scoreParts.filter((p) => p !== id);
        s.score.dropPart(id);
        // The drop replays the ledger: karaoke's latest reset applies again.
        if (s.vocalsReset !== undefined) s.score.syncTotals('vocals', s.vocalsReset);
        if (s.hud) mountHud(s);
    }

    // Vocals that couldn't start leave the band unless they have judged
    // phrases of their own, whatever the other parts have judged.
    function dropVocals(s) {
        const v = s.score && s.score.snapshot().parts.vocals;
        if (!v || v.hits + v.misses + v.overhits > 0) return;
        dropPart(s, 'vocals');
    }

    // The drums plugin is loaded (its API or its renderer is there).
    const drumsPluginLoaded = () => !!win.feedBackDrums || typeof win.feedBackViz_drums === 'function';

    // Drums' star power phrases for the results, from the band's drum canvas.
    function drumsStarPower(s) {
        const api = win.feedBackDrums;
        const canvas = bandDrumCanvas(s);
        if (!canvas || !api || typeof api.getInstanceState !== 'function') return null;
        const sp = safe(() => { const st = api.getInstanceState(canvas); return st && st.starPower; });
        if (!sp || !Number.isFinite(sp.phrasesHit) || !Number.isFinite(sp.phrasesTotal)) return null;
        return { phrasesHit: sp.phrasesHit, phrasesTotal: sp.phrasesTotal };
    }

    // The session whose judgments score: playing, with a ledger.
    function scoring() {
        const s = session;
        return s && state.phase === 'playing' && s.score ? s : null;
    }

    // The song's display time for a ledger entry, always finite.
    function displayTime(s) {
        let t = typeof fb.getDisplayTime === 'function' ? safe(() => fb.getDisplayTime()) : undefined;
        if (!Number.isFinite(t)) {
            const audio = doc.getElementById('audio');
            t = audio ? Number(audio.currentTime) : undefined;
        }
        if (Number.isFinite(t)) s.lastT = t;
        return s.lastT;
    }

    function refreshHud(s, silent) {
        if (s.hud) safe(() => s.hud.update(s.score.snapshot(), silent ? { silent: true } : undefined));
    }

    function record(s, entry) {
        if (!entry) return;
        s.score.record(entry);
        refreshHud(s, false);
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
        // A drum canvas this session hid was replaced: hide the clone too
        // (the stage's lane canvas, or #highway for drums alone).
        if (d.oldCanvas && s.hidden.drums.has(d.oldCanvas)) hideDrumHud(s, d.newCanvas);
        if (!s.drumsOnly) return;
        if (d.oldCanvas && s.drumCanvas && d.oldCanvas !== s.drumCanvas) return;
        s.drumCanvas = d.newCanvas;
        pinDrumDifficulty(s);
        if (s.hidden.drums.size) hideDrumHud(s, s.drumCanvas);
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
            // Band songs always count in (R15), drawn by the band's overlay
            // over core's own, which body.bab-band-song hides. Core counts in
            // from its song:ready listener, before the stage mounts, so both
            // are up from the start of the session.
            if (typeof fb.setSongCountInOverride === 'function') {
                safe(() => fb.setSongCountInOverride(true));
                s.countInOverride = true;
            }
            startCountIn(s);
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
            // Every session with a playable lane or the strip has a stage (R10).
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
            // The band score survives a remount; the HUD moves to the new slots.
            if (!s.score) {
                s.scoreParts = playingParts(s.prefs);
                s.score = createBandScore({ parts: s.scoreParts });
                if (s.guitarThresholds) s.score.setStarThresholds('guitar', s.guitarThresholds);
            }
            // Drums that can't play leave the band: beside guitar, the lane
            // fell back to guitar only; alone, the drums plugin is missing.
            if (s.scoreParts.includes('drums')) {
                const lost = s.drumsOnly ? !drumsPluginLoaded() : !bandDrumCanvas(s);
                if (lost) dropPart(s, 'drums');
            }
            mountHud(s, song);
            startCountIn(s);
            applyHides(s);
        },
        applyDifficulties(s) {
            if (isOn(s.prefs, 'guitar')) {
                if (s.readyDetail && s.readyDetail.hasPhraseData) {
                    safe(() => win.highway.setMastery(masteryFor(s.prefs.parts.guitar.difficulty)));
                } else {
                    showToast(s, ONE_DIFFICULTY);
                }
                // Guitar stars: note_detect's full combo of the notes shown
                // at the band mastery (R5), read after it is applied. A stage
                // mounted later (splitscreen was up) picks them up from s.
                const hw = win.highway;
                if (hw && typeof hw.getFilteredNotes === 'function' && typeof hw.getFilteredChords === 'function') {
                    s.guitarThresholds = safe(() => guitarStarThresholds(hw.getFilteredNotes(), hw.getFilteredChords())) || null;
                    if (s.score) {
                        safe(() => s.score.setStarThresholds('guitar', s.guitarThresholds));
                        refreshHud(s, true);
                    }
                }
            }
            if (s.drumsOnly) {
                showDrumView(s);
                s.drumCanvas = doc.getElementById('highway');
                pinDrumDifficulty(s);
                listenCanvas(s);
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
                if (!isCurrent()) return;
                if (result === 'no-pitch' || result === 'mic-error') dropVocals(s);
                if (result === 'no-pitch') {
                    showToast(s, songFacts(s.item).hasVocalPitch ? VOCALS_FAILED : NO_PITCH);
                } else if (result === 'mic-error') {
                    // Karaoke no longer prompts for an API start: the band says so.
                    showToast(s, VOCALS_FAILED);
                }
            }, (e) => console.warn('[build-a-band] vocals failed to start', e));
        },
        holdExit() {
            release = (typeof fb.holdAutoExit === 'function') ? safe(() => fb.holdAutoExit()) || null : null;
        },
        // The results over the stage (R16, R17), with this session's numbers.
        // A session with no ledger (the stage never mounted) still gets them,
        // empty; if they can't show at all, Next song runs so core's held
        // exit is never stuck.
        showResults(s) {
            const player = doc.getElementById('player');
            if (s.results) return;
            const model = player && safe(() => resultsModel({
                snapshot: s.score ? s.score.snapshot() : null,
                prefs: s.prefs,
                song: { title: s.item.title, artist: s.item.artist },
                oneLevel: !(s.readyDetail && s.readyDetail.hasPhraseData),
                drumsExtra: drumsStarPower(s),
            }));
            s.results = model ? safe(() => showResultsScreen({
                doc, win, host: player, model,
                onAgain: () => dispatch({ type: 'again' }),
                onNext: () => dispatch({ type: 'next' }),
            })) || null : null;
            if (!s.results) dispatch({ type: 'next' });
        },
        hideResults(s) {
            if (!s.results) return;
            const r = s.results;
            s.results = null;
            safe(() => r.hide());
        },
        // Play again or leaving: core's held exit is never released. Core's
        // next playSong bumps its auto-exit generation, so it can't navigate.
        dropExit() {
            release = null;
        },
        teardown(s) {
            // 0. Karaoke, before its strip's slot goes: mic off, karaoke mode
            // off, strip back to its own place, band overrides cleared.
            if (s.vocalsArmed && s.karaoke) {
                s.vocalsArmed = false;
                s.vocalsStarted = false;
                const api = s.karaoke;
                safe(() => stopVocals(api, { keepHud: s.keepHides }));
                if (s.keepHides) s.vocalsKept = api;
            }
            // 0b. The band HUD, count-in and toasts go; each plugin's own
            // score display comes back; core's count-in pref rules again.
            // s.score is kept for the results.
            if (s.hud) { const hud = s.hud; s.hud = null; safe(() => hud.destroy()); }
            if (s.countIn) { const c = s.countIn; s.countIn = null; safe(() => c.destroy()); }
            safe(() => doc.body.classList.remove(BAND_SONG_CLASS));
            if (!s.keepHides) undoHides(s);
            if (s.countInOverride) {
                s.countInOverride = false;
                if (typeof fb.setSongCountInOverride === 'function') safe(() => fb.setSongCountInOverride(null));
            }
            safe(() => toasts.clear());
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
            // 5. The canvas-replaced listener.
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
        // Play again: teardown left the plugins' displays hidden, so the
        // replayed session takes them over (no flash of their own HUDs).
        keepHides(s) {
            s.keepHides = true;
        },
        // Play again: the same library item with the prefs Go was given, through
        // the normal Go path. Always the last effect: the session is idle by now.
        replay(s) {
            const started = begin(s.item, s.goPrefs, s.keepHides ? s.hidden : null);
            // Refused: nothing took the hides over, so they're undone here.
            if (!started && s.keepHides) undoHides(s);
            // Karaoke's hide passes on only when the replay armed karaoke again.
            const next = started ? session : null;
            if (s.keepHides && s.vocalsKept && !(next && next.vocalsArmed && next.karaoke === s.vocalsKept)) {
                const api = s.vocalsKept;
                safe(() => showKaraokeHud(api));
            }
            if (started && typeof started.then === 'function') {
                started.catch((e) => console.warn('[build-a-band] Play again failed to start the song', e));
            }
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
        return begin(song, prefs, null);
    }

    // hidden: the hides a replayed session inherits (undone at its teardown).
    function begin(song, prefs, hidden) {
        if (state.phase !== 'idle' || !song || !song.filename) return false;
        const s = newSession(song, effectivePrefs(sessionPrefs(prefs, song), song, win), prefs);
        if (hidden) s.hidden = hidden;
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
    // Judgments into the band score (R3): each acts only while the session
    // plays, then refreshes the HUD.
    const drumHandler = (type) => (e) => {
        const s = scoring();
        if (!s) return;
        const canvas = bandDrumCanvas(s);
        // A canvas the stage adopted without an announcement is hidden here.
        if (canvas && s.hidden.drums.size) hideDrumHud(s, canvas);
        // Plan 5's overdrive factor goes on entries here, but not on drums:
        // drums' points already include its own star-power doubling.
        record(s, drumsEntry(type, e && e.detail, displayTime(s), canvas));
    };
    for (const type of DRUM_JUDGMENTS) handlers['drums:' + type] = drumHandler(type);
    handlers['karaoke:phrase'] = (e) => {
        const s = scoring();
        if (!s) return;
        const entry = vocalsEntry(e && e.detail, displayTime(s));
        if (entry) s.vocalsReset = undefined;
        record(s, entry);
    };
    handlers['karaoke:reset'] = (e) => {
        const s = scoring();
        if (!s) return;
        s.vocalsReset = vocalsTotals(e && e.detail);
        s.score.syncTotals('vocals', s.vocalsReset);
        refreshHud(s, true);
    };
    // Rewind on a backward seek (R2): the ledger first, then karaoke's reset
    // totals (karaoke may announce its reset before or after this listener).
    handlers['song:seek'] = (e) => {
        const s = scoring();
        const d = (e && e.detail) || {};
        if (!s || !Number.isFinite(d.from) || !Number.isFinite(d.to)) return;
        if (!(d.to < d.from - REWIND_MIN_S) || d.reason === 'loop-wrap') return;
        s.score.rewindTo(d.to);
        s.lastT = d.to;
        if (s.vocalsReset !== undefined) s.score.syncTotals('vocals', s.vocalsReset);
        refreshHud(s, true);
    };
    function onGuitarJudgment(e) {
        const s = scoring();
        const d = e && e.detail;
        if (!s || !d || typeof d !== 'object' || seenGuitar.has(d)) return;
        seenGuitar.add(d);
        record(s, guitarEntry(d, displayTime(s)));
    }
    const winHandlers = { 'notedetect:hit': onGuitarJudgment, 'notedetect:miss': onGuitarJudgment };

    for (const [ev, fn] of Object.entries(handlers)) fb.on(ev, fn);
    const winEvents = typeof win.addEventListener === 'function';
    if (winEvents) for (const [ev, fn] of Object.entries(winHandlers)) win.addEventListener(ev, fn);

    return {
        dispose() {
            dispatch({ type: 'left' });
            for (const [ev, fn] of Object.entries(handlers)) fb.off(ev, fn);
            if (winEvents) for (const [ev, fn] of Object.entries(winHandlers)) safe(() => win.removeEventListener(ev, fn));
            safe(() => toasts.clear());
        },
        isMounted: () => !!stage,
        startSession,
        phase: () => state.phase,
        snapshot: () => (session && session.score ? session.score.snapshot() : null),
        again: () => dispatch({ type: 'again' }),
        next: () => dispatch({ type: 'next' }),
    };
}
