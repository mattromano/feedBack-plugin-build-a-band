// createBandScreen against the real screen.html skeleton in a fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBandScreen } from '../src/band-screen.js';
import { loadPrefs, savePrefs } from '../src/prefs.js';
import { makeDoc, makeEl, parseHtml, flush } from './fake-dom.mjs';

const HTML = readFileSync(new URL('../screen.html', import.meta.url), 'utf8');
const holiday = {
    filename: 'sloppak/greeholi.sloppak', title: 'Holiday', artist: 'Green Day',
    arrangements: [{ name: 'Lead', index: 0 }], has_drum_tab: true, has_vocal_pitch: false, stem_ids: [],
};

function memStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function setup({ active = true, stored = null, library = [] } = {}) {
    const doc = makeDoc();
    const screen = makeEl('div', doc);
    screen.setAttribute('id', 'plugin-build_a_band');
    screen.classList.add('screen');
    if (active) screen.classList.add('active');
    doc.body.appendChild(screen);
    parseHtml(HTML, doc, screen);
    const root = doc.getElementById('build-a-band-root');
    const storage = memStorage(stored ? { 'build_a_band.prefs.v1': JSON.stringify(stored) } : {});
    const bus = new EventTarget();
    const fb = {
        on: (t, f) => bus.addEventListener(t, f),
        off: (t, f) => bus.removeEventListener(t, f),
        emit: (t, detail) => bus.dispatchEvent(new CustomEvent(t, { detail })),
    };
    const urls = [];
    const gos = [];
    const bs = createBandScreen({
        root, doc, win: { feedBack: fb },
        loadPrefs: () => loadPrefs(storage), savePrefs: (p) => savePrefs(p, storage),
        onGo: (item, prefs) => gos.push({ item, prefs }),
        fetchJson: async (url) => { urls.push(url); return { songs: library }; },
    });
    const col = (id) => root.querySelector(`.bab-col[data-part="${id}"]`);
    const seg = (el, field) => el.querySelector(`.bab-seg[data-field="${field}"]`);
    const btn = (el, field, v) => seg(el, field).querySelector(`button[data-value="${v}"]`);
    return { doc, root, bs, fb, gos, urls, col, btn, prefs: () => loadPrefs(storage) };
}

test('skeleton: columns coloured from the registry, Go disabled until a song is picked', () => {
    const { root, col, bs } = setup();
    assert.equal(col('guitar').style.props['--bab-c'], '#f5c542');
    assert.equal(col('drums').style.props['--bab-c'], '#e0533d');
    assert.equal(col('vocals').style.props['--bab-c'], '#a678ff');
    for (const id of ['guitar', 'drums', 'vocals']) {
        assert.ok(col(id).querySelector('.bab-input'));
        assert.ok(col(id).querySelector('.bab-signal'));
        assert.equal(col(id).querySelector('.bab-toggle').getAttribute('aria-pressed'), 'true');
    }
    assert.ok(root.querySelector('.bab-picker'));
    assert.equal(root.querySelector('.bab-addslot').disabled, true);
    assert.equal(root.querySelector('.bab-go').disabled, true);
    assert.equal(root.querySelector('.bab-hint').textContent, 'Pick a song');
    assert.equal(bs.isVisible(), true);
    bs.dispose();
});

test('setSong stores lastSong + recentSongs, renders chips and greys what the song lacks', () => {
    const { root, col, btn, bs, prefs } = setup();
    bs.setSong(holiday);
    assert.equal(bs.getSong(), holiday);
    assert.equal(prefs().lastSong.filename, holiday.filename);
    assert.equal(prefs().recentSongs[0].title, 'Holiday');
    assert.equal(root.querySelector('.bab-title').textContent, 'Holiday');
    assert.equal(root.querySelectorAll('.bab-chip').length, 4);
    assert.ok(col('vocals').classList.contains('bab-unavailable'));
    assert.equal(col('vocals').querySelector('.bab-note').textContent, 'No vocal pitch for this song');
    assert.equal(btn(col('drums'), 'soundMode', 'rockband').disabled, true);
    assert.equal(btn(col('drums'), 'soundMode', 'kit').disabled, true);
    assert.equal(btn(col('drums'), 'soundMode', 'song').disabled, false);
    assert.equal(root.querySelector('.bab-go').disabled, false);
    assert.equal(root.querySelector('.bab-hint').textContent, 'Press Space or hit any pad to start');
    bs.dispose();
});

