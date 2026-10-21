// Band screen: binds the static skeleton in screen.html to band prefs and the
// picked song. Thin DOM layer; the rules live in band-model.js.
import { PART_TYPES } from './parts.js';
import { pushRecent } from './prefs.js';
import { songChips, resolveRecent } from './query.js';
import { bandScreenModel, isGoKey } from './band-model.js';
import { mountSongPicker } from './song-picker.js';
import {
    listGuitarInputs, listDrumInputs, listMicInputs, findKit,
    applyGuitarDevice, applyDrumDevice, applyMicDevice,
} from './devices.js';
import { createLevelMeter } from './level-meter.js';
import { openPadLight } from './pad-light.js';

const SCREEN_ID = 'plugin-build_a_band';
const SOUND_MODES_NEEDING_STEM = ['rockband', 'kit'];

// Input devices and signal lights, per part. Lights are silent: meters read
// an unconnected AnalyserNode, the pad light only listens to MIDI.
const DEVICE_FIELD = { guitar: 'deviceKey', drums: 'deviceKey', vocals: 'deviceId' };
const INPUT_LABEL = { guitar: 'Input', drums: 'Kit', vocals: 'Mic' };
const DEVICE_PLACEHOLDER = { guitar: 'Choose an input', drums: 'Choose your kit', vocals: 'Choose a mic' };
const SIGNAL_LABEL = { guitar: 'Signal', drums: 'Hit a pad', vocals: 'Level' };
const STATE_LABEL = { 'no-access': 'no access', 'check-in-game': 'check in game' };
const PAD_FLASH_MS = 120;
const LIT_LEVEL = 0.02;

function defaultStorage(win) {
    try { return win && win.localStorage; } catch (_) { return undefined; }
}

// Segment values are strings in the DOM; hearMyself is stored as a boolean.
const fromDom = (field, v) => (field === 'hearMyself' ? v === 'on' : v);
const toDom = (field, v) => (field === 'hearMyself' ? (v ? 'on' : 'off') : String(v));

function songRef(item) {
    return { filename: item.filename, title: item.title || '', artist: item.artist || '' };
}

// createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo, fetchJson?, storage? })
//   -> { dispose(), setSong(item | null), getSong(), isVisible() }
// storage (default win.localStorage) receives karaoke's mic pick.
export function createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo, fetchJson, storage }) {
    const fb = win && win.feedBack;
    const getJson = fetchJson || ((url) => win.fetch(url).then((r) => r.json()));
    const $ = (sel, el = root) => el.querySelector(sel);
    const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
    const cleanups = [];
    const listen = (target, type, fn) => {
        target.addEventListener(type, fn);
        cleanups.push(() => target.removeEventListener(type, fn));
    };

    let prefs = loadPrefs();
    let song = null;
    let picked = false; // setSong was called: the lastSong restore must not override it
    let disposed = false;
    const isActive = () => {
        const el = doc.getElementById(SCREEN_ID);
        return !!(el && el.classList.contains('active'));
    };
    let visible = isActive();

    function save(patch) {
        prefs = savePrefs(patch);
        render();
    }

    function renderSong() {
        $('.bab-title').textContent = song ? (song.title || song.filename) : 'Pick a song';
        $('.bab-artist').textContent = song ? (song.artist || '') : '';
        const chips = $('.bab-chips');
        chips.replaceChildren();
        if (!song) return;
        for (const c of songChips(song)) {
            const span = doc.createElement('span');
            span.className = c.good ? 'bab-chip bab-good' : 'bab-chip';
            span.textContent = c.label;
            chips.appendChild(span);
        }
    }

    function renderSeg(seg, value, disabledValues = []) {
        for (const b of $$('button[data-value]', seg)) {
            b.setAttribute('aria-pressed', b.getAttribute('data-value') === value ? 'true' : 'false');
            b.disabled = disabledValues.includes(b.getAttribute('data-value'));
        }
    }

    function render() {
        if (disposed) return;
        const model = bandScreenModel({ prefs, item: song });
        renderSong();
        for (const part of PART_TYPES) {
            const col = $(`.bab-col[data-part="${part.id}"]`);
            if (!col) continue;
            const c = model.columns[part.id];
            const pp = prefs.parts[part.id];
            col.classList.toggle('bab-off', !c.on);
            col.classList.toggle('bab-unavailable', c.unavailable);
            $('.bab-toggle', col).setAttribute('aria-pressed', c.on ? 'true' : 'false');
            for (const seg of $$('.bab-seg[data-field]', col)) {
                const field = seg.getAttribute('data-field');
                const off = field === 'soundMode' && c.soundModesDisabled ? SOUND_MODES_NEEDING_STEM : [];
                renderSeg(seg, toDom(field, pp[field]), off);
            }
            $('.bab-note', col).textContent = c.note;
        }
        renderSeg($('.bab-seg[data-field="failMode"]'), prefs.failMode);
        $('input.bab-fullscreen').checked = !!prefs.fullScreenStage;
        $('.bab-hint').textContent = model.goHint;
        $('.bab-go').disabled = !model.goEnabled;
    }

    function go() {
        if (disposed || !bandScreenModel({ prefs, item: song }).goEnabled) return false;
        onGo(song, prefs);
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
        // Keep the recent list current when it is what the picker shows.
        const box = $('input.bab-search');
        if (box && !String(box.value || '').trim()) picker.refresh();
    }

    const picker = mountSongPicker({
        host: $('.bab-picker'), doc, fetchJson: getJson,
        getParts: () => prefs.parts,
        getRecent: () => prefs.recentSongs,
        onPick: setSong,
    });
    cleanups.push(() => picker.dispose());

    // Column controls: on/off toggle and every segment write through savePrefs.
    for (const part of PART_TYPES) {
        const col = $(`.bab-col[data-part="${part.id}"]`);
        if (!col) continue;
        col.style.setProperty('--bab-c', part.color);
        const name = $('.bab-part-name', col);
        if (name) name.textContent = part.label;
        listen($('.bab-toggle', col), 'click', () => {
            save({ parts: { [part.id]: { on: !prefs.parts[part.id].on } } });
            // "Playable by this band" follows the parts switched on.
            picker.refresh();
            startLight(part.id);
        });
        for (const seg of $$('.bab-seg[data-field]', col)) {
            const field = seg.getAttribute('data-field');
            for (const b of $$('button[data-value]', seg)) {
                listen(b, 'click', () => {
                    save({ parts: { [part.id]: { [field]: fromDom(field, b.getAttribute('data-value')) } } });
                });
            }
        }
    }
    for (const b of $$('button[data-value]', $('.bab-seg[data-field="failMode"]'))) {
        listen(b, 'click', () => save({ failMode: b.getAttribute('data-value') }));
    }
    const fsBox = $('input.bab-fullscreen');
    listen(fsBox, 'change', () => save({ fullScreenStage: !!fsBox.checked }));
    listen($('.bab-go'), 'click', () => { go(); });

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
        p.sig.classList.toggle('bab-live', state === 'live');
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
        setSignal(id, null);
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
        lights[id] = createLevelMeter({
            deviceId: key, via, mediaDevices: md, AudioContext: AC,
            onLevel: (v) => {
                if (!shown()) { stopLights(); return; }
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
    }

    async function loadDevices(gen) {
        let guitar = { via: 'browser', items: [] };
        let mics = [];
        try { [guitar, mics] = await Promise.all([listGuitarInputs(win), listMicInputs(win)]); } catch (_) { /* empty lists */ }
        if (gen !== showGen || !shown()) return;
        guitarVia = guitar.via;
        lists.guitar = guitar.items.filter(hasKey);
        lists.vocals = mics.filter(hasKey);
        lists.drums = listDrumInputs(win).filter(hasKey);
        for (const id of Object.keys(io)) renderDevices(id);
        for (const id of Object.keys(io)) startLight(id);
    }

    function show() {
        visible = true;
        showGen++;
        stopLights();
        if (shown()) loadDevices(showGen);
    }

    function hide() {
        visible = false;
        showGen++;
        stopLights();
    }

    function pickDevice(id, value) {
        if (disposed) return;
        save({ parts: { [id]: { [DEVICE_FIELD[id]]: value } } });
        stopLight(id); // the old device stops before the new one starts
        try {
            if (id === 'guitar') applyGuitarDevice(value, win).catch(() => {});
            else if (id === 'drums') applyDrumDevice(value, win);
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

    // Space starts the song while the band screen is showing.
    listen(doc, 'keydown', (e) => {
        if (!visible || !isActive() || !isGoKey(e, doc.activeElement)) return;
        if (go() && e.preventDefault) e.preventDefault();
    });

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

    render();
    if (visible) show();

    // Reopen on the last song, unless the user picks one first.
    if (prefs.lastSong) {
        resolveRecent(prefs.lastSong, getJson).then((item) => {
            if (!disposed && item && !picked) { song = item; render(); }
        });
    }

    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            showGen++;
            stopLights();
            for (const fn of cleanups.splice(0)) {
                try { fn(); } catch (_) { /* ignore */ }
            }
        },
        setSong,
        getSong: () => song,
        isVisible: () => visible,
    };
}
