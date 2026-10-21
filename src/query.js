// The band's library pick chips, song chips and the recent-song lookup.
import { songFacts, getPart, hasChart } from './parts.js';

// The band's chips for the library pick, in order: [id, label].
export const PICK_FILTERS = Object.freeze([
    ['playable', 'Playable by band'], ['drumStem', 'Drum stem'], ['drums', 'Drum chart'],
    ['vocals', 'Vocal pitch'], ['guitar', 'Guitar part'],
]);

const PART_PARAMS = Object.freeze({
    guitar: Object.freeze({ arrangements_has: 'Lead,Rhythm,Bass' }),
    drums: Object.freeze({ has_drums: '1' }),
    vocals: Object.freeze({ has_lyrics: 'pitch' }),
});
const CHIP_PARAMS = Object.freeze({
    drumStem: Object.freeze({ stems_has: 'drums' }),
    drums: PART_PARAMS.drums,
    vocals: PART_PARAMS.vocals,
    guitar: PART_PARAMS.guitar,
});

// pickFilters({ parts, on }) -> [{ id, label, params, on }] for feedBack.library.pick.
// `playable` sends the params of every part with on === true (the caller drops
// vocals when Lyrics Karaoke isn't loaded); `on` is the stored chip flags.
export function pickFilters({ parts = {}, on = {} } = {}) {
    const p = parts || {};
    const flags = on || {};
    return PICK_FILTERS.map(([id, label]) => {
        let params;
        if (id === 'playable') {
            params = {};
            for (const part of ['guitar', 'drums', 'vocals']) {
                if (p[part] && p[part].on === true) Object.assign(params, PART_PARAMS[part]);
            }
        } else {
            params = { ...CHIP_PARAMS[id] };
        }
        return { id, label, params, on: !!flags[id] };
    });
}

export function songChips(item) {
    const facts = songFacts(item);
    const names = facts.arrangements.map((a) => (a && (a.smart_name || a.name)) || '').filter(Boolean);
    return [
        { id: 'drumChart', label: 'Drum chart', good: hasChart(getPart('drums'), item) },
        { id: 'drumStem', label: 'Drum stem', good: facts.stemIds.includes('drums') },
        { id: 'vocalPitch', label: 'Vocal pitch', good: facts.hasVocalPitch },
        { id: 'arrangements', label: names.length ? names.join(' · ') : 'No arrangements', good: names.length > 0 },
    ];
}

export async function resolveRecent(entry, fetchJson) {
    try {
        const json = await fetchJson(`/api/library?q=${encodeURIComponent(entry.title)}&size=30`);
        const songs = (json && json.songs) || [];
        return songs.find((s) => s && s.filename === entry.filename) || null;
    } catch (_) {
        return null;
    }
}
