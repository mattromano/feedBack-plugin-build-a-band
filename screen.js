// RockHeroSmith entry point. The stage and its player wiring live in src/*;
// this file only boots the runtime when a browser window exists, so importing
// it under node stays side-effect free.
import { loadPrefs, savePrefs } from './src/prefs.js';
import { mountStage } from './src/stage.js';
import { createBandRuntime } from './src/band-runtime.js';
import { createBandScreen } from './src/band-screen.js';

export { loadPrefs, savePrefs };

function init() {
    const fb = window.feedBack;
    if (!fb || typeof fb.on !== 'function') return;
    // Re-running this module (plugin reload) must not stack listeners or
    // leave a stage behind: tear the previous runtime down first.
    const prev = window.__rockherosmithRuntime || window.__buildABandRuntime;
    if (prev && typeof prev.dispose === 'function') {
        try { prev.dispose(); } catch (_) { /* ignore */ }
    }
    // Inputs already handed to note_detect / drums, shared by the band screen
    // (device picks) and the runtime (Go), so neither re-applies the other's.
    const deviceMemo = {};
    const runtime = createBandRuntime({ win: window, doc: document, mountStage, loadPrefs, deviceMemo,
        // Next song: the band screen opens the library pick (nextSong picks now or on its next show).
        onShowBandScreen: () => {
            const bs = window.__rockherosmithScreen;
            if (bs && typeof bs.nextSong === 'function') bs.nextSong();
        },
    });
    window.__rockherosmithRuntime = runtime;
    // Deprecated alias (one release, remove after 0.2.x): stale peers may still read the old name.
    window.__buildABandRuntime = runtime;

    const prevScreen = window.__rockherosmithScreen || window.__buildABandScreen;
    if (prevScreen && typeof prevScreen.dispose === 'function') {
        try { prevScreen.dispose(); } catch (_) { /* ignore */ }
    }
    window.__rockherosmithScreen = null;
    // Deprecated alias (one release, remove after 0.2.x): stale peers may still read the old name.
    window.__buildABandScreen = null;
    // screen.html is inserted before this module runs, so the root exists now.
    const root = document.getElementById('rockherosmith-root');
    if (root) {
        window.__rockherosmithScreen = createBandScreen({
            root, win: window, doc: document, loadPrefs, savePrefs, deviceMemo,
            onGo: (item, prefs) => {
                savePrefs(prefs);
                // false or a rejection releases the band screen's Go latch.
                return runtime.startSession({ song: item, prefs });
            },
        });
    // Deprecated alias (one release, remove after 0.2.x): stale peers may still read the old name.
        window.__buildABandScreen = window.__rockherosmithScreen;
    }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') init();
