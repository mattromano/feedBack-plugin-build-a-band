// RockHeroSmith as a core play mode: which songs the band can play and whether a band
// is set up. Pure helpers; everything about songs comes from parts.js.
import { songFacts, hasChart, getPart, drumsControllerPartFor } from './parts.js';

export const MODE_ID = 'rockherosmith';

// Band-ready (R11): a real guitar arrangement (Lead / Rhythm / Bass, not a five-fret-only
// pack; Combo-only doesn't count) and a five-fret chart or a drum chart. Lyrics alone don't.
export function isBandReady(item) {
    return !!item && hasChart(getPart('guitar'), item)
        && (songFacts(item).fiveFret.some((p) => p.kind === 'chart') || drumsControllerPartFor(item) !== null);
}

// The saved device field of each fixed part.
const DEVICE_FIELD = { guitar: 'deviceKey', drums: 'deviceKey', vocals: 'deviceId' };

// A band is set up (R12): a joined controller that is on, or a fixed part that is on
// with a saved device.
export function bandIsSetUp(prefs) {
    const p = prefs || {};
    if (Array.isArray(p.controllers) && p.controllers.some((c) => c && c.on !== false)) return true;
    const parts = p.parts || {};
    return Object.keys(DEVICE_FIELD).some((id) => {
        const part = parts[id];
        return !!part && part.on === true && typeof part[DEVICE_FIELD[id]] === 'string' && part[DEVICE_FIELD[id]] !== '';
    });
}
