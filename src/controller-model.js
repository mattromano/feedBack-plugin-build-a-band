// Controller players: pure data helpers for the Build-a-Band join list. A controller
// player is `ctl<N>` in `prefs.controllers`, next to the fixed guitar / drums / vocals
// ids. No DOM, and nothing here reads `window` at import time.
import { DIFFICULTIES, drumsDifficultyId } from './mappings.js';
import { fiveFretPartFor, drumsControllerPartFor } from './parts.js';
import { fiveFretEntry, drumsEntry } from './part-events.js';

export const FIVE_FRET_PART_LABELS = Object.freeze({ guitar: 'Lead', rhythm: 'Rhythm', bass: 'Bass' });
export const PART_AUDIO_MODES = Object.freeze(['rockband', 'always']);

// Everything a controller kind needs from its plugin, behind one entry per kind (the
// Plan 6 seam: it adds `drums`). Every accessor reads the plugin's global when it is
// called, never at module start, so a missing or late-loading plugin only degrades.
//   api()                       the plugin's public band API, or null
//   resolveBinding(key)         Promise of the controller's binding kind, or null
//   setupHref()                 opens the plugin's controls screen and returns to this one
//   laneRenderer()              the plugin's highway renderer, or null
//   laneArrangement(plan, song) the arrangement a lane's WS streams (plan: planStage's)
//   eventPrefix                 bus event prefix: `<prefix>:band-pause` etc.
//   lights                      join-screen light -> the mapper actions that light it (any held)
//   pickButton                  the standard-pad raw button that picks this kind for an undecided pad
//   canPin(api)                 optional: whether the API can pin a lane (else the controller sits out at Go)
//   pin(canvas, key, opts)      pins a lane (opts: part, difficulty, lefty); false when the API is missing
//   unpin(canvas)               releases the lane
//   partFor(item, c, opts)      the part this controller plays on the song ({ instrument, kind }), or null
//   judgments                   the band-event suffixes that are judgments (`<prefix>:<suffix>`)
//   entry(type, detail, t, id, last)  a judgment's band score entry (part-events.js)
//   thresholds                  optional: 'largest' re-reads the lane's star thresholds on every
//                               judgment and keeps the full chart's (M6); default: the first set
const fiveFretApi = () => globalThis.window?.feedBackFiveFret || null;
const drumsApi = () => globalThis.window?.feedBackDrums || null;

// The binding kind the plugin's controller listing gives the key, or null.
async function listedKind(api, controllerKey) {
    if (!api || typeof api.listControllers !== 'function') return null;
    try {
        const list = await api.listControllers();
        const hit = (Array.isArray(list) ? list : []).find((c) => c && c.controllerKey === controllerKey);
        return (hit && hit.kind) || null;
    } catch (_) {
        return null;
    }
}

