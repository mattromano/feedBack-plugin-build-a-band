// Locate the drum arrangement in a song's arrangement list, the way the
// drums plugin does (screen.js DRUMS_PATTERNS).
export const DRUMS_PATTERNS = /\b(?:drums|percussion|drum\s*kit)\b/i;
const NON_DRUMS = /\b(?:lead|rhythm|bass|combo|guitar)\b/i;

// 1. first type === 'drums'; 2. first name matching DRUMS_PATTERNS;
// 3. with hasDrumTab, the last entry that isn't lead/rhythm/bass/combo/guitar;
// 4. -1.
export function findDrumArrangement(arrangements, { hasDrumTab = false } = {}) {
    const list = Array.isArray(arrangements) ? arrangements : [];
    let i = list.findIndex((a) => a && a.type === 'drums');
    if (i >= 0) return i;
    i = list.findIndex((a) => a && DRUMS_PATTERNS.test(a.name || ''));
    if (i >= 0) return i;
    if (hasDrumTab) {
        for (let j = list.length - 1; j >= 0; j--) {
            if (list[j] && !NON_DRUMS.test(list[j].name || '')) return j;
        }
    }
    return -1;
}

// The drum arrangement's index as core and the highway WS number it (`.index`,
// which can differ from the list position), or -1. Use this, never the raw
// position, for playSong and ?arrangement=.
export function drumArrIndex(arrangements, opts) {
    const i = findDrumArrangement(arrangements, opts);
    if (i < 0) return -1;
    const a = arrangements[i];
    return (a && a.index !== undefined) ? a.index : i;
}
