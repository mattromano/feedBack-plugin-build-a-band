// Band screen: binds the static skeleton in screen.html to band prefs and the
// picked song. Thin DOM layer; the rules live in band-model.js.
import { PART_TYPES } from './parts.js';
import { pushRecent } from './prefs.js';
import { songChips, resolveRecent, pickFilters } from './query.js';
import { bandScreenModel, isGoKey } from './band-model.js';
import {
    listGuitarInputs, listDrumInputs, listMicInputs, findKit,
    applyGuitarDevice, applyDrumDevice, applyMicDevice,
} from './devices.js';
import { createLevelMeter } from './level-meter.js';
import { openPadLight } from './pad-light.js';
import { karaokeApi } from './vocals.js';
import { icon } from './icons.js';
import { createJoinManager } from './join.js';
import { createControllerColumns } from './controller-columns.js';
import { CONTROLLER_KINDS, kindFor, joinController, leaveController, updateController } from './controller-model.js';
// The join manager lists and joins 5-Fret controllers only (Task B3 adds drums), so an
// unjoined pad's kind (its mapper, its Set up screen) is 5-Fret's.
const JOIN_KINDS = Object.freeze(['five_fret']);

const SCREEN_ID = 'plugin-build_a_band';
const SOUND_MODES_NEEDING_STEM = ['rockband', 'kit'];

// Input devices and signal lights, per part. Lights are silent: meters read
// an unconnected AnalyserNode, the pad light only listens to MIDI.
const DEVICE_FIELD = { guitar: 'deviceKey', drums: 'deviceKey', vocals: 'deviceId' };
const INPUT_LABEL = { guitar: 'Input', drums: 'Kit', vocals: 'Mic' };
const DEVICE_PLACEHOLDER = { guitar: 'Choose an input', drums: 'Choose your kit', vocals: 'Choose a mic' };
const SIGNAL_LABEL = { guitar: 'Signal', drums: 'Hit a pad', vocals: 'Level' };
const STATE_LABEL = { 'no-access': 'no access', 'check-in-game': 'check in game' };
const NEEDS_MIC_ACCESS = 'Allow microphone access to list inputs';
const GO_FAILED = "Couldn't start the song";
const PAD_FLASH_MS = 120;
const LIT_LEVEL = 0.02;
// Mic-hit check: one reading per karaoke block (2048 samples), a flash per hit.
const MIC_FRAME = 2048;
const MIC_HIT_FLASH_MS = 300;
const METER_FLOOR_DB = 60;
const NEEDS_KARAOKE = 'Needs Lyrics Karaoke';
const TAP_THE_MIC = 'Tap the mic';
// The library pick (core's feedBack.library.pick).
const PICK_TITLE = 'Pick a song for the band';
const PICK_CONFIRM = 'Use this song';
const PICK_BACK = 'Back to the band';
const NO_DEVICE = 'none picked';
const DEVICE_NOT_FOUND = 'Saved device (not found)';
// The join slot (controller players).
const JOIN_HINT = 'Press Start on a controller to join';
const NO_FIVE_FRET = 'Install the 5-Fret plugin to play on a controller';
const NO_WATCH = 'Update feedBack to join with a controller';
const LIGHTS_OFF = Object.freeze({ green: false, red: false, yellow: false, blue: false, orange: false });
const TEXT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
const isTyping = (a) => !!a && (TEXT_TAGS.includes(String(a.tagName || '').toUpperCase()) || !!a.isContentEditable);
const meterPct = (db) => `${Math.min(1, Math.max(0, (db + METER_FLOOR_DB) / METER_FLOOR_DB)) * 100}%`;

function defaultStorage(win) {
    try { return win && win.localStorage; } catch (_) { return undefined; }
}

// Segment values are strings in the DOM; hearMyself is stored as a boolean.
const fromDom = (field, v) => (field === 'hearMyself' ? v === 'on' : v);
const toDom = (field, v) => (field === 'hearMyself' ? (v ? 'on' : 'off') : String(v));

function songRef(item) {
    return { filename: item.filename, title: item.title || '', artist: item.artist || '' };
}

// createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo, fetchJson?, storage?, library? })
//   -> { dispose(), setSong(item | null), getSong(), isVisible(), view(), openLibrary(), nextSong() }
// Two views: 'setup' (the parts' devices and checks, then Choose a song) and
// 'confirm' (the song, each part's difficulty and sound, then GO).
// storage (default win.localStorage) receives karaoke's mic pick.
// deviceMemo: shared with the band runtime (devices.js), so a device applied
// here is not applied again at Go.
// library (default win.feedBack.library): core's pick hook; songs are chosen
// in the Song Library through library.pick().
export function createBandScreen({
    root, win, doc, loadPrefs, savePrefs, onGo, fetchJson, storage, deviceMemo = {},
    library = win && win.feedBack && win.feedBack.library,
}) {
    const fb = win && win.feedBack;
    const pickAvailable = !!(library && typeof library.pick === 'function');
    const getJson = fetchJson || ((url) => win.fetch(url).then((r) => r.json()));
    const $ = (sel, el = root) => el.querySelector(sel);
    const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
    const cleanups = [];
    const listen = (target, type, fn, capture = false) => {
        target.addEventListener(type, fn, capture);
        cleanups.push(() => target.removeEventListener(type, fn, capture));
    };

    let prefs = loadPrefs();
    let song = null;
    let picked = false; // setSong was called: the lastSong restore must not override it
    let disposed = false;
    let view = 'setup';
    let pickGen = 0; // a late result from an older library pick is ignored
    let pendingPick = false; // nextSong while hidden: pick on the next show
    let lastResolved = false; // lastSong resolved to a library row: offer Continue with
    let artFile; // the file the art <img> shows (undefined: not rendered yet, so the first render hides it)
    // Go fires once per showing: a burst of pad hits or Space + pad must not
    // start the song twice while core is still switching screens.
    let launched = false;
    let goAttempt = 0; // a late result from an older Go is ignored
    let goError = '';
    const inputNote = {}; // part id -> device note (e.g. mic access needed)
    let mic = null; // the vocals mic-hit check: { block, slider, level, tick, light, text }
    let micDetector = null; // karaoke's shared detector, alive while the vocals meter runs
    let micFlashTimer = null;
    const isActive = () => {
        const el = doc.getElementById(SCREEN_ID);
        return !!(el && el.classList.contains('active'));
    };
    let visible = isActive();
    // Controller players. Plugin globals are read at call time: a late or missing
    // 5-Fret plugin (or an older core) only degrades the join slot.
    const fiveFretApi = () => (win && win.feedBackFiveFret) || null;
    const gamepadInput = () => (win && win.feedBack && win.feedBack.gamepadInput) || null;
    const showAuto = () => {
        try { return fiveFretApi()?.showAutoCharts?.() === true; } catch (_) { return false; }
    };
    let joinManager = null; // created on each show, stopped on hide
    let columns = null;
    let joinSlotSig = null;
    const controllerKeys = () => (Array.isArray(prefs.controllers) ? prefs.controllers : []).map((c) => c.key);

    // { available, reason (a note, or null), connected, needsSetup } for the model and the join slot.
    function controllerStatus() {
        const gi = gamepadInput();
        let reason = null;
        if (!fiveFretApi()) reason = NO_FIVE_FRET;
        else if (!gi || typeof gi.watch !== 'function') reason = NO_WATCH;
        const s = joinManager ? joinManager.status() : null;
        return {
            available: reason === null, reason,
            connected: (s && s.connected) || new Set(),
            needsSetup: (reason === null && s && s.needsSetup) || [],
        };
    }

    function model(status = controllerStatus()) {
        return bandScreenModel({
            prefs, item: song, vocalsSupported: !!karaokeApi(win), noteDetectLoaded: !!win.noteDetect, pickAvailable,
            fiveFretLoaded: !!fiveFretApi(), controllerStatus: status, showAuto: showAuto(),
        });
    }

    function save(patch) {
        prefs = savePrefs(patch);
        render();
    }

    function renderSong() {
        $('.bab-title').textContent = song ? (song.title || song.filename) : 'Pick a song';
        $('.bab-artist').textContent = song ? (song.artist || '') : '';
        const art = $('.bab-art-img');
        const file = song && song.filename ? song.filename : null;
        if (art && file !== artFile) {
            artFile = file;
            // The URL core's library uses; a song without art hides the <img> (onerror).
            if (file) art.src = `/api/song/${encodeURIComponent(file)}/art`;
            art.hidden = !file;
        }
        const chips = $('.bab-chips');
        chips.replaceChildren();
        if (!song) return;
        for (const c of songChips(song, { showAuto: showAuto() })) {
            const span = doc.createElement('span');
            span.className = c.good ? 'bab-chip bab-good' : 'bab-chip';
            span.textContent = c.label;
            chips.appendChild(span);
        }
    }

    // The detector comes from karaoke, so the check is unusable without it.
    const micHitApi = () => {
        const api = karaokeApi(win);
        const mh = api && api.micHit;
        return mh && typeof mh.createDetector === 'function' ? mh : null;
    };

    function renderMicHit() {
        const m = mic;
        if (!m) return;
        const usable = !!micHitApi();
        const db = prefs.parts.vocals.micHitDb;
        m.block.classList.toggle('bab-disabled', !usable);
        m.slider.disabled = !usable;
        m.slider.value = String(db);
        m.tick.style.setProperty('left', meterPct(db));
        m.text.textContent = usable ? TAP_THE_MIC : NEEDS_KARAOKE;
    }

    function renderSeg(seg, value, disabledValues = []) {
        for (const b of $$('button[data-value]', seg)) {
            b.setAttribute('aria-pressed', b.getAttribute('data-value') === value ? 'true' : 'false');
            b.disabled = disabledValues.includes(b.getAttribute('data-value'));
        }
    }

    // The segment value shown and the values greyed out, from the column model.
    function segState(field, c, pp) {
        if (field === 'soundMode') return [c.soundMode, c.soundModesDisabled ? SOUND_MODES_NEEDING_STEM : []];
        if (field === 'arrangement') {
            return [c.arrangement, Object.keys(c.arrangements).filter((n) => c.arrangements[n] === false)];
        }
        return [pp[field], []];
    }

    function render() {
        if (disposed) return;
        const status = controllerStatus();
        const m = model(status);
        root.setAttribute('data-view', view);
        renderSong();
        for (const part of PART_TYPES) {
            const c = m.columns[part.id];
            const pp = prefs.parts[part.id];
            if (!c || !pp) continue;
            // The Setup column and the Confirm row of the same part.
            for (const el of $$(`[data-part="${part.id}"]`)) {
                el.classList.toggle('bab-off', !c.on);
                el.classList.toggle('bab-unavailable', c.unavailable);
                const toggle = $('.bab-toggle', el);
                if (toggle) toggle.setAttribute('aria-pressed', c.on ? 'true' : 'false');
                for (const seg of $$('.bab-seg[data-field]', el)) {
                    const field = seg.getAttribute('data-field');
                    const [value, off] = segState(field, c, pp);
                    renderSeg(seg, toDom(field, value), off);
                }
                const note = $('.bab-note', el);
                if (note) note.textContent = [c.note, inputNote[part.id]].filter(Boolean).join(' \u00b7 ');
            }
            renderDeviceLine(part.id);
        }
        if (columns) columns.render(m.controllers);
        renderJoinSlot(status);
        renderMicHit();
        renderSeg($('.bab-seg[data-field="failMode"]'), prefs.failMode);
        $('input.bab-fullscreen').checked = !!prefs.fullScreenStage;
        $('.bab-choose').disabled = !m.pickEnabled;
        $('.bab-change').disabled = !m.pickEnabled;
        $('.bab-setup-hint').textContent = m.setupHint;
        const cont = $('.bab-continue');
        cont.hidden = !(lastResolved && song);
        cont.textContent = song ? `Continue with ${song.title || song.filename}` : '';
        $('.bab-hint').textContent = goError || m.goHint;
        $('.bab-go').disabled = !m.goEnabled;
    }

    // "Press Start on a controller to join", or why it can't, plus a Set up link per
    // controller that needs one. Rebuilt only when what it says changes.
    function renderJoinSlot(status) {
        const slot = $('.bab-joinslot');
        if (!slot) return;
        const text = status.reason || JOIN_HINT;
        const sig = JSON.stringify([text, status.needsSetup.map((n) => [n.controllerKey, n.name])]);
        if (sig === joinSlotSig) return;
        joinSlotSig = sig;
        const ico = doc.createElement('span');
        ico.className = 'bab-ico';
        ico.innerHTML = icon('gamepad-2', { size: 26 });
        const hint = doc.createElement('span');
        hint.className = 'bab-join-text';
        hint.textContent = text;
        slot.replaceChildren(ico, hint);
        for (const n of status.needsSetup) {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = 'bab-setup-link';
            b.textContent = `Set up ${n.name || n.controllerKey}`;
            b.addEventListener('click', () => openControllerSetup(n.controllerKey));
            slot.appendChild(b);
        }
    }

    // Controls / Set up: the controller kind's own setup screen, which returns here.
    function openControllerSetup(key) {
        const kind = CONTROLLER_KINDS[kindFor(prefs, key, JOIN_KINDS)];
        try { if (kind && typeof kind.setupHref === 'function') kind.setupHref(); } catch (_) { /* plugin gone */ }
    }

    // Start on a joined controller is the screen's primary button.
    function primary() {
        if (view === 'confirm') go();
        else openLibrary();
    }

    // The join manager runs while the screen is shown (both views). It claims the joined,
    // connected controllers; hiding releases them for the library, the 5-Fret controls
    // screen and the stage. Each show starts afresh, so the Set up list is current.
    function startJoin() {
        stopJoin();
        joinManager = createJoinManager({
            gamepadInput: gamepadInput(), kinds: CONTROLLER_KINDS, kindFor: (key) => kindFor(prefs, key, JOIN_KINDS),
            setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h),
            onJoin: (j) => save({ controllers: joinController(prefs.controllers, j) }),
            onLeave: (key) => save({ controllers: leaveController(prefs.controllers, key) }),
            onPrimary: () => primary(),
            onLight: (key, lit) => { if (columns) columns.light(key, lit); },
            onChange: () => render(),
        });
        joinManager.start(controllerKeys());
    }

    function stopJoin() {
        if (!joinManager) return;
        joinManager.stop();
        if (columns) for (const key of controllerKeys()) columns.light(key, LIGHTS_OFF);
    }

    function setView(v) {
        view = v;
        render();
    }

    // onGo may throw, return false, or return a promise that rejects or
    // resolves false: any of those releases the latch so Go works again.
    function go() {
        if (view !== 'confirm') return false; // Setup has no Go (Choose a song first)
        if (disposed || launched || !model().goEnabled) return false;
        launched = true;
        const attempt = ++goAttempt;
        stopLight('drums');
        if (goError) { goError = ''; render(); }
        const failed = (err) => {
            if (disposed || attempt !== goAttempt || !launched) return;
            if (err !== undefined) console.warn('[build-a-band] Go failed', err);
            launched = false;
            goError = GO_FAILED;
            render();
            startLight('drums');
        };
        let result;
        try {
            result = onGo(song, prefs);
        } catch (e) {
            failed(e);
            return true;
        }
        if (result === false) failed();
        else if (result && typeof result.then === 'function') {
            result.then((ok) => { if (ok === false) failed(); }, (e) => failed(e));
        }
        return true;
    }

    function setSong(item) {
        if (disposed) return;
        picked = true;
        song = item || null;
        if (song && song.filename) {
            const ref = songRef(song);
            prefs = savePrefs({ lastSong: ref, recentSongs: pushRecent(prefs.recentSongs, ref) });
        } else {
            prefs = savePrefs({ lastSong: null });
        }
        render();
    }

    // Part controls (the Setup column and the Confirm row): on/off toggle and
    // every segment write through savePrefs.
    for (const part of PART_TYPES) {
        for (const el of $$(`[data-part="${part.id}"]`)) {
            el.style.setProperty('--bab-c', part.color);
            const name = $('.bab-part-name', el);
            if (name) name.textContent = part.label;
            const ico = $('.bab-ico', el);
            if (ico) ico.innerHTML = icon(part.icon, { size: 30 });
            const toggle = $('.bab-toggle', el);
            if (toggle) {
                listen(toggle, 'click', () => {
                    save({ parts: { [part.id]: { on: !prefs.parts[part.id].on } } });
                    startLight(part.id);
                });
            }
            for (const seg of $$('.bab-seg[data-field]', el)) {
                const field = seg.getAttribute('data-field');
                for (const b of $$('button[data-value]', seg)) {
                    listen(b, 'click', () => {
                        save({ parts: { [part.id]: { [field]: fromDom(field, b.getAttribute('data-value')) } } });
                    });
                }
            }
        }
    }
    for (const b of $$('button[data-value]', $('.bab-seg[data-field="failMode"]'))) {
        listen(b, 'click', () => save({ failMode: b.getAttribute('data-value') }));
    }
    const fsBox = $('input.bab-fullscreen');
    listen(fsBox, 'change', () => save({ fullScreenStage: !!fsBox.checked }));
    listen($('.bab-go'), 'click', () => { go(); });
    listen($('.bab-choose'), 'click', () => openLibrary());
    listen($('.bab-change'), 'click', () => openLibrary());
    listen($('.bab-continue'), 'click', () => { if (song) setView('confirm'); });
    listen($('.bab-setup-btn'), 'click', () => setView('setup'));
    const artImg = $('.bab-art-img');
    if (artImg) listen(artImg, 'error', () => { artImg.hidden = true; });

    // Choose a song / Change song: the Song Library in pick mode. A picked
    // song goes to Confirm; Back or leaving keeps the view as it was.
    // -> true when core's pick was asked.
    function openLibrary() {
        if (!pickAvailable || disposed) return false;
        const vocalsSupported = !!karaokeApi(win);
        const m = model();
        if (!m.pickEnabled) return false;
        const gen = ++pickGen;
        // "Playable by band" leaves vocals out when Lyrics Karaoke isn't loaded.
        const parts = vocalsSupported ? prefs.parts
            : { ...prefs.parts, vocals: { ...prefs.parts.vocals, on: false } };
        const live = () => gen === pickGen && !disposed;
        const failed = (err) => console.warn('[build-a-band] library pick failed', err);
        let pending;
        try {
            pending = library.pick({
                title: PICK_TITLE,
                // The model's controller rows: they know which controllers are connected.
                filters: pickFilters({ parts, on: prefs.pickFilters, controllers: m.controllers, showAuto: showAuto() }),
                // The whole current row: core hands it back as the item when it is re-used.
                selected: song || null,
                returnTo: SCREEN_ID,
                confirmLabel: PICK_CONFIRM,
                backLabel: PICK_BACK,
            });
        } catch (err) {
            failed(err);
            return false;
        }
        Promise.resolve(pending).then((result) => {
            if (!live()) return;
            const r = result || {};
            if (r.filters && typeof r.filters === 'object') save({ pickFilters: r.filters });
            if (!r.item) return;
            // The current song picked again: keep the full row we already have.
            if (song && r.item.filename === song.filename) { setView('confirm'); return; }
            setSong(r.item);
            setView('confirm');
            // The grid row may be grouped: re-fetch the flat row for chips and
            // greying. The search matches titles, so a title-less item keeps its row.
            if (song.title) {
                resolveRecent({ filename: song.filename, title: song.title }, getJson).then((it) => {
                    if (!live() || !it || !song || it.filename !== song.filename) return;
                    song = it;
                    lastResolved = true;
                    render();
                });
            }
        }).catch(failed);
        return true;
    }

    // Next song (from the results): Confirm is where Back from the library
    // lands; the pick opens now, or on the next show while core switches screens.
    function nextSong() {
        if (disposed) return;
        setView('confirm');
        if (shown()) openLibrary();
        else pendingPick = true;
    }

    // ── Input devices and signal lights ─────────────────────────────────
    const micStorage = storage || defaultStorage(win);
    const lists = { guitar: [], drums: [], vocals: [] };
    let guitarVia = 'browser';
    const lights = {}; // part id -> { stop() }
    const io = {}; // part id -> { select, find, sig, light, text }
    let showGen = 0; // bumped on every show/hide/dispose: drops stale async work
    let flashTimer = null;
    const shown = () => !disposed && visible && isActive();
    const hasKey = (i) => i && i.key;

    function setSignal(id, state) {
        const p = io[id];
        if (!p) return;
        p.text.textContent = STATE_LABEL[state] || SIGNAL_LABEL[id];
        p.sig.classList.toggle('bab-warn', !!STATE_LABEL[state]);
        if (state !== 'live') {
            p.sig.classList.remove('bab-lit');
            p.light.style.setProperty('--bab-level', '0');
        }
    }

    function stopLight(id) {
        const l = lights[id];
        delete lights[id];
        if (l) { try { l.stop(); } catch (_) { /* ignore */ } }
        if (id === 'drums') {
            if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
            if (io.drums) io.drums.sig.classList.remove('bab-hit');
        }
        if (id === 'vocals') stopMicHit();
        setSignal(id, null);
    }

    function stopMicHit() {
        micDetector = null;
        if (micFlashTimer !== null) { clearTimeout(micFlashTimer); micFlashTimer = null; }
        if (!mic) return;
        mic.light.classList.remove('bab-hit');
        mic.level.style.setProperty('width', '0%');
    }

    // One vocals reading: the live level bar, then the shared detector. The
    // level only ever comes from the silent analyser; nothing is played.
    function micReading(level, t) {
        if (!mic) return;
        const db = 20 * Math.log10(Math.max(level, 1e-5));
        mic.level.style.setProperty('width', meterPct(db));
        if (!micDetector) return;
        const at = Number.isFinite(t) ? t : Date.now() / 1000;
        let hit;
        // karaoke's detector is another plugin's code: one that throws is dropped,
        // and the level bar keeps running.
        try { hit = micDetector.push(db, at); } catch (_) { micDetector = null; return; }
        if (!hit) return;
        mic.light.classList.add('bab-hit');
        if (micFlashTimer !== null) clearTimeout(micFlashTimer);
        micFlashTimer = setTimeout(() => { micFlashTimer = null; mic.light.classList.remove('bab-hit'); }, MIC_HIT_FLASH_MS);
    }

    function stopLights() {
        for (const id of Object.keys(io)) stopLight(id);
    }

    function padHit() {
        if (!shown()) { stopLights(); return; }
        const sig = io.drums.sig;
        sig.classList.add('bab-hit');
        if (flashTimer !== null) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flashTimer = null; sig.classList.remove('bab-hit'); }, PAD_FLASH_MS);
        // Any drum pad also starts the song.
        go();
    }

    function startPadLight(key) {
        const midi = fb && fb.midiInput;
        if (!midi || typeof midi.open !== 'function') return;
        let opened = null;
        let cancelled = false;
        lights.drums = { stop() { cancelled = true; if (opened) opened.close(); } };
        openPadLight({ midiInput: midi, key, onHit: padHit }).then((l) => {
            opened = l;
            if (cancelled) l.close();
        }, () => {});
    }

    function startMeter(id, key) {
        const via = id === 'guitar' ? guitarVia : 'browser';
        const md = win && win.navigator && win.navigator.mediaDevices;
        const AC = win && (win.AudioContext || win.webkitAudioContext);
        const raf = win && win.requestAnimationFrame;
        if (via !== 'session' && (!md || !AC || typeof raf !== 'function')) { setSignal(id, 'check-in-game'); return; }
        const p = io[id];
        if (id === 'vocals') {
            const mh = micHitApi();
            micDetector = mh ? mh.createDetector({ thresholdDb: prefs.parts.vocals.micHitDb }) : null;
        }
        lights[id] = createLevelMeter({
            deviceId: key, via, mediaDevices: md, AudioContext: AC,
            frameSize: id === 'vocals' ? MIC_FRAME : undefined,
            onLevel: (v, t) => {
                if (!shown()) { stopLights(); return; }
                if (id === 'vocals') micReading(v, t);
                p.light.style.setProperty('--bab-level', Math.min(1, v * 5).toFixed(3));
                p.sig.classList.toggle('bab-lit', v > LIT_LEVEL);
            },
            onState: (state) => setSignal(id, state),
            schedule: (fn) => win.requestAnimationFrame(fn),
            cancel: (h) => win.cancelAnimationFrame(h),
        });
    }

    // Stops the part's light, then starts it again if it should run.
    function startLight(id) {
        if (!io[id]) return;
        stopLight(id);
        if (!shown()) return;
        const pp = prefs.parts[id];
        const key = pp && pp[DEVICE_FIELD[id]];
        if (!pp || !pp.on || !key) return;
        if (id === 'drums' && launched) return; // Go fired: pads must not start it again
        if (id === 'drums') startPadLight(key);
        else startMeter(id, key);
    }

    function renderDevices(id) {
        const p = io[id];
        if (!p) return;
        const current = prefs.parts[id][DEVICE_FIELD[id]] || '';
        const items = lists[id];
        const opts = [{ key: '', label: DEVICE_PLACEHOLDER[id] }, ...items];
        if (current && !items.some((i) => i.key === current)) opts.push({ key: current, label: 'Saved device (not found)' });
        p.select.replaceChildren(...opts.map((o) => {
            const el = doc.createElement('option');
            el.value = o.key;
            el.textContent = o.label;
            return el;
        }));
        p.select.value = current;
        if (p.find) p.find.hidden = items.length > 0;
        renderDeviceLine(id);
    }

    // Confirm's "Input: USB Guitar" line, from the same list as the Setup select.
    function renderDeviceLine(id) {
        const row = $(`.bab-part[data-part="${id}"]`);
        const line = row && $('.bab-part-device', row);
        if (!line || !(id in DEVICE_FIELD)) return;
        const key = prefs.parts[id][DEVICE_FIELD[id]] || '';
        const hit = key && (lists[id] || []).find((i) => i.key === key);
        const label = !key ? NO_DEVICE : (hit ? hit.label : DEVICE_NOT_FOUND);
        line.textContent = `${INPUT_LABEL[id]}: ${label}`;
    }

    async function loadDevices(gen) {
        let guitar = { via: 'browser', items: [] };
        let mics = [];
        try { [guitar, mics] = await Promise.all([listGuitarInputs(win), listMicInputs(win)]); } catch (_) { /* empty lists */ }
        if (gen !== showGen || !shown()) return;
        guitarVia = guitar.via;
        // Only blank ids: the browser hides devices until mic permission.
        const needsAccess = (items) => items.length > 0 && !items.some(hasKey);
        inputNote.guitar = guitar.via === 'browser' && needsAccess(guitar.items) ? NEEDS_MIC_ACCESS : '';
        inputNote.vocals = needsAccess(mics) ? NEEDS_MIC_ACCESS : '';
        render();
        lists.guitar = guitar.items.filter(hasKey);
        lists.vocals = mics.filter(hasKey);
        lists.drums = listDrumInputs(win).filter(hasKey);
        for (const id of Object.keys(io)) renderDevices(id);
        for (const id of Object.keys(io)) startLight(id);
    }

    function show() {
        visible = true;
        launched = false;
        goAttempt++;
        if (goError) { goError = ''; render(); }
        showGen++;
        stopLights();
        // Next song: open the library first; the screen is leaving, so no
        // device list loads and no mic opens on the way through. A late
        // screen:changed after the user moved on (an overlapping showScreen)
        // finds the band screen inactive and drops the pick.
        if (pendingPick) {
            pendingPick = false;
            if (isActive() && openLibrary()) return;
        }
        if (shown()) {
            loadDevices(showGen);
            startJoin();
        }
    }

    function hide() {
        visible = false;
        // A Next song pick is only for the very next show, so leaving drops it. But
        // Next song's own screen switch emits events for other screens while the
        // band screen is already (or still) active: only a hide that finds the band
        // screen inactive means the user really went elsewhere.
        if (!isActive()) pendingPick = false;
        showGen++;
        stopLights();
        stopJoin();
    }

    function pickDevice(id, value) {
        if (disposed) return;
        save({ parts: { [id]: { [DEVICE_FIELD[id]]: value } } });
        stopLight(id); // the old device stops before the new one starts
        try {
            if (id === 'guitar') applyGuitarDevice(value, win, deviceMemo).catch(() => {});
            else if (id === 'drums') applyDrumDevice(value, win, deviceMemo);
            else applyMicDevice(value, micStorage);
        } catch (_) { /* a plugin that is not loaded */ }
        startLight(id);
    }

    for (const part of PART_TYPES) {
        if (!(part.id in DEVICE_FIELD)) continue;
        const col = $(`.bab-col[data-part="${part.id}"]`);
        const box = col && $('.bab-input', col);
        const sig = col && $('.bab-signal', col);
        if (!box || !sig) continue;
        const label = doc.createElement('span');
        label.className = 'bab-label';
        label.textContent = INPUT_LABEL[part.id];
        const select = doc.createElement('select');
        select.className = 'bab-device';
        select.setAttribute('aria-label', `${part.label} ${INPUT_LABEL[part.id].toLowerCase()}`);
        box.replaceChildren(label, select);
        let find = null;
        if (part.id === 'drums') {
            find = doc.createElement('button');
            find.type = 'button';
            find.className = 'bab-findkit';
            find.textContent = 'Find my kit';
            box.appendChild(find);
            listen(find, 'click', () => {
                const gen = showGen;
                findKit(win).then((items) => {
                    if (gen !== showGen || !shown()) return;
                    lists.drums = items.filter(hasKey);
                    renderDevices('drums');
                    startLight('drums');
                }, () => {});
            });
        }
        const light = doc.createElement('span');
        light.className = 'bab-light';
        const text = doc.createElement('span');
        text.className = 'bab-signal-label';
        sig.replaceChildren(light, text);
        io[part.id] = { select, find, sig, light, text };
        setSignal(part.id, null);
        renderDevices(part.id);
        listen(select, 'change', () => pickDevice(part.id, select.value));
    }

    // Mic-hit sensitivity: the slider saves and retunes the live detector.
    const micBlock = $('.bab-michit');
    if (micBlock) {
        const meter = $('.bab-michit-meter', micBlock);
        mic = {
            block: micBlock, slider: $('.bab-michit-db', micBlock), level: $('i', meter),
            tick: $('b', meter), light: $('.bab-michit-light', micBlock), text: $('.bab-michit-text', micBlock),
        };
        listen(mic.slider, 'change', () => {
            const v = Number(mic.slider.value);
            if (!Number.isFinite(v)) { render(); return; }
            save({ parts: { vocals: { micHitDb: v } } });
            if (micDetector) micDetector.setThreshold(prefs.parts.vocals.micHitDb);
        });
    }

    // On Confirm, Space starts the song and Esc goes back to the library pick.
    // Capture phase so preventDefault reaches core's gamepad-nav (it skips handled keys).
    listen(doc, 'keydown', (e) => {
        if (!visible || !isActive() || view !== 'confirm') return;
        if (e.key === 'Escape') {
            if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(doc.activeElement)) return;
            openLibrary();
            if (e.preventDefault) e.preventDefault();
            return;
        }
        if (!isGoKey(e, doc.activeElement)) return;
        if (go() && e.preventDefault) e.preventDefault();
    }, true); // capture: before core gamepad-nav's document listener, which would send B home

    // Core flips .active right after screen:changing but sends screen:changed
    // only after some awaits, so leaving hides the screen on :changing.
    const onChanging = (e) => {
        const d = (e && e.detail) || {};
        if (d.id !== SCREEN_ID) hide();
    };
    const onChanged = (e) => {
        const d = (e && e.detail) || {};
        if (d.id === SCREEN_ID) show(); else hide();
    };
    if (fb && typeof fb.on === 'function') {
        fb.on('screen:changing', onChanging);
        fb.on('screen:changed', onChanged);
        cleanups.push(() => {
            if (typeof fb.off !== 'function') return;
            fb.off('screen:changing', onChanging);
            fb.off('screen:changed', onChanged);
        });
    }

    columns = createControllerColumns({
        doc, setupHost: $('.bab-ctlcols'), confirmHost: $('.bab-ctlparts'),
        onChange: (key, patch) => save({ controllers: updateController(prefs.controllers, key, patch) }),
        onLeave: (key) => {
            save({ controllers: leaveController(prefs.controllers, key) });
            if (joinManager) joinManager.setJoined(controllerKeys());
        },
        onControls: (key) => openControllerSetup(key),
    });

    render();
    if (visible) show();

    // Reopen on the last song, unless the user picks one first.
    if (prefs.lastSong) {
        resolveRecent(prefs.lastSong, getJson).then((item) => {
            if (!disposed && item && !picked) { song = item; lastResolved = true; render(); }
        });
    }

    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            showGen++;
            stopLights();
            stopJoin();
            columns.destroy();
            for (const fn of cleanups.splice(0)) {
                try { fn(); } catch (_) { /* ignore */ }
            }
        },
        setSong,
        getSong: () => song,
        isVisible: () => visible,
        view: () => view,
        openLibrary,
        nextSong,
    };
}
