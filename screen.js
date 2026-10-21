// Build-a-Band entry point. The stage and its player wiring live in src/*;
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
    const prev = window.__buildABandRuntime;
    if (prev && typeof prev.dispose === 'function') {
        try { prev.dispose(); } catch (_) { /* ignore */ }
    }
    const runtime = createBandRuntime({ win: window, doc: document, mountStage, loadPrefs });
    window.__buildABandRuntime = runtime;

    const prevScreen = window.__buildABandScreen;
    if (prevScreen && typeof prevScreen.dispose === 'function') {
        try { prevScreen.dispose(); } catch (_) { /* ignore */ }
    }
    window.__buildABandScreen = null;
    // screen.html is inserted before this module runs, so the root exists now.
    const root = document.getElementById('build-a-band-root');
    if (root) {
        window.__buildABandScreen = createBandScreen({
            root, win: window, doc: document, loadPrefs, savePrefs,
            onGo: (item, prefs) => {
                savePrefs(prefs);
                runtime.startSession({ song: item, prefs });
            },
        });
    }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') init();
