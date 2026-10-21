// Vocals helpers. Pure, no DOM.
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
