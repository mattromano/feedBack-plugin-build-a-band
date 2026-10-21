// Build-a-Band entry point. The stage logic lives in src/*; this file wires a
// temporary "Band" toggle into the player (replaced by the band screen flow in
// plan 2) and the auto-unmount triggers. Browser wiring only runs when a
// window exists, so importing this under node stays side-effect free.
import { loadPrefs, savePrefs } from './src/prefs.js';
import { mountStage } from './src/stage.js';

export { loadPrefs, savePrefs };

const BTN_ID = 'bab-band-btn';

function playerSlot() {
    const fb = window.feedBack;
    return (fb && fb.uiVersion === 'v3' && fb.ui && typeof fb.ui.playerControlSlot === 'function')
        ? fb.ui.playerControlSlot() : null;
}

function init() {
    const fb = window.feedBack;
    if (!fb || typeof fb.on !== 'function') return;

    // Re-running this module (plugin reload) must not stack listeners or
    // leave a stage behind: tear the previous runtime down first.
    const prev = window.__buildABandRuntime;
    if (prev && typeof prev.dispose === 'function') {
        try { prev.dispose(); } catch (_) { /* ignore */ }
    }

    let stage = null;

    function updateBtn() {
        const btn = document.getElementById(BTN_ID);
        if (btn) btn.setAttribute('aria-pressed', stage ? 'true' : 'false');
    }

    function unmount() {
        if (!stage) return;
        const s = stage;
        stage = null;
        try { s.unmount(); } catch (e) { console.error('[build-a-band] unmount failed', e); }
        updateBtn();
    }

    function mount() {
        const player = document.getElementById('player');
        const song = fb.currentSong;
        if (!player || !song || !song.filename || !window.highway) return;
        unmount();
        try {
            stage = mountStage({ player, song, prefs: loadPrefs() });
        } catch (e) {
            console.error('[build-a-band] stage failed to mount', e);
            stage = null;
        }
        updateBtn();
    }

    function toggle() { if (stage) unmount(); else mount(); }

    function injectButton() {
        const slot = playerSlot();
        const host = slot || document.getElementById('player-controls');
        if (!host) return;
        let btn = document.getElementById(BTN_ID);
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = BTN_ID;
            btn.className = 'bab-band-btn px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-300 transition';
            btn.textContent = 'Band';
            btn.title = 'Toggle the Build-a-Band stage (guitar + drums)';
        }
        // (Re)bind on every inject so a reloaded runtime owns the click.
        btn.onclick = (e) => { e.stopPropagation(); toggle(); };
        if (!host.contains(btn)) host.appendChild(btn);
        updateBtn();
    }

    const onSongLoading = () => unmount();
    const onSongStop = () => unmount();
    const onScreenChanging = (e) => {
        const d = (e && e.detail) || {};
        if (d.from === 'player' && d.id !== 'player') unmount();
    };
    const onSongLoaded = () => injectButton();

    fb.on('song:loading', onSongLoading);
    fb.on('song:stop', onSongStop);
    fb.on('screen:changing', onScreenChanging);
    fb.on('song:loaded', onSongLoaded);
    fb.on('song:ready', onSongLoaded);
    injectButton();

    window.__buildABandRuntime = {
        dispose() {
            unmount();
            fb.off('song:loading', onSongLoading);
            fb.off('song:stop', onSongStop);
            fb.off('screen:changing', onScreenChanging);
            fb.off('song:loaded', onSongLoaded);
            fb.off('song:ready', onSongLoaded);
        },
        isMounted: () => !!stage,
    };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') init();
