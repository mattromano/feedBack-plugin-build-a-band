// Build-a-Band per-viewer prefs, persisted in localStorage. Every storage
// access is guarded: private windows / blocked storage must never throw.
const KEY = 'build_a_band.prefs.v1';
// labelScale: the guitar lane's fret-number size in band mode, kept apart from
// core's solo-play `highwayLabelScale` so neither leaks into the other.
const DEFAULTS = Object.freeze({ split: 62, labelScale: 1 });
export const LABEL_SCALE_MIN = 0.75;
export const LABEL_SCALE_MAX = 2.5;

// Same range core's setLabelScale clamps to. Non-numbers fall back to 1.
export function clampLabelScale(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULTS.labelScale;
    return Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, v));
}

function defaultStorage() {
    try { return globalThis.localStorage; } catch (_) { return undefined; }
}

export function loadPrefs(storage = defaultStorage()) {
    const prefs = { ...DEFAULTS };
    try {
        const raw = storage && storage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            if (Number.isFinite(parsed.split)) prefs.split = parsed.split;
            if ('labelScale' in parsed) prefs.labelScale = clampLabelScale(parsed.labelScale);
        }
    } catch (_) { /* fall back to defaults */ }
    return prefs;
}

export function savePrefs(patch, storage = defaultStorage()) {
    const next = { ...loadPrefs(storage), ...(patch || {}) };
    try {
        if (storage) storage.setItem(KEY, JSON.stringify(next));
    } catch (_) { /* quota / denied: keep in-memory result */ }
    return next;
}
