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

function setup({ active = true, stored = null, library = [], winExtra = {} } = {}) {
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
        root, doc, win: { ...winExtra, feedBack: { ...fb, ...(winExtra.feedBack || {}) } }, storage,
        loadPrefs: () => loadPrefs(storage), savePrefs: (p) => savePrefs(p, storage),
        onGo: (item, prefs) => gos.push({ item, prefs }),
        fetchJson: async (url) => { urls.push(url); return { songs: library }; },
    });
    const col = (id) => root.querySelector(`.bab-col[data-part="${id}"]`);
    const seg = (el, field) => el.querySelector(`.bab-seg[data-field="${field}"]`);
    const btn = (el, field, v) => seg(el, field).querySelector(`button[data-value="${v}"]`);
    return { doc, root, bs, fb, gos, urls, col, btn, storage, prefs: () => loadPrefs(storage) };
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

test('screen:changing away hides the screen before screen:changed arrives', () => {
    const { doc, fb, bs, gos } = setup();
    bs.setSong(holiday);
    fb.emit('screen:changing', { id: 'player', from: 'plugin-build_a_band' });
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 0);
    assert.equal(bs.isVisible(), false);
    bs.dispose();
});

test('Space does nothing when the plugin screen is not .active', () => {
    const { doc, bs, gos } = setup();
    bs.setSong(holiday);
    doc.getElementById('plugin-build_a_band').classList.remove('active');
    doc.fire('keydown', { code: 'Space' });
    assert.equal(gos.length, 0);
    bs.dispose();
});

test('picking while the search box is empty refreshes the recent list', () => {
    const { root, bs } = setup();
    bs.setSong(holiday);
    const rows = root.querySelector('.bab-picker').querySelectorAll('li.bab-row');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.bab-row-title').textContent, 'Holiday');
    bs.dispose();
});

// ── Input devices and signal lights (Task 10) ─────────────────────────────

function fakeAudio() {
    const connects = [];
    const contexts = [];
    class FakeAudioContext {
        constructor() { this.destination = { kind: 'destination' }; this.closed = 0; this.analysers = []; contexts.push(this); }
        createAnalyser() {
            const a = { kind: 'analyser', fftSize: 2048, connectCalls: 0, connect: (t) => { a.connectCalls++; connects.push({ from: a, to: t }); }, getFloatTimeDomainData(b) { b.fill(0.2); } };
            this.analysers.push(a);
            return a;
        }
        createMediaStreamSource() { const s = { kind: 'source', connect: (t) => { connects.push({ from: s, to: t }); } }; return s; }
        close() { this.closed++; return Promise.resolve(); }
    }
    return { FakeAudioContext, connects, contexts };
}

function deviceWin({ midiSources = [{ logicalSourceKey: 'webmidi:kit', label: 'Kit' }], gumError = null, afterDiscover = null } = {}) {
    const audio = fakeAudio();
    const frames = new Map();
    let nextFrame = 1;
    const calls = { gum: [], enumerate: 0, noteDetect: [], drums: [], midiSelect: [], open: [], close: [], discover: 0 };
    const streams = [];
    const listeners = new Set();
    const handle = { addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f) };
    let midi = midiSources;
    const winExtra = {
        AudioContext: audio.FakeAudioContext,
        requestAnimationFrame: (fn) => { const id = nextFrame++; frames.set(id, fn); return id; },
        cancelAnimationFrame: (id) => { frames.delete(id); },
        navigator: {
            mediaDevices: {
                enumerateDevices: async () => {
                    calls.enumerate++;
                    return [
                        { kind: 'audioinput', deviceId: 'usb-guitar', label: 'USB Guitar' },
                        { kind: 'audioinput', deviceId: 'usb-mic', label: 'USB Mic' },
                        { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
                    ];
                },
                getUserMedia: async (c) => {
                    calls.gum.push(c.audio.deviceId.exact);
                    if (gumError) throw Object.assign(new Error('x'), { name: gumError });
                    const tracks = [{ stopped: 0, stop() { this.stopped++; } }];
                    const st = { id: c.audio.deviceId.exact, tracks, getTracks: () => tracks };
                    streams.push(st);
                    return st;
                },
            },
        },
        noteDetect: { setDevice: (id) => calls.noteDetect.push(id) },
        feedBackDrums: { setMidiInput: (k) => calls.drums.push(k) },
        feedBack: {
            midiInput: {
                listSources: () => midi,
                discover: async () => { calls.discover++; if (afterDiscover) midi = afterDiscover; },
                select: (k) => calls.midiSelect.push(k),
                open: async (o) => { calls.open.push(o); return { outcome: 'handled', handle }; },
                close: (o) => calls.close.push(o),
            },
        },
    };
    const runFrames = () => { const fns = [...frames.values()]; frames.clear(); fns.forEach((f) => f()); };
    const hit = (data) => { for (const f of [...listeners]) f(data, 0); };
    return { winExtra, audio, calls, streams, listeners, frames, runFrames, hit };
}

