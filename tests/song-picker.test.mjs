// mountSongPicker in a fake DOM with fake timers and a URL-recording fetchJson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSongPicker } from '../src/song-picker.js';
import { makeDoc, makeEl, makeTimers, flush } from './fake-dom.mjs';

const holiday = {
    filename: 'sloppak/greeholi.sloppak', title: 'Holiday', artist: 'Green Day',
    arrangements: [{ name: 'Lead' }], has_drum_tab: true, has_vocal_pitch: false, stem_ids: ['drums'],
};
const on = (v) => ({ on: v });

function setup({ parts = { guitar: on(true), drums: on(true), vocals: on(false) }, recent = [], library = [holiday], fail = false } = {}) {
    const doc = makeDoc();
    const host = makeEl('div', doc);
    const timers = makeTimers();
    const urls = [];
    const picks = [];
    const state = { parts, recent };
    const picker = mountSongPicker({
        host, doc,
        fetchJson: async (url) => {
            urls.push(url);
            if (fail) throw new Error('offline');
            return { songs: library };
        },
        getParts: () => state.parts,
        getRecent: () => state.recent,
        onPick: (item) => picks.push(item),
        timers,
    });
    const input = host.querySelector('input.bab-search');
    const type = (q) => { input.value = q; input.fire('input'); };
    const filter = (id) => host.querySelector(`button.bab-filter[data-filter="${id}"]`);
    const rows = () => host.querySelectorAll('li.bab-row');
    return { doc, host, picker, timers, urls, picks, state, input, type, filter, rows };
}

test('controls: search box, five filters with playable pressed, result list', () => {
    const { host, input, filter, picker } = setup();
    assert.equal(input.type, 'search');
    assert.equal(input.placeholder, 'Search songs');
    const labels = { guitar: 'Guitar part', drums: 'Drum chart', vocals: 'Vocal pitch', drumStem: 'Drum stem', playable: 'Playable by this band' };
    for (const [id, label] of Object.entries(labels)) {
        assert.equal(filter(id).textContent, label);
        assert.equal(filter(id).getAttribute('aria-pressed'), id === 'playable' ? 'true' : 'false');
    }
    assert.equal(host.querySelectorAll('button.bab-filter').length, 5);
    assert.ok(host.querySelector('ul.bab-results'));
    picker.dispose();
});

test('typing searches with playable-by-band params', async () => {
    const { type, timers, urls, rows, picker } = setup();
    type('holiday');
    assert.equal(urls.length, 0, 'debounced');
    timers.run();
    await flush();
    assert.deepEqual(urls, ['/api/library?q=holiday&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1']);
    assert.equal(rows().length, 1);
    const row = rows()[0];
    assert.equal(row.querySelector('.bab-row-title').textContent, 'Holiday');
    assert.equal(row.querySelector('.bab-row-artist').textContent, 'Green Day');
    assert.equal(row.querySelectorAll('.bab-chip').length, 4);
    picker.dispose();
});

test('turning playable off and drum stem on changes the query', async () => {
    const { type, filter, timers, urls, picker } = setup();
    type('holiday');
    filter('playable').click();
    filter('drumStem').click();
    assert.equal(filter('playable').getAttribute('aria-pressed'), 'false');
    assert.equal(filter('drumStem').getAttribute('aria-pressed'), 'true');
    timers.run();
    await flush();
    assert.deepEqual(urls, ['/api/library?q=holiday&size=30&stems_has=drums']);
    picker.dispose();
});

test('empty search lists recent songs; a missing one says so and picks nothing', async () => {
    const recent = [
        { filename: holiday.filename, title: 'Holiday', artist: 'Green Day' },
        { filename: 'gone.psarc', title: 'Gone', artist: 'Nobody' },
    ];
    const { host, rows, urls, picks, timers, picker } = setup({ recent });
    assert.equal(host.querySelector('.bab-results-label').textContent, 'Recent');
    assert.equal(rows().length, 2);
    assert.equal(timers.pending(), 0, 'no library search for an empty box');
    rows()[1].click();
    await flush();
    assert.deepEqual(urls, ['/api/library?q=Gone&size=30']);
    assert.equal(picks.length, 0);
    assert.match(rows()[1].textContent, /Not in the library any more/);
    rows()[0].click();
    await flush();
    assert.deepEqual(picks, [holiday]);
    picker.dispose();
});

test('clicking a result picks that item', async () => {
    const { type, timers, rows, picks, picker } = setup();
    type('holiday');
    timers.run();
    await flush();
    rows()[0].click();
    assert.equal(picks.length, 1);
    assert.equal(picks[0], holiday, 'the exact item object');
    picker.dispose();
});

test('refresh re-runs with the current parts', async () => {
    const { type, timers, urls, state, picker } = setup();
    type('holiday');
    timers.run();
    await flush();
    state.parts = { guitar: on(false), drums: on(true), vocals: on(true) };
    picker.refresh();
    timers.run();
    await flush();
    assert.equal(urls[1], '/api/library?q=holiday&size=30&has_drums=1&has_lyrics=pitch');
    picker.dispose();
});

test('a fetch error says so in the list', async () => {
    const { host, type, timers, rows, picker } = setup({ fail: true });
    type('holiday');
    timers.run();
    await flush();
    assert.equal(rows().length, 0);
    assert.equal(host.querySelector('ul.bab-results').textContent, 'Could not load songs');
    picker.dispose();
});

test('clearing the box shows recent songs again and ignores the in-flight search', async () => {
    const recent = [{ filename: 'r.psarc', title: 'Recent one', artist: '' }];
    const { host, type, timers, rows, picker } = setup({ recent });
    type('holiday');
    type('');
    assert.equal(timers.pending(), 0, 'clearing the box cancels the pending search');
    timers.run();
    await flush();
    assert.equal(host.querySelector('.bab-results-label').textContent, 'Recent');
    assert.equal(rows().length, 1);
    assert.equal(rows()[0].querySelector('.bab-row-title').textContent, 'Recent one');
    picker.dispose();
});

test('dispose cancels the pending search', async () => {
    const { host, type, timers, urls, picker } = setup();
    type('holiday');
    assert.equal(timers.pending(), 1);
    picker.dispose();
    assert.equal(timers.pending(), 0);
    timers.run();
    await flush();
    assert.deepEqual(urls, []);
    assert.equal(host.children.length, 0);
});
