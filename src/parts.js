// Part registry: what each band member can play and what chart it needs.
import { findDrumArrangement } from './arrangements.js';
import { DIFFICULTIES, guitarArrIndex } from './mappings.js';

// Normalises a library item (has_drum_tab, has_vocal_pitch, stem_ids) or
// feedBack.currentSong (hasDrumTab); missing fields read as false/empty.
export function songFacts(itemOrSong) {
    const s = itemOrSong || {};
    return {
        arrangements: Array.isArray(s.arrangements) ? s.arrangements : [],
        hasDrumTab: !!(s.has_drum_tab || s.hasDrumTab),
        hasVocalPitch: !!(s.has_vocal_pitch || s.hasVocalPitch),
        stemIds: Array.isArray(s.stem_ids) ? s.stem_ids : [],
    };
}

const GUITAR_NAMES = ['Lead', 'Rhythm', 'Bass'];

export const PART_TYPES = Object.freeze([
    Object.freeze({
        id: 'guitar', instrument: 'guitar', inputKind: 'audio', label: 'Guitar', icon: 'guitar',
        color: '#f5c542', difficulties: DIFFICULTIES, extras: ['arrangement'],
        chartFrom(itemOrSong, partPrefs) {
            const { arrangements } = songFacts(itemOrSong);
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
            const i = findDrumArrangement(arrangements, { hasDrumTab });
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

export function getPart(id) {
    return PART_TYPES.find((p) => p.id === id) || null;
}

export function hasChart(part, itemOrSong, partPrefs) {
    const r = part.chartFrom(itemOrSong, partPrefs);
    if (typeof r === 'number') return r >= 0;
    return r === true;
}
