// Band screen view model and the Go key test. Pure, no DOM: band-screen.js
// renders whatever this returns.
import { PART_TYPES, hasChart, songFacts } from './parts.js';

const UNAVAILABLE_NOTE = {
    guitar: 'No guitar part in this song',
    drums: 'No drum chart for this song',
    vocals: 'No vocal pitch for this song',
};
const KARAOKE_OFF_NOTE = 'Turn on the Lyrics Karaoke plugin to sing';
const SOUND_MODES_NOTE = 'Rock Band and My kit only need a drum stem';
// Guitar scores through note_detect, which the band turns on with an input picked.
const NOTE_DETECT_OFF_NOTE = 'Turn on Note Detection to score your guitar';
const PICK_GUITAR_INPUT_NOTE = 'Pick an input to score your guitar';

// bandScreenModel({ prefs, item, vocalsSupported, noteDetectLoaded }) -> { goEnabled, goHint, columns: { guitar, drums, vocals } }
// A column is unavailable only when a song is picked and has no chart for it;
// the stored part settings are never changed here. Vocals is also unavailable
// (with or without a song) when the Lyrics Karaoke plugin isn't loaded. An
// available guitar part that is on notes what it needs to score.
export function bandScreenModel({ prefs, item, vocalsSupported = true, noteDetectLoaded = true }) {
    const parts = (prefs && prefs.parts) || {};
    const columns = {};
    for (const part of PART_TYPES) {
        const pp = parts[part.id] || {};
        const noKaraoke = part.id === 'vocals' && !vocalsSupported;
        const unavailable = noKaraoke || (!!item && !hasChart(part, item, pp));
        const col = { on: !!pp.on, unavailable, note: unavailable ? (noKaraoke ? KARAOKE_OFF_NOTE : UNAVAILABLE_NOTE[part.id]) : '' };
        if (part.id === 'drums') {
            col.soundModesDisabled = !!item && !songFacts(item).stemIds.includes('drums');
            if (!unavailable && col.soundModesDisabled) col.note = SOUND_MODES_NOTE;
            // The mode that will play: a song without a drum stem plays Song drums.
            col.soundMode = col.soundModesDisabled ? 'song' : (pp.soundMode || 'song');
        }
        if (part.id === 'guitar' && !unavailable && col.on) {
            if (!noteDetectLoaded) col.note = NOTE_DETECT_OFF_NOTE;
            else if (!pp.deviceKey) col.note = PICK_GUITAR_INPUT_NOTE;
        }
        columns[part.id] = col;
    }
    const playable = (c) => c.on && !c.unavailable;
    const goEnabled = !!item && ['guitar', 'drums', 'vocals'].some((id) => playable(columns[id]));
    let goHint = 'Press Space or hit any pad to start';
    if (!item) goHint = 'Pick a song';
    else if (!goEnabled) goHint = 'Turn on a part';
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