const withDevices = { parts: { guitar: { deviceKey: 'usb-guitar' }, drums: { deviceKey: 'webmidi:kit' }, vocals: { deviceId: 'usb-mic' } } };
const liveStreams = (d) => d.streams.filter((s) => s.tracks.every((t) => t.stopped === 0));

test('device lists load when the screen is visible, with a select per column', async () => {
    const d = deviceWin();
    const { col, bs } = setup({ winExtra: d.winExtra });
    await flush();
    const opts = (id) => col(id).querySelector('.bab-input').querySelector('select').querySelectorAll('option').map((o) => [o.value, o.textContent]);
    assert.deepEqual(opts('guitar').slice(1), [['usb-guitar', 'USB Guitar'], ['usb-mic', 'USB Mic']]);
    assert.deepEqual(opts('vocals').slice(1), [['usb-guitar', 'USB Guitar'], ['usb-mic', 'USB Mic']]);
    assert.deepEqual(opts('drums').slice(1), [['webmidi:kit', 'Kit']]);
    assert.equal(col('guitar').querySelector('.bab-signal').textContent, 'Signal');
    assert.equal(col('drums').querySelector('.bab-signal').textContent, 'Hit a pad');
    assert.equal(col('vocals').querySelector('.bab-signal').textContent, 'Level');
    assert.equal(d.calls.gum.length, 0, 'no device picked yet: no mic opened');
    bs.dispose();
});

test('a hidden screen loads nothing and opens nothing', async () => {
    const d = deviceWin();
    const { bs } = setup({ active: false, stored: withDevices, winExtra: d.winExtra });
    await flush();
    assert.equal(d.calls.enumerate, 0);
    assert.equal(d.calls.gum.length, 0);
    assert.equal(d.calls.open.length, 0);
    bs.dispose();
});

test('picking a device saves it and applies it at once', async () => {
    const d = deviceWin();
    const { col, bs, prefs, storage } = setup({ winExtra: d.winExtra });
    await flush();
    const pick = (id, v) => { const s = col(id).querySelector('select'); s.value = v; s.fire('change'); };
    pick('guitar', 'usb-guitar');
    pick('drums', 'webmidi:kit');
    pick('vocals', 'usb-mic');
    await flush();
    assert.equal(prefs().parts.guitar.deviceKey, 'usb-guitar');
    assert.equal(prefs().parts.drums.deviceKey, 'webmidi:kit');
    assert.equal(prefs().parts.vocals.deviceId, 'usb-mic');
    assert.deepEqual(d.calls.noteDetect, ['usb-guitar']);
    assert.deepEqual(d.calls.midiSelect, ['webmidi:kit']);
    assert.deepEqual(d.calls.drums, ['webmidi:kit']);
    assert.equal(storage.getItem('lyrics_karaoke.deviceId'), 'usb-mic');
    assert.deepEqual(d.calls.gum.sort(), ['usb-guitar', 'usb-mic']);
    assert.equal(d.calls.open.length, 1);
    bs.dispose();
});

test('lights run only while visible and never connect the analyser', async () => {
    const d = deviceWin();
    const { col, fb, bs } = setup({ stored: withDevices, winExtra: d.winExtra });
    await flush();
    await flush();
    assert.deepEqual(d.calls.gum.sort(), ['usb-guitar', 'usb-mic']);
    assert.deepEqual(d.calls.open, [{ logicalSourceKey: 'webmidi:kit', requester: 'build_a_band' }]);
    d.runFrames();
    assert.ok(col('guitar').querySelector('.bab-signal').classList.contains('bab-lit'));
    for (const ctx of d.audio.contexts) {
        for (const a of ctx.analysers) assert.equal(a.connectCalls, 0);
        for (const c of d.audio.connects) assert.notEqual(c.to, ctx.destination);
    }
    assert.ok(d.audio.connects.every((c) => c.from.kind === 'source'));

    fb.emit('screen:changing', { id: 'player', from: 'plugin-build_a_band' });
    assert.equal(liveStreams(d).length, 0, 'every track stopped on hide');
    assert.ok(d.audio.contexts.every((c) => c.closed === 1));
    assert.equal(d.frames.size, 0);
    assert.equal(d.listeners.size, 0);
    assert.deepEqual(d.calls.close, [{ logicalSourceKey: 'webmidi:kit', requester: 'build_a_band' }]);

    fb.emit('screen:changed', { id: 'plugin-build_a_band', from: 'player' });
    await flush();
    await flush();
    assert.equal(liveStreams(d).length, 2, 'meters back on show');
    assert.equal(d.listeners.size, 1);

    bs.dispose();
    assert.equal(liveStreams(d).length, 0, 'every track stopped on dispose');
    assert.equal(d.listeners.size, 0);
    assert.equal(d.calls.close.length, 2);
});

