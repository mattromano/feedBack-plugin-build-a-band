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
export function armVocals(api, vocalsPrefs) {
    guard(() => api.setDifficulty(vocalsDifficultyId(vocalsPrefs.difficulty)));
    guard(() => api.setHearMyself(!!vocalsPrefs.hearMyself));
}

// After the stage mounts. Re-checks isCurrent() after every await so a session
// that ended meanwhile never opens (or keeps) the mic.
export async function startVocals({ api, slot, deviceId, storage, isCurrent }) {
    try {
        api.mountStrip(slot);
        const ok = await api.setKaraokeMode(true);
        if (!isCurrent()) return 'cancelled';
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

// Teardown, before the stage unmounts. Each step is guarded.
export function stopVocals(api) {
    guard(() => api.stopMic());
    guard(() => {
        const p = api.setKaraokeMode(false);
        if (p && typeof p.catch === 'function') p.catch(() => {});
    });
    guard(() => api.mountStrip(null));
    guard(() => api.setDifficulty(null));
    guard(() => api.setHearMyself(null));
}
