// Controller players: pure data helpers for the Build-a-Band join list. A controller
// player is `ctl<N>` in `prefs.controllers`, next to the fixed guitar / drums / vocals
// ids. No DOM, and nothing here reads `window` at import time.
import { DIFFICULTIES } from './mappings.js';
import { fiveFretPartFor } from './parts.js';
import { fiveFretEntry } from './part-events.js';

export const FIVE_FRET_PART_LABELS = Object.freeze({ guitar: 'Lead', rhythm: 'Rhythm', bass: 'Bass' });
export const PART_AUDIO_MODES = Object.freeze(['rockband', 'always']);

// Everything a controller kind needs from its plugin, behind one entry per kind (the
// Plan 6 seam: it adds `drums`). Every accessor reads the plugin's global when it is
// called, never at module start, so a missing or late-loading plugin only degrades.
//   api()                       the plugin's public band API, or null
//   resolveBinding(key)         Promise of the controller's binding kind, or null
//   setupHref()                 opens the plugin's controls screen and returns to this one
//   laneRenderer()              the plugin's highway renderer, or null
//   eventPrefix                 bus event prefix: `<prefix>:band-pause` etc.
//   pin(canvas, key, opts)      pins a lane (opts: part, difficulty, lefty); false when the API is missing
//   unpin(canvas)               releases the lane
//   partFor(item, c, opts)      the part this controller plays on the song ({ instrument, kind }), or null
//   judgments                   the band-event suffixes that are judgments (`<prefix>:<suffix>`)
//   entry(type, detail, t, id, last)  a judgment's band score entry (part-events.js)
const fiveFretApi = () => globalThis.window?.feedBackFiveFret || null;

export const CONTROLLER_KINDS = {
    five_fret: {
        label: '5-Fret',
        parts: ['guitar', 'rhythm', 'bass'],
        api: fiveFretApi,
        async resolveBinding(controllerKey) {
            const api = fiveFretApi();
            if (!api || typeof api.listControllers !== 'function') return null;
            try {
                const list = await api.listControllers();
                const hit = (Array.isArray(list) ? list : []).find((c) => c && c.controllerKey === controllerKey);
                return (hit && hit.kind) || null;
            } catch (_) {
                return null;
            }
        },
        setupHref() {
            const api = fiveFretApi();
            if (api && typeof api.openControls === 'function') api.openControls({ returnTo: 'plugin-build_a_band' });
        },
        laneRenderer: () => globalThis.window?.feedBackViz_five_fret || null,
        eventPrefix: 'five_fret',
        pin(laneCanvas, controllerKey, opts) {
            const api = fiveFretApi();
            if (!api || typeof api.setLane !== 'function') return false;
            return !!api.setLane(laneCanvas, { controllerKey, ...opts });
        },
        unpin(laneCanvas) {
            const api = fiveFretApi();
            if (api && typeof api.clearLane === 'function') api.clearLane(laneCanvas);
        },
        partFor: fiveFretPartFor,
        judgments: Object.freeze(['hit', 'miss', 'overstrum', 'sustain-end']),
        entry: fiveFretEntry,
    },
};

export function isControllerId(id) {
    return typeof id === 'string' && /^ctl\d+$/.test(id);
}

// The smallest free ctl<N>, N >= 1.
export function nextPlayerId(controllers) {
    const used = new Set((Array.isArray(controllers) ? controllers : []).map((c) => c && c.id));
    let n = 1;
    while (used.has('ctl' + n)) n++;
    return 'ctl' + n;
}

// Lead, then Bass, then Rhythm: the first no other controller holds, else Lead (shared).
export function defaultPart(controllers) {
    const held = new Set((Array.isArray(controllers) ? controllers : []).map((c) => c && c.part));
    return ['guitar', 'bass', 'rhythm'].find((p) => !held.has(p)) || 'guitar';
}

// The kind a controller plays as: an explicit choice that names a registered kind,
// else five_fret while that is the only kind.
export function kindFor(prefs, controllerKey) {
    const kinds = prefs && prefs.controllerKinds;
    const k = kinds && Object.prototype.hasOwnProperty.call(kinds, controllerKey) ? kinds[controllerKey] : null;
    return typeof k === 'string' && Object.prototype.hasOwnProperty.call(CONTROLLER_KINDS, k) ? k : 'five_fret';
}

export function joinController(controllers, { controllerKey, name } = {}) {
    const list = Array.isArray(controllers) ? controllers : [];
    if (typeof controllerKey !== 'string' || !controllerKey) return list.slice();
    if (list.some((c) => c && c.key === controllerKey)) return list.slice();
    return [...list, {
        key: controllerKey, id: nextPlayerId(list), name: typeof name === 'string' ? name : '',
        playsAs: 'five_fret', part: defaultPart(list), difficulty: DIFFICULTIES[1],
        lefty: false, partAudio: PART_AUDIO_MODES[0], on: true,
    }];
}

export function leaveController(controllers, key) {
    return (Array.isArray(controllers) ? controllers : []).filter((c) => !c || c.key !== key);
}

export function updateController(controllers, key, patch) {
    const p = patch && typeof patch === 'object' ? patch : {};
    return (Array.isArray(controllers) ? controllers : []).map((c) => (c && c.key === key ? { ...c, ...p } : c));
}
