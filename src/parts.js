// Part registry: what each band member can play and what chart it needs.
import { drumArrIndex } from './arrangements.js';
import { DIFFICULTIES, guitarArrIndex } from './mappings.js';

// "bass:chart" (library item) or { instrument, source_kind } (song info) -> { instrument, kind }.
// A bare "bass" reads as a real chart.
function fiveFretEntry(e) {
    if (typeof e === 'string') {
        const [instrument, kind] = e.split(':');
        return instrument ? { instrument, kind: kind || 'chart' } : null;
    }
    if (e && typeof e === 'object' && typeof e.instrument === 'string' && e.instrument) {
        const kind = typeof e.source_kind === 'string' ? e.source_kind : (typeof e.kind === 'string' ? e.kind : '');
        return { instrument: e.instrument, kind: kind || 'chart' };
    }
    return null;
}

// Normalises a library item (has_drum_tab, has_vocal_pitch, stem_ids) or
// feedBack.currentSong (hasDrumTab); missing fields read as false/empty. `fiveFret` lists the
// 5-fret parts as { instrument, kind }; `fiveFretOnly` marks a pack with no real-guitar arrangement.
export function songFacts(itemOrSong) {
    const s = itemOrSong || {};
    const ff = Array.isArray(s.five_fret_parts) ? s.five_fret_parts : (Array.isArray(s.fiveFretParts) ? s.fiveFretParts : []);
    return {
        arrangements: Array.isArray(s.arrangements) ? s.arrangements : [],
        hasDrumTab: !!(s.has_drum_tab || s.hasDrumTab),
        hasVocalPitch: !!(s.has_vocal_pitch || s.hasVocalPitch),
        stemIds: Array.isArray(s.stem_ids) ? s.stem_ids : [],
        fiveFret: ff.map(fiveFretEntry).filter(Boolean),
        fiveFretOnly: (s.five_fret_only || s.fiveFretOnly) === true,
    };
}

const GUITAR_NAMES = ['Lead', 'Rhythm', 'Bass'];

export const PART_TYPES = Object.freeze([
    Object.freeze({
        id: 'guitar', instrument: 'guitar', inputKind: 'audio', label: 'Guitar', icon: 'guitar',
        color: '#f5c542', difficulties: DIFFICULTIES, extras: ['arrangement'],
        chartFrom(itemOrSong, partPrefs) {
            const { arrangements, fiveFretOnly } = songFacts(itemOrSong);
            // A 5-fret-only pack's arrangements are placeholders, not a real guitar part.
            if (fiveFretOnly) return undefined;
            const wanted = guitarArrIndex(arrangements, (partPrefs && partPrefs.arrangement) || 'Lead');
            if (wanted !== undefined) return wanted;
            for (const n of GUITAR_NAMES) {
                const i = guitarArrIndex(arrangements, n);
                if (i !== undefined) return i;
            }
            return undefined;
        },
    }),
    Object.freeze({
        id: 'drums', instrument: 'drums', inputKind: 'midi', label: 'Drums', icon: 'drum',
        color: '#e0533d', difficulties: DIFFICULTIES, extras: ['soundMode'],
        chartFrom(itemOrSong) {
            const { arrangements, hasDrumTab } = songFacts(itemOrSong);
            const i = drumArrIndex(arrangements, { hasDrumTab });
            if (i >= 0) return i;
            return hasDrumTab ? true : -1;
        },
    }),
    Object.freeze({
        id: 'vocals', instrument: 'vocals', inputKind: 'mic', label: 'Vocals', icon: 'mic',
        color: '#a678ff', difficulties: DIFFICULTIES, extras: ['hearMyself'],
        chartFrom(itemOrSong) { return songFacts(itemOrSong).hasVocalPitch; },
    }),
]);

// A plastic-controller player's part. It is not in PART_TYPES (the three fixed columns);
// controller players are `ctl<N>` ids in prefs.controllers.
export const FIVE_FRET_PART = Object.freeze({
    id: 'five_fret', inputKind: 'five_fret_controller', label: '5-Fret', icon: 'gamepad-2',
    color: '#2ecc40', difficulties: DIFFICULTIES,
});

const FIVE_FRET_FALLBACK = ['guitar', 'bass', 'rhythm'];

// The 5-fret part a controller plays on this song: its own when the song has it, else the
// first of Lead, Bass, Rhythm the song has, else null. Auto charts count only with
// showAuto (the caller reads the 5-Fret plugin's setting); a real chart beats an auto one.
export function fiveFretPartFor(itemOrSong, controller, { showAuto = false } = {}) {
    const parts = songFacts(itemOrSong).fiveFret.filter((p) => showAuto || p.kind !== 'auto');
    const find = (instrument) => parts.find((p) => p.instrument === instrument && p.kind !== 'auto')
        || parts.find((p) => p.instrument === instrument);
    const wanted = controller && controller.part;
    return (wanted && find(wanted)) || FIVE_FRET_FALLBACK.map(find).find(Boolean) || null;
}

export function getPart(id) {
    return PART_TYPES.find((p) => p.id === id) || null;
}

export function hasChart(part, itemOrSong, partPrefs) {
    const r = part.chartFrom(itemOrSong, partPrefs);
    if (typeof r === 'number') return r >= 0;
    return r === true;
}

// A controller playing drums (Plan 6 Decision 13): the drum lane's instrument, played
// from a game controller or a plastic kit, coloured apart from the real drummer's red.
export const DRUMS_CONTROLLER_PART = Object.freeze({
    id: 'drums_controller', instrument: 'drums', inputKind: 'controller', label: 'Drums', icon: 'drum',
    color: '#f28c28', difficulties: DIFFICULTIES,
});

// A drums controller plays the song's drum chart (a drum arrangement or a drum tab), else nothing.
export function drumsControllerPartFor(itemOrSong) {
    return hasChart(getPart('drums'), itemOrSong) ? { instrument: 'drums', kind: 'chart' } : null;
}

// The part a joined controller plays on this song, by what it plays as; null while
// undecided or when the song has no chart for it. opts reach fiveFretPartFor (showAuto).
export function controllerPartFor(itemOrSong, controller, opts) {
    const playsAs = controller && controller.playsAs;
    if (playsAs === 'five_fret') return fiveFretPartFor(itemOrSong, controller, opts);
    if (playsAs === 'drums') return drumsControllerPartFor(itemOrSong);
    return null;
}
