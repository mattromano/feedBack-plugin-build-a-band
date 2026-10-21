// Band screen view model and the Go key test. Pure, no DOM: band-screen.js
// renders whatever this returns.
import { PART_TYPES, hasChart, songFacts } from './parts.js';

const UNAVAILABLE_NOTE = {
    guitar: 'No guitar part in this song',
    drums: 'No drum chart for this song',
    vocals: 'No vocal pitch for this song',
};
const VOCALS_NOTE = 'Vocals lane arrives with the next update';
const SOUND_MODES_NOTE = 'Rock Band and My kit only need a drum stem';

// bandScreenModel({ prefs, item }) -> { goEnabled, goHint, columns: { guitar, drums, vocals } }
// A column is unavailable only when a song is picked and has no chart for it;
// the stored part settings are never changed here.
export function bandScreenModel({ prefs, item }) {
    const parts = (prefs && prefs.parts) || {};
    const columns = {};
    for (const part of PART_TYPES) {
        const pp = parts[part.id] || {};
        const unavailable = !!item && !hasChart(part, item, pp);
        const col = { on: !!pp.on, unavailable, note: unavailable ? UNAVAILABLE_NOTE[part.id] : '' };
        if (part.id === 'vocals' && !unavailable) col.note = VOCALS_NOTE;
        if (part.id === 'drums') {
            col.soundModesDisabled = !!item && !songFacts(item).stemIds.includes('drums');
            if (!unavailable && col.soundModesDisabled) col.note = SOUND_MODES_NOTE;
        }
        columns[part.id] = col;
    }
    const playable = (c) => c.on && !c.unavailable;
    const goEnabled = !!item && (playable(columns.guitar) || playable(columns.drums));
    let goHint = 'Press Space or hit any pad to start';
    if (!item) goHint = 'Pick a song';
    else if (!goEnabled) goHint = 'Turn on guitar or drums';
    return { goEnabled, goHint, columns };
}

const TEXT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

// Space starts the song, unless it is a key repeat or the user is typing.
export function isGoKey(event, activeElement) {
    const e = event || {};
    if (e.repeat) return false;
    if (e.code !== 'Space' && e.key !== ' ') return false;
    const a = activeElement;
    if (a && (TEXT_TAGS.includes(String(a.tagName || '').toUpperCase()) || a.isContentEditable)) return false;
    return true;
}
