import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandScreenModel, isGoKey } from '../src/band-model.js';
import { normalizePrefs } from '../src/prefs.js';

const prefs = normalizePrefs({});
const withParts = (parts) => normalizePrefs({ parts });
const fullBand = {
    arrangements: [{ name: 'Lead' }], has_drum_tab: true, has_vocal_pitch: true, stem_ids: ['drums'],
};

test('no song: go disabled with "Pick a song"', () => {
    const m = bandScreenModel({ prefs, item: null });
    assert.equal(m.goEnabled, false);
    assert.equal(m.goHint, 'Pick a song');
    for (const id of ['guitar', 'drums', 'vocals']) {
        assert.equal(m.columns[id].on, true);
        assert.equal(m.columns[id].unavailable, false);
    }
});

test('full band song', () => {
    const m = bandScreenModel({ prefs, item: fullBand });
    assert.equal(m.goEnabled, true);
    assert.equal(m.goHint, 'Press Space or hit any pad to start');
    assert.equal(m.columns.guitar.unavailable, false);
    assert.equal(m.columns.drums.unavailable, false);
    assert.equal(m.columns.vocals.unavailable, false);
    assert.equal(m.columns.drums.soundModesDisabled, false);
    assert.equal(m.columns.vocals.note, '');
    assert.equal(m.columns.guitar.note, '');
    assert.equal(m.columns.drums.note, '');
});

test('song without vocal pitch greys vocals with its note', () => {
    const m = bandScreenModel({ prefs, item: { ...fullBand, has_vocal_pitch: false } });
    assert.equal(m.columns.vocals.unavailable, true);
    assert.equal(m.columns.vocals.note, 'No vocal pitch for this song');
    assert.equal(m.columns.vocals.on, true, 'stored setting kept');
    assert.equal(m.goEnabled, true);
});

test('song without a drum stem disables sound modes 2 and 3', () => {
    const m = bandScreenModel({ prefs, item: { ...fullBand, stem_ids: ['guitar'] } });
    assert.equal(m.columns.drums.unavailable, false);
    assert.equal(m.columns.drums.soundModesDisabled, true);
    assert.equal(m.columns.drums.note, 'Rock Band and My kit only need a drum stem');
});

test('song without a drum chart greys drums; guitar alone still enables Go', () => {
    const m = bandScreenModel({ prefs, item: { ...fullBand, has_drum_tab: false } });
    assert.equal(m.columns.drums.unavailable, true);
    assert.equal(m.columns.drums.note, 'No drum chart for this song');
    assert.equal(m.goEnabled, true);
    const off = bandScreenModel({ prefs: withParts({ guitar: { on: false }, vocals: { on: false } }), item: { ...fullBand, has_drum_tab: false } });
    assert.equal(off.goEnabled, false);
    assert.equal(off.goHint, 'Turn on a part');
});

test('guitar is checked against any of Lead/Rhythm/Bass, not only the chosen one', () => {
    const item = { ...fullBand, arrangements: [{ name: 'Bass' }] };
    const m = bandScreenModel({ prefs, item }); // chosen arrangement: Lead
    assert.equal(m.columns.guitar.unavailable, false);
    const none = bandScreenModel({ prefs, item: { ...fullBand, arrangements: [{ name: 'Drums' }] } });
    assert.equal(none.columns.guitar.unavailable, true);
    assert.equal(none.columns.guitar.note, 'No guitar part in this song');
});

test('only vocals on: Go is enabled for a song with vocal pitch', () => {
    const m = bandScreenModel({ prefs: withParts({ guitar: { on: false }, drums: { on: false } }), item: fullBand });
    assert.equal(m.goEnabled, true);
});

test('nothing on: Go disabled with "Turn on a part"', () => {
    const none = withParts({ guitar: { on: false }, drums: { on: false }, vocals: { on: false } });
    const m = bandScreenModel({ prefs: none, item: fullBand });
    assert.equal(m.goEnabled, false);
    assert.equal(m.goHint, 'Turn on a part');
});

test('karaoke not loaded greys vocals with its note, even with no song', () => {
    const m = bandScreenModel({ prefs, item: null, vocalsSupported: false });
    assert.deepEqual({ unavailable: m.columns.vocals.unavailable, note: m.columns.vocals.note },
        { unavailable: true, note: 'Turn on the Lyrics Karaoke plugin to sing' });
    const withSong = bandScreenModel({ prefs, item: fullBand, vocalsSupported: false });
    assert.equal(withSong.columns.vocals.unavailable, true);
    assert.equal(withSong.columns.vocals.note, 'Turn on the Lyrics Karaoke plugin to sing');
});

test('karaoke not loaded and only vocals on: Go disabled', () => {
    const only = withParts({ guitar: { on: false }, drums: { on: false } });
    const m = bandScreenModel({ prefs: only, item: fullBand, vocalsSupported: false });
    assert.equal(m.goEnabled, false);
    assert.equal(m.goHint, 'Turn on a part');
});

test('isGoKey', () => {
    assert.equal(isGoKey({ code: 'Space' }, null), true);
    assert.equal(isGoKey({ key: ' ' }, { tagName: 'BUTTON' }), true);
    assert.equal(isGoKey({ code: 'Space' }, { tagName: 'INPUT' }), false);
    assert.equal(isGoKey({ code: 'Space' }, { tagName: 'TEXTAREA' }), false);
    assert.equal(isGoKey({ code: 'Space' }, { tagName: 'SELECT' }), false);
    assert.equal(isGoKey({ code: 'Space', repeat: true }, null), false);
    assert.equal(isGoKey({ code: 'Enter' }, null), false);
    assert.equal(isGoKey({ code: 'Space' }, { tagName: 'DIV', isContentEditable: true }), false);
});