export const CONTROLLER_KINDS = {
    five_fret: {
        label: '5-Fret',
        parts: ['guitar', 'rhythm', 'bass'],
        api: fiveFretApi,
        resolveBinding: (controllerKey) => listedKind(fiveFretApi(), controllerKey),
        setupHref() {
            const api = fiveFretApi();
            if (api && typeof api.openControls === 'function') api.openControls({ returnTo: 'plugin-build_a_band' });
        },
        laneRenderer: () => globalThis.window?.feedBackViz_five_fret || null,
        // Core streams every 5-fret part on any arrangement: the song's current one.
        laneArrangement: (plan, song) => song && song.arrangementIndex,
        eventPrefix: 'five_fret',
        lights: Object.freeze({
            green: ['green'], red: ['red'], yellow: ['yellow'], blue: ['blue'], orange: ['orange'],
            strum: ['strum_up', 'strum_down'],
        }),
        pickButton: 2, // X
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
    // Plan 6: a game controller or plastic kit on its own drum lane (feedBackDrums
    // setController). It scores like the real drummer (Decision 15): drumsEntry
    // with its player id, on the lane canvas the event came from.
    drums: {
        label: 'Drums',
        parts: ['drums'],
        api: drumsApi,
        resolveBinding: (controllerKey) => listedKind(drumsApi(), controllerKey),
        setupHref() {
            const api = drumsApi();
            if (api && typeof api.openControls === 'function') api.openControls({ returnTo: 'plugin-build_a_band' });
        },
        laneRenderer: () => globalThis.window?.feedBackViz_drums || null,
        // The real drum lane's arrangement (a drum arrangement, else the drum tab's carrier).
        laneArrangement: (plan) => plan && plan.laneArrangement,
        eventPrefix: 'drums',
        lights: Object.freeze({
            red: ['red_pad'], yellow: ['yellow_pad', 'yellow_cymbal'], blue: ['blue_pad', 'blue_cymbal'],
            green: ['green_pad', 'green_cymbal'], kick: ['kick'],
        }),
        pickButton: 1, // B
        canPin: (api) => !!api && typeof api.setController === 'function',
        pin(laneCanvas, controllerKey, opts) {
            const api = drumsApi();
            if (!api || typeof api.setController !== 'function') return false;
            if (!api.setController(controllerKey, laneCanvas)) return false;
            if (typeof api.setDifficulty === 'function') api.setDifficulty(drumsDifficultyId(opts && opts.difficulty), laneCanvas);
            return true;
        },
        unpin(laneCanvas) {
            const api = drumsApi();
            if (!api) return;
            if (typeof api.clearController === 'function') api.clearController(laneCanvas);
            if (typeof api.clearDifficulty === 'function') api.clearDifficulty(laneCanvas);
        },
        partFor: drumsControllerPartFor,
        judgments: Object.freeze(['hit', 'miss', 'overhit']),
        entry: (type, detail, t, id) => drumsEntry(type, detail, t, detail && detail.canvas, id),
        // Its engine rebuilds from a seek with the rest of the chart's thresholds (M6).
        thresholds: 'largest',
    },
};

const isKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(CONTROLLER_KINDS, k);

// The part a kind starts on: Drums plays drums; 5-Fret takes the first free part.
function partForKind(kind, others) {
    if (kind === 'drums') return 'drums';
    if (kind === 'five_fret') return defaultPart(others);
    return null;
}

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

// The kinds a controller can play as (Decision 12), 5-Fret first, from each plugin's
// binding kind for it (null when the plugin is missing or has no binding):
// a drum kit plays drums only, a guitar 5-Fret only (both when it is also set up as a
// kit), a plain gamepad either.
export function playableKinds(fiveFretKind, drumsKind) {
    if (fiveFretKind === 'guitar' && drumsKind === 'kit') return ['five_fret', 'drums'];
    if (drumsKind === 'kit') return ['drums'];
    if (fiveFretKind === 'guitar') return ['five_fret'];
    return [fiveFretKind ? 'five_fret' : null, drumsKind ? 'drums' : null].filter(Boolean);
}

// The kind a controller plays as: its joined entry's playsAs, else its explicit
// remembered choice (prefs.controllerKinds), else the only kind in `playable`
// (default: every registered kind), else null (undecided).
export function kindFor(prefs, controllerKey, playable = Object.keys(CONTROLLER_KINDS)) {
    const list = prefs && Array.isArray(prefs.controllers) ? prefs.controllers : [];
    const entry = list.find((c) => c && c.key === controllerKey);
    if (entry && isKind(entry.playsAs)) return entry.playsAs;
    const kinds = prefs && prefs.controllerKinds;
    const k = kinds && Object.prototype.hasOwnProperty.call(kinds, controllerKey) ? kinds[controllerKey] : null;
    if (isKind(k)) return k;
    const only = Array.isArray(playable) ? playable.filter(isKind) : [];
    return only.length === 1 ? only[0] : null;
}

// kinds: the playable kinds (playableKinds); one plays as that, two as the remembered
// choice (the caller passes prefs.controllerKinds[key]) else undecided (null). The
// join manager's onJoin gives `kinds`; the default suits a 5-Fret-only caller.
export function joinController(controllers, { controllerKey, name, kinds = ['five_fret'], remembered } = {}) {
    const list = Array.isArray(controllers) ? controllers : [];
    if (typeof controllerKey !== 'string' || !controllerKey) return list.slice();
    if (list.some((c) => c && c.key === controllerKey)) return list.slice();
    const playable = Array.isArray(kinds) ? kinds.filter(isKind) : [];
    const playsAs = playable.length === 1 ? playable[0] : (playable.includes(remembered) ? remembered : null);
    return [...list, {
        key: controllerKey, id: nextPlayerId(list), name: typeof name === 'string' ? name : '',
        playsAs, part: partForKind(playsAs, list), difficulty: DIFFICULTIES[1],
        lefty: false, partAudio: PART_AUDIO_MODES[0], soundMode: 'rockband', on: true,
    }];
}

// Changes what a joined controller plays as, its part reset to the kind's default.
// The caller also saves the choice: prefs.controllerKinds[key] = kind.
export function setPlaysAs(controllers, key, kind) {
    const list = Array.isArray(controllers) ? controllers : [];
    if (!isKind(kind)) return list.slice();
    const others = list.filter((c) => !c || c.key !== key);
    return list.map((c) => (c && c.key === key ? { ...c, playsAs: kind, part: partForKind(kind, others) } : c));
}

export function leaveController(controllers, key) {
    return (Array.isArray(controllers) ? controllers : []).filter((c) => !c || c.key !== key);
}

export function updateController(controllers, key, patch) {
    const p = patch && typeof patch === 'object' ? patch : {};
    return (Array.isArray(controllers) ? controllers : []).map((c) => (c && c.key === key ? { ...c, ...p } : c));
}