test('every control writes through savePrefs immediately', () => {
    const { root, col, btn, bs, prefs } = setup();
    btn(col('guitar'), 'arrangement', 'Bass').click();
    btn(col('guitar'), 'difficulty', 'expert').click();
    btn(col('drums'), 'soundMode', 'kit').click();
    btn(col('vocals'), 'hearMyself', 'on').click();
    col('vocals').querySelector('.bab-toggle').click();
    btn(root, 'failMode', 'fail').click();
    const fs = root.querySelector('input.bab-fullscreen');
    fs.checked = false;
    fs.fire('change');
    const p = prefs();
    assert.equal(p.parts.guitar.arrangement, 'Bass');
    assert.equal(p.parts.guitar.difficulty, 'expert');
    assert.equal(p.parts.drums.soundMode, 'kit');
    assert.equal(p.parts.vocals.hearMyself, true);
    assert.equal(p.parts.vocals.on, false);
    assert.equal(p.failMode, 'fail');
    assert.equal(p.fullScreenStage, false);
    assert.equal(btn(col('guitar'), 'difficulty', 'expert').getAttribute('aria-pressed'), 'true');
    assert.ok(col('vocals').classList.contains('bab-off'));
    assert.equal(col('vocals').querySelector('.bab-toggle').getAttribute('aria-pressed'), 'false');
    bs.dispose();
});

test('Go button and Space call onGo only while visible and a part can play', () => {
    const { doc, root, fb, bs, gos } = setup();
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 0, 'no song yet');
    bs.setSong(holiday);
    root.querySelector('.bab-go').click();
    assert.equal(gos.length, 1);
    assert.equal(gos[0].item, holiday);
    const ev = doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 2);
    assert.equal(ev.defaultPrevented, true);
    doc.activeElement = { tagName: 'INPUT' };
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 2, 'typing in the search box');
    doc.activeElement = null;
    fb.emit('screen:changed', { id: 'player', from: 'plugin-build_a_band' });
    assert.equal(bs.isVisible(), false);
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 2, 'hidden');
    fb.emit('screen:changed', { id: 'plugin-build_a_band', from: 'player' });
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 3);
    bs.dispose();
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 3, 'disposed');
    assert.equal(doc.listenerCount(), 0);
});

test('reopens on the last song through resolveRecent', async () => {
    const stored = { lastSong: { filename: holiday.filename, title: 'Holiday', artist: 'Green Day' } };
    const { root, bs, urls } = setup({ active: false, stored, library: [holiday] });
    assert.equal(bs.isVisible(), false);
    await flush();
    assert.deepEqual(urls, ['/api/library?q=Holiday&size=30']);
    assert.equal(bs.getSong(), holiday);
    assert.equal(root.querySelector('.bab-title').textContent, 'Holiday');
    bs.dispose();
});

test('song picker is mounted in .bab-picker: picking sets the song, part toggles refresh it', async () => {
    const { root, col, bs, urls } = setup({ library: [holiday] });
    const picker = root.querySelector('.bab-picker');
    const search = picker.querySelector('input.bab-search');
    assert.ok(search, 'picker mounted');
    search.value = 'holiday';
    search.fire('input');
    await new Promise((r) => setTimeout(r, 300)); // real 250 ms debounce
    await flush();
    assert.deepEqual(urls, ['/api/library?q=holiday&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1&has_lyrics=pitch']);
    picker.querySelector('li.bab-row').click();
    assert.equal(bs.getSong(), holiday);
    col('vocals').querySelector('.bab-toggle').click();
    await new Promise((r) => setTimeout(r, 300));
    await flush();
    assert.equal(urls[1], '/api/library?q=holiday&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1');
    bs.dispose();
    assert.equal(picker.children.length, 0, 'picker disposed with the screen');
});
