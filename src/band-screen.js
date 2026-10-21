// Band screen: binds the static skeleton in screen.html to band prefs and the
// picked song. Thin DOM layer; the rules live in band-model.js.
import { PART_TYPES } from './parts.js';
import { pushRecent } from './prefs.js';
import { songChips, resolveRecent } from './query.js';
import { bandScreenModel, isGoKey } from './band-model.js';
import { mountSongPicker } from './song-picker.js';

const SCREEN_ID = 'plugin-build_a_band';
const SOUND_MODES_NEEDING_STEM = ['rockband', 'kit'];

// Segment values are strings in the DOM; hearMyself is stored as a boolean.
const fromDom = (field, v) => (field === 'hearMyself' ? v === 'on' : v);
const toDom = (field, v) => (field === 'hearMyself' ? (v ? 'on' : 'off') : String(v));

function songRef(item) {
    return { filename: item.filename, title: item.title || '', artist: item.artist || '' };
}

// createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo, fetchJson? })
//   -> { dispose(), setSong(item | null), getSong(), isVisible() }
export function createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo, fetchJson }) {
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
    const screenEl = doc.getElementById(SCREEN_ID);
    let visible = !!(screenEl && screenEl.classList.contains('active'));

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

    // Space starts the song while the band screen is showing.
    listen(doc, 'keydown', (e) => {
        if (!visible || !isGoKey(e, doc.activeElement)) return;
        if (go() && e.preventDefault) e.preventDefault();
    });

    const onScreen = (e) => {
        const d = (e && e.detail) || {};
        visible = d.id === SCREEN_ID;
    };
    if (fb && typeof fb.on === 'function') {
        fb.on('screen:changed', onScreen);
        cleanups.push(() => { if (typeof fb.off === 'function') fb.off('screen:changed', onScreen); });
    }

    render();

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
            for (const fn of cleanups.splice(0)) {
                try { fn(); } catch (_) { /* ignore */ }
            }
        },
        setSong,
        getSong: () => song,
        isVisible: () => visible,
    };
}
