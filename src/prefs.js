// Build-a-Band per-viewer prefs, persisted in localStorage. Every storage
// access is guarded: private windows / blocked storage must never throw.
import { DIFFICULTIES } from './mappings.js';

const KEY = 'build_a_band.prefs.v1';

// labelScale: the guitar lane's fret-number size in band mode, kept apart from
// core's solo-play `highwayLabelScale` so neither leaks into the other.
const DEFAULTS = Object.freeze({ split: 62, labelScale: 1 });
const PART_DEFAULTS = Object.freeze({
    guitar: Object.freeze({ on: true, deviceKey: '', arrangement: 'Lead', difficulty: 'medium' }),
    drums: Object.freeze({ on: true, deviceKey: '', difficulty: 'medium', soundMode: 'song' }),
    vocals: Object.freeze({ on: true, deviceId: '', difficulty: 'medium', hearMyself: false }),
});
const ARRANGEMENTS = ['Lead', 'Rhythm', 'Bass'];
const SOUND_MODES = ['song', 'rockband', 'kit'];
const FAIL_MODES = ['nofail', 'fail'];
const MAX_RECENT = 10;
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

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const str = (v, d) => (typeof v === 'string' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

function normalizePart(id, raw) {
    const d = PART_DEFAULTS[id];
    const r = isObj(raw) ? raw : {};
    const out = { on: bool(r.on, d.on) };
    if (id === 'vocals') out.deviceId = str(r.deviceId, d.deviceId);
    else out.deviceKey = str(r.deviceKey, d.deviceKey);
    if (id === 'guitar') out.arrangement = oneOf(r.arrangement, ARRANGEMENTS, d.arrangement);
    out.difficulty = oneOf(r.difficulty, DIFFICULTIES, d.difficulty);
    if (id === 'drums') out.soundMode = oneOf(r.soundMode, SOUND_MODES, d.soundMode);
    if (id === 'vocals') out.hearMyself = bool(r.hearMyself, d.hearMyself);
    return out;
}

function normalizeSong(v) {
    if (!isObj(v) || typeof v.filename !== 'string' || !v.filename) return null;
    return { filename: v.filename, title: str(v.title, ''), artist: str(v.artist, '') };
}

function normalizeRecent(v) {
    const out = [];
    const seen = new Set();
    for (const e of Array.isArray(v) ? v : []) {
        const song = normalizeSong(e);
        if (!song || seen.has(song.filename)) continue;
        seen.add(song.filename);
        out.push(song);
        if (out.length >= MAX_RECENT) break;
    }
    return out;
}

// Validates every field; a bad value falls back to that field's default.
export function normalizePrefs(raw) {
    const r = isObj(raw) ? raw : {};
    const parts = isObj(r.parts) ? r.parts : {};
    return {
        split: Number.isFinite(r.split) ? r.split : DEFAULTS.split,
        labelScale: 'labelScale' in r ? clampLabelScale(r.labelScale) : DEFAULTS.labelScale,
        parts: {
            guitar: normalizePart('guitar', parts.guitar),
            drums: normalizePart('drums', parts.drums),
            vocals: normalizePart('vocals', parts.vocals),
        },
        failMode: oneOf(r.failMode, FAIL_MODES, 'nofail'),
        fullScreenStage: bool(r.fullScreenStage, true),
        lastSong: normalizeSong(r.lastSong),
        recentSongs: normalizeRecent(r.recentSongs),
    };
}

export function pushRecent(list, song) {
    const rest = (Array.isArray(list) ? list : []).filter((e) => e && e.filename !== song.filename);
    return [{ filename: song.filename, title: song.title, artist: song.artist }, ...rest].slice(0, MAX_RECENT);
}

export function loadPrefs(storage = defaultStorage()) {
    let parsed = null;
    try {
        const raw = storage && storage.getItem(KEY);
        parsed = raw ? JSON.parse(raw) : null;
    } catch (_) { /* fall back to defaults */ }
    return normalizePrefs(parsed);
}

export function savePrefs(patch, storage = defaultStorage()) {
    const cur = loadPrefs(storage);
    const p = isObj(patch) ? patch : {};
    const merged = { ...cur, ...p, parts: { ...cur.parts } };
    if (isObj(p.parts)) {
        for (const id of Object.keys(p.parts)) {
            if (isObj(p.parts[id])) merged.parts[id] = { ...cur.parts[id], ...p.parts[id] };
        }
    }
    const next = normalizePrefs(merged);
    try {
        if (storage) storage.setItem(KEY, JSON.stringify(next));
    } catch (_) { /* quota / denied: keep in-memory result */ }
    return next;
}
