// Band screen view model and the Go key test. Pure, no DOM: band-screen.js
// renders whatever this returns.
import { PART_TYPES, hasChart, songFacts, fiveFretPartFor } from './parts.js';
import { stemIdFor } from './stem-claims.js';
import { guitarArrIndex } from './mappings.js';

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
// The chartFrom fallback order (parts.js).
const GUITAR_ARRANGEMENTS = ['Lead', 'Rhythm', 'Bass'];

// bandScreenModel({ prefs, item, vocalsSupported, noteDetectLoaded, pickAvailable })
//   -> { goEnabled, goHint, pickEnabled, setupHint, columns: { guitar, drums, vocals } }
// A column is unavailable only when a song is picked and has no chart for it;
// the stored part settings are never changed here. Vocals is also unavailable
// (with or without a song) when the Lyrics Karaoke plugin isn't loaded. An
// available guitar part that is on notes what it needs to score. The guitar
// column also says which arrangements the song has and the one that will play.
// Setup shows setupHint (the library pick needs core's hook and a part on);
// Confirm shows goHint.
export function bandScreenModel({
    prefs, item, vocalsSupported = true, noteDetectLoaded = true, pickAvailable = true,
    fiveFretLoaded = false, controllerStatus = { available: false, reason: null, connected: new Set() }, showAuto = false,
}) {
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
        if (part.id === 'guitar') {
            const facts = songFacts(item);
            col.arrangements = {};
            for (const n of GUITAR_ARRANGEMENTS) {
                col.arrangements[n] = !item || (!facts.fiveFretOnly && guitarArrIndex(facts.arrangements, n) !== undefined);
            }
            const stored = pp.arrangement || 'Lead';
            col.arrangement = col.arrangements[stored] ? stored
                : (GUITAR_ARRANGEMENTS.find((n) => col.arrangements[n]) || stored);
        }
        if (part.id === 'guitar' && !unavailable && col.on) {
            if (!noteDetectLoaded) col.note = NOTE_DETECT_OFF_NOTE;
            else if (!pp.deviceKey) col.note = PICK_GUITAR_INPUT_NOTE;
        }
        columns[part.id] = col;
    }
    const controllers = controllerRows({ prefs, item, fiveFretLoaded, controllerStatus, showAuto });
    const playable = (c) => c.on && !c.unavailable;
    const controllerPlays = (c) => c.on && !c.unavailable;
    const goEnabled = !!item && (['guitar', 'drums', 'vocals'].some((id) => playable(columns[id]))
        || controllers.some(controllerPlays));
    let goHint = 'Press Space or hit any pad to start';
    if (!item) goHint = 'Pick a song';
    else if (!goEnabled) goHint = 'Turn on a part';
    const anyOn = ['guitar', 'drums', 'vocals'].some((id) => !!(parts[id] && parts[id].on) && (id !== 'vocals' || vocalsSupported));
    // A controller counts for the pick once it is on, connected and its plugin is there.
    const anyController = controllers.some((c) => c.on && c.connected && c.available);
    const pickEnabled = !!pickAvailable && (anyOn || anyController);
    let setupHint = '';
    if (!pickAvailable) setupHint = 'Update feedBack to pick songs here';
    else if (!pickEnabled) setupHint = 'Turn on a part';
    return { goEnabled, goHint, pickEnabled, setupHint, columns, controllers };
}

const FIVE_FRET_NOTES = {
    disconnected: 'Not connected',
    noChart: 'No 5-fret chart for this song',
    noPlugin: 'Install the 5-Fret plugin to play on a controller',
};
const FIVE_FRET_INSTRUMENTS = ['guitar', 'rhythm', 'bass'];

// One row per joined controller, in join order. `parts[p]` is what the song has for p
// (a real chart beats an auto one; auto counts only with showAuto) and who else holds p;
// `part` is the one that will play (the stored part when the song has it, else a fallback).
function controllerRows({ prefs, item, fiveFretLoaded, controllerStatus, showAuto }) {
    const list = ((prefs && prefs.controllers) || []).filter(Boolean);
    const status = controllerStatus || {};
    const connected = status.connected instanceof Set ? status.connected : new Set(status.connected || []);
    const available = !!fiveFretLoaded && status.available !== false;
    const facts = item ? songFacts(item).fiveFret.filter((p) => showAuto || p.kind !== 'auto') : null;
    const effective = (c) => {
        if (!item) return c.part;
        const hit = fiveFretPartFor(item, c, { showAuto });
        return hit ? hit.instrument : null;
    };
    return list.map((c) => {
        const part = effective(c);
        const isConnected = connected.has(c.key);
        const parts = {};
        for (const inst of FIVE_FRET_INSTRUMENTS) {
            const mine = facts ? facts.filter((p) => p.instrument === inst) : null;
            const kind = !mine || !mine.length ? null : (mine.some((p) => p.kind !== 'auto') ? 'chart' : 'auto');
            parts[inst] = {
                has: !mine || mine.length > 0,
                kind,
                takenBy: list.filter((o) => o !== c && o.on !== false && effective(o) === inst).map((o) => o.name),
            };
        }
        const stemId = item && part ? stemIdFor('five_fret', { part }, songFacts(item).stemIds) : null;
        const partAudioDisabled = !!item && !!part && !stemId;
        let note = '';
        if (!available) note = (!fiveFretLoaded ? '' : status.reason) || FIVE_FRET_NOTES.noPlugin;
        else if (!isConnected) note = FIVE_FRET_NOTES.disconnected;
        else if (item && !part) note = FIVE_FRET_NOTES.noChart;
        else if (partAudioDisabled) note = 'Part audio needs a ' + part + ' stem';
        const unavailable = !available || !isConnected || (!!item && !part);
        return {
            key: c.key, id: c.id, name: c.name, on: c.on !== false, available, connected: isConnected, unavailable, note,
            part: part || c.part, parts, partAudio: c.partAudio, partAudioDisabled,
            difficulty: c.difficulty, lefty: !!c.lefty,
        };
    });
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
