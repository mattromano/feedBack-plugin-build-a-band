// Build-a-Band per-viewer prefs, persisted in localStorage. Every storage
// access is guarded: private windows / blocked storage must never throw.
const KEY = 'build_a_band.prefs.v1';
const DEFAULTS = Object.freeze({ split: 62 });

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