test('losing .active stops the lights at the next frame', async () => {
    const d = deviceWin();
    const { doc, bs } = setup({ stored: withDevices, winExtra: d.winExtra });
    await flush();
    await flush();
    doc.getElementById('plugin-build_a_band').classList.remove('active');
    d.runFrames();
    assert.equal(liveStreams(d).length, 0);
    assert.equal(d.listeners.size, 0);
    bs.dispose();
});

test('a device change stops the old meter before the new one starts', async () => {
    const d = deviceWin();
    const { col, bs } = setup({ stored: withDevices, winExtra: d.winExtra });
    await flush();
    await flush();
    const old = d.streams.find((s) => s.id === 'usb-guitar');
    const sel = col('guitar').querySelector('select');
    sel.value = 'usb-mic';
    sel.fire('change');
    assert.equal(old.tracks[0].stopped, 1, 'stopped synchronously, before the new getUserMedia');
    await flush();
    assert.equal(d.streams.filter((s) => s.id === 'usb-mic').length, 2);
    assert.equal(liveStreams(d).length, 2);
    bs.dispose();
});

test('a pad hit flashes the drum light and starts the song when Go is enabled', async () => {
    const d = deviceWin();
    const { col, bs, gos } = setup({ stored: withDevices, winExtra: d.winExtra });
    await flush();
    await flush();
    d.hit([0x99, 38, 100]);
    assert.ok(col('drums').querySelector('.bab-signal').classList.contains('bab-hit'));
    assert.equal(gos.length, 0, 'no song: Go disabled');
    bs.setSong(holiday);
    d.hit([0x89, 38, 64]);
    assert.equal(gos.length, 0, 'note-off is not a hit');
    d.hit([0x99, 38, 100]);
    assert.equal(gos.length, 1);
    bs.dispose();
    assert.ok(!col('drums').querySelector('.bab-signal').classList.contains('bab-hit'));
});

test('denied mic permission shows no access', async () => {
    const d = deviceWin({ gumError: 'NotAllowedError' });
    const { col, bs } = setup({ stored: withDevices, winExtra: d.winExtra });
    await flush();
    await flush();
    assert.equal(col('vocals').querySelector('.bab-signal').textContent, 'no access');
    assert.equal(col('guitar').querySelector('.bab-signal').textContent, 'no access');
    bs.dispose();
});

test('a desktop session source shows check in game without opening the mic', async () => {
    const d = deviceWin();
    d.winExtra.feedBack.audioSession = {
        listInputSources: () => ({ payload: { sources: [{ logicalSourceKey: 'native::in1', label: 'Interface In 1' }] } }),
        selectInputSource: () => ({ outcome: 'handled' }),
    };
    const { col, bs } = setup({ stored: { parts: { guitar: { deviceKey: 'native::in1' }, drums: { on: false }, vocals: { on: false } } }, winExtra: d.winExtra });
    await flush();
    await flush();
    assert.equal(col('guitar').querySelector('.bab-signal').textContent, 'check in game');
    assert.equal(d.calls.gum.length, 0);
    bs.dispose();
});

test('Find my kit discovers MIDI and lists the kit', async () => {
    const d = deviceWin({ midiSources: [], afterDiscover: [{ logicalSourceKey: 'webmidi:kit', label: 'Kit' }] });
    const { col, bs } = setup({ winExtra: d.winExtra });
    await flush();
    const find = col('drums').querySelector('button.bab-findkit');
    assert.ok(find);
    assert.equal(find.hidden, false);
    find.click();
    await flush();
    assert.equal(d.calls.discover, 1);
    assert.deepEqual(col('drums').querySelector('select').querySelectorAll('option').slice(1).map((o) => o.value), ['webmidi:kit']);
    assert.equal(find.hidden, true);
    bs.dispose();
});
