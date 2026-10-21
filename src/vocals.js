// Vocals helpers. Pure, no DOM.
import { vocalsDifficultyId } from './mappings.js';
import { applyMicDevice } from './devices.js';
const REQUIRED_FNS = ['mountStrip', 'setKaraokeMode', 'startMic', 'stopMic', 'setDifficulty', 'setHearMyself'];

// The Lyrics Karaoke plugin's public API, or null when it is missing, too old
// or incomplete. Checked at every use: plugin load order isn't fixed.
export function karaokeApi(win) {
    try {
        const api = win && win.lyricsKaraoke;
        if (!api || typeof api !== 'object') return null;
        if (!(api.apiVersion >= 1)) return null;
        if (!REQUIRED_FNS.every((name) => typeof api[name] === 'function')) return null;
        return api;
    } catch (_) {
        return null;
    }
}

// Runs fn, ignoring a throw so the next call still happens.
function guard(fn) {
    try { fn(); } catch (_) { /* keep going */ }
}

// Before playSong: the scorer built on song load already uses these.
// Returns whether the mic is safe to open: false when hear-myself is wanted
// off but karaoke didn't take it (threw, refused or lacks the setter), since
// karaoke's own default is on and would route the mic to the speakers.
export function armVocals(api, vocalsPrefs) {
    const hear = !!vocalsPrefs.hearMyself;
    guard(() => api.setDifficulty(vocalsDifficultyId(vocalsPrefs.difficulty)));
    let applied = false;
    try {
        applied = typeof api.setHearMyself === 'function' && api.setHearMyself(hear) !== false;
    } catch (_) { /* not applied */ }
    // The band HUD replaces karaoke's own score HUD (plan 4 R13).
    guard(() => { if (typeof api.setScoreHudHidden === 'function') api.setScoreHudHidden(true); });
    return hear || applied;
}

// The latest start per karaoke API: a cancelled start only turns karaoke off
// when no newer start has claimed it since.
const latestStart = new WeakMap();

// After the stage mounts. Re-checks isCurrent() after every await so a session
// that ended meanwhile never opens (or keeps) the mic.
export async function startVocals({ api, slot, deviceId, storage, isCurrent }) {
    const token = {};
    try { latestStart.set(api, token); } catch (_) { /* not an object */ }
    try {
        api.mountStrip(slot);
        const ok = await api.setKaraokeMode(true);
        if (!isCurrent()) {
            // Teardown's setKaraokeMode(false) can run before this one lands.
            if (ok && latestStart.get(api) === token) offKaraoke(api);
            return 'cancelled';
        }
        if (!ok) return 'no-pitch';
        applyMicDevice(deviceId, storage);
        const state = await api.startMic();
        if (!isCurrent()) {
            guard(() => api.stopMic());
            return 'cancelled';
        }
        return state === 'listening' ? 'started' : 'mic-error';
    } catch (_) {
        return 'mic-error';
    }
}

// Karaoke mode off, ignoring a throw or a rejection.
function offKaraoke(api) {
    guard(() => {
        const p = api.setKaraokeMode(false);
        if (p && typeof p.catch === 'function') p.catch(() => {});
    });
}

// Teardown, before the stage unmounts. Each step is guarded.
export function stopVocals(api) {
    guard(() => api.stopMic());
    offKaraoke(api);
    guard(() => api.mountStrip(null));
    guard(() => api.setDifficulty(null));
    guard(() => api.setHearMyself(null));
    guard(() => { if (typeof api.setScoreHudHidden === 'function') api.setScoreHudHidden(false); });
}
