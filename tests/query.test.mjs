import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, buildLibraryQuery, songChips, createSearchController, resolveRecent } from '../src/query.js';

test('query with no filters', () => {
    assert.equal(buildLibraryQuery({ q: ' holiday ', filters: { ...DEFAULT_FILTERS, playable: false } }), 'q=holiday&size=30');
});

test('playable by this band follows the parts switched on', () => {
    const parts = { guitar: { on: true }, drums: { on: true }, vocals: { on: false } };
    assert.equal(buildLibraryQuery({ q: '', parts }), 'q=&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1');
});

// Until the vocals lane ships (plan 3), playable never asks for vocal pitch.
test('playable by this band ignores vocals; the explicit vocals filter still applies', () => {
    const parts = { guitar: { on: true }, drums: { on: false }, vocals: { on: true } };
    assert.equal(buildLibraryQuery({ q: '', parts }), 'q=&size=30&arrangements_has=Lead%2CRhythm%2CBass');
    const filters = { ...DEFAULT_FILTERS, vocals: true };
    assert.equal(buildLibraryQuery({ q: '', filters, parts }),
        'q=&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_lyrics=pitch');
});

test('explicit filters add to playable', () => {
    const filters = { ...DEFAULT_FILTERS, playable: false, vocals: true, drumStem: true };
    assert.equal(buildLibraryQuery({ q: '', filters }), 'q=&size=30&has_lyrics=pitch&stems_has=drums');
});

test('songChips', () => {
    const chips = songChips({ has_drum_tab: true, stem_ids: ['drums'], has_vocal_pitch: false,
        arrangements: [{ name: 'Lead' }, { name: 'Bass' }] });
    assert.deepEqual(chips.map((c) => [c.id, c.good]),
        [['drumChart', true], ['drumStem', true], ['vocalPitch', false], ['arrangements', true]]);
    assert.equal(chips[3].label, 'Lead · Bass');
});

test('songChips on an item from an older core', () => {
    const chips = songChips({ arrangements: [{ name: 'Drums' }] });
    assert.equal(chips.find((c) => c.id === 'drumChart').good, true);
    assert.equal(chips.find((c) => c.id === 'vocalPitch').good, false);
});

function harness() {
    const timers = [];
    const calls = [];
    const results = [];
    const ctl = createSearchController({
        fetchJson: (url) => new Promise((resolve) => calls.push({ url, resolve })),
        onResults: (songs) => results.push(songs),
        onError: () => {},
        setTimer: (fn) => { timers.push({ fn, live: true }); return timers.length - 1; },
        clearTimer: (id) => { if (timers[id]) timers[id].live = false; },
    });
    const fire = () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } };
    return { ctl, calls, results, fire };
}

test('search is debounced', () => {
    const h = harness();
    h.ctl.search('q=a');
    h.ctl.search('q=b');
    h.fire();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, '/api/library?q=b');
});

test('the latest request wins', async () => {
    const h = harness();
    h.ctl.search('q=a'); h.fire();
    h.ctl.search('q=b'); h.fire();
    h.calls[1].resolve({ songs: ['B'] });
    h.calls[0].resolve({ songs: ['A'] });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.results, [['B']]);
});

test('dispose drops a pending response', async () => {
    const h = harness();
    h.ctl.search('q=a'); h.fire();
    h.ctl.dispose();
    h.calls[0].resolve({ songs: ['A'] });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.results, []);
    h.ctl.search('q=c');
    h.fire();
    assert.equal(h.calls.length, 1, 'pending timer cancelled / no new request after dispose');
});

test('resolveRecent finds the song by filename, or null', async () => {
    let url;
    const fetchJson = async (u) => { url = u; return { songs: [{ filename: 'x' }, { filename: 'y', title: 'Y' }] }; };
    assert.equal((await resolveRecent({ filename: 'y', title: 'A & B' }, fetchJson)).title, 'Y');
    assert.equal(url, '/api/library?q=A%20%26%20B&size=30');
    assert.equal(await resolveRecent({ filename: 'nope', title: 't' }, fetchJson), null);
    assert.equal(await resolveRecent({ filename: 'y', title: 't' }, async () => { throw new Error('x'); }), null);
});
