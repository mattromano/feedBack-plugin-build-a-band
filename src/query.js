// The band's library pick chips, song chips and the recent-song lookup.
import { songFacts, getPart, hasChart } from './parts.js';

// The band's chips for the library pick, in order: [id, label].
export const PICK_FILTERS = Object.freeze([
    ['playable', 'Playable by band'], ['drumStem', 'Drum stem'], ['drums', 'Drum chart'],
    ['vocals', 'Vocal pitch'], ['guitar', 'Guitar part'],
    ['fiveFret', '5-fret part'], ['fiveFretReal', 'Real 5-fret'],
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
    fiveFretReal: Object.freeze({ five_fret: 'any:chart' }),
});

// pickFilters({ parts, on, controllers, showAuto }) -> [{ id, label, params, on }] for
// feedBack.library.pick. `playable` sends the params of every part with on === true (the
// caller drops vocals when Lyrics Karaoke isn't loaded) and the instruments of the
// controllers that are on and not known to be disconnected; `on` is the stored chip flags.
// Auto charts match only with showAuto (the 5-Fret plugin's setting): without it the
// 5-fret chip and the controllers' instruments ask for real (`:chart`) parts.
export function pickFilters({ parts = {}, on = {}, controllers = [], showAuto = false } = {}) {
    const p = parts || {};
    const flags = on || {};
    return PICK_FILTERS.map(([id, label]) => {
        let params;
        if (id === 'playable') {
            params = {};
            for (const part of ['guitar', 'drums', 'vocals']) {
                if (p[part] && p[part].on === true) Object.assign(params, PART_PARAMS[part]);
            }
            const insts = [];
            for (const c of (Array.isArray(controllers) ? controllers : [])) {
                if (c && c.on !== false && c.connected !== false && c.part && !insts.includes(c.part)) insts.push(c.part);
            }
            if (insts.length) params.five_fret = insts.map((i) => (showAuto ? i : i + ':chart')).join(',');
        } else if (id === 'fiveFret') {
            params = { five_fret: showAuto ? 'any' : 'any:chart' };
        } else {
            params = { ...CHIP_PARAMS[id] };
        }
        return { id, label, params, on: !!flags[id] };
    });
}

const FIVE_FRET_LABELS = [['guitar', 'Lead'], ['rhythm', 'Rhythm'], ['bass', 'Bass']];

// songChips(item, { showAuto }): the 5-fret chip lists the song's parts (auto-only ones
// marked), counting auto parts only with showAuto.
export function songChips(item, { showAuto = false } = {}) {
    const facts = songFacts(item);
    const ff = facts.fiveFret.filter((p) => showAuto || p.kind !== 'auto');
    const labels = FIVE_FRET_LABELS.map(([inst, label]) => {
        const mine = ff.filter((p) => p.instrument === inst);
        if (!mine.length) return null;
        return mine.some((p) => p.kind !== 'auto') ? label : label + ' (auto)';
    }).filter(Boolean);
    const names = facts.arrangements.map((a) => (a && (a.smart_name || a.name)) || '').filter(Boolean);
    return [
        { id: 'drumChart', label: 'Drum chart', good: hasChart(getPart('drums'), item) },
        { id: 'drumStem', label: 'Drum stem', good: facts.stemIds.includes('drums') },
        { id: 'vocalPitch', label: 'Vocal pitch', good: facts.hasVocalPitch },
        { id: 'arrangements', label: names.length ? names.join(' · ') : 'No arrangements', good: names.length > 0 },
        { id: 'fiveFret', label: labels.length ? '5-fret: ' + labels.join(' · ') : 'No 5-fret parts', good: labels.length > 0 },
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
