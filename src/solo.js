// Solo play (the library's "Play as" 5-Fret / Drums entries): one controller player
// on the RockHeroSmith stage, so a song played alone gets everything a band gets
// (stems dropping out on misses, the HUD, overdrive, results). The solo band is
// built for that one session from the saved prefs and never saved: the viewer's
// band setup stays as it is.
import { normalizePrefs } from './prefs.js';
import { CONTROLLER_KINDS } from './controller-model.js';
import { DIFFICULTIES } from './mappings.js';

const SOLO_ID = 'ctl1';

// The session prefs for one controller player: every fixed part off, the saved
// look (split, zoom, full screen, fail mode) kept.
// opts: { kind: 'five_fret' | 'drums', part?, difficulty?, controllerKey, name? }
export function soloPrefs(saved, { kind, part, difficulty, controllerKey, name } = {}) {
    const base = normalizePrefs(saved);
    const def = CONTROLLER_KINDS[kind];
    if (!def || typeof controllerKey !== 'string' || !controllerKey) return null;
    const off = (p) => ({ ...p, on: false });
    return normalizePrefs({
        ...base,
        parts: { guitar: off(base.parts.guitar), drums: off(base.parts.drums), vocals: off(base.parts.vocals) },
        controllers: [{
            key: controllerKey, id: SOLO_ID, name: name || '', playsAs: kind,
            part: def.parts.includes(part) ? part : def.parts[0],
            difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'medium',
            partAudio: 'rockband', soundMode: 'rockband', on: true,
        }],
    });
}

// The controller to play on: the first connected one the kind's plugin can play
// (a saved binding or a standard pad), free ones first. -> { controllerKey, name } | null
export async function pickSoloController(kind, kinds = CONTROLLER_KINDS) {
    const def = kinds[kind];
    const api = def && def.api();
    if (!api || typeof api.listControllers !== 'function') return null;
    let list;
    try { list = await api.listControllers(); } catch (_) { return null; }
    const usable = (Array.isArray(list) ? list : []).filter((c) => c && c.connected && c.kind && c.controllerKey);
    const pick = usable.find((c) => !c.claimedBy) || usable[0];
    return pick ? { controllerKey: pick.controllerKey, name: pick.name || '' } : null;
}

// createSoloPlay({ getRuntime, getScreen, loadPrefs, showScreen, kinds? })
//   -> playSolo(item, { kind, part?, difficulty? }) -> Promise<'started' | 'setup' | false>
// 'setup': no usable controller (or the runtime refused), so the band screen opened
// with the song; false: a session is already running or the item has no file.
export function createSoloPlay({ getRuntime, getScreen, loadPrefs, showScreen, kinds = CONTROLLER_KINDS }) {
    function toSetup(item) {
        const screen = getScreen();
        if (screen && typeof screen.openWithSong === 'function') screen.openWithSong(item);
        showScreen('plugin-rockherosmith');
        return 'setup';
    }
    return async function playSolo(item, opts = {}) {
        if (!item || typeof item.filename !== 'string' || !item.filename) return false;
        const rt = getRuntime();
        if (!rt || typeof rt.startSession !== 'function') return false;
        if (typeof rt.phase === 'function' && rt.phase() !== 'idle') return false;
        const ctl = await pickSoloController(opts.kind, kinds);
        if (!ctl) return toSetup(item);
        const prefs = soloPrefs(loadPrefs(), { ...opts, ...ctl });
        if (!prefs) return toSetup(item);
        const started = rt.startSession({ song: item, prefs });
        if (started === false) return toSetup(item);
        await started;
        return 'started';
    };
}
