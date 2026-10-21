// Build-a-Band player wiring: the temporary "Band" toggle (replaced by the
// band screen flow in plan 2) and the stage's auto-unmount triggers.
// Everything is injected, so this is testable under node; screen.js passes
// the real window/document.
const BTN_ID = 'bab-band-btn';

function playerSlot(fb) {
    return (fb && fb.uiVersion === 'v3' && fb.ui && typeof fb.ui.playerControlSlot === 'function')
        ? fb.ui.playerControlSlot() : null;
}

// createBandRuntime({ win, doc, mountStage, loadPrefs }) -> { dispose(), isMounted(), toggle() }
export function createBandRuntime({ win, doc, mountStage, loadPrefs }) {
    const fb = win.feedBack;
    let stage = null;
    // Between song:loading and song:loaded, feedBack.currentSong still
    // describes the previous song, so the toggle does nothing (button disabled).
    let loading = false;

    function updateBtn() {
        const btn = doc.getElementById(BTN_ID);
        if (!btn) return;
        btn.setAttribute('aria-pressed', stage ? 'true' : 'false');
        btn.disabled = loading;
    }

    function unmount() {
        if (!stage) return;
        const s = stage;
        stage = null;
        try { s.unmount(); } catch (e) { console.error('[build-a-band] unmount failed', e); }
        updateBtn();
    }

    function mount() {
        if (loading) return;
        const player = doc.getElementById('player');
        const song = fb.currentSong;
        if (!player || !song || !song.filename || !win.highway) return;
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
        const slot = playerSlot(fb);
        const host = slot || doc.getElementById('player-controls');
        if (!host) return;
        let btn = doc.getElementById(BTN_ID);
        if (!btn) {
            btn = doc.createElement('button');
            btn.type = 'button';
            btn.id = BTN_ID;
            btn.className = 'bab-band-btn px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-300 transition';
            btn.textContent = 'Band';
            btn.title = 'Toggle the Build-a-Band stage (guitar + drums)';
        }
        // (Re)bind on every inject so a reloaded runtime owns the click.
        btn.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); toggle(); };
        if (!host.contains(btn)) host.appendChild(btn);
        updateBtn();
    }

    const handlers = {
        'song:loading': () => { loading = true; unmount(); updateBtn(); },
        'song:loaded': () => { loading = false; injectButton(); },
        'song:ready': () => injectButton(),
        'song:stop': () => unmount(),
        'screen:changing': (e) => {
            const d = (e && e.detail) || {};
            if (d.from === 'player' && d.id !== 'player') unmount();
        },
        // Band mode and splitscreen never run at once: if splitscreen comes up
        // while the stage is mounted, the stage yields.
        'splitscreen:panels-changed': () => {
            const ss = win.slopsmithSplitscreen;
            let on = false;
            try { on = !!(ss && typeof ss.isActive === 'function' && ss.isActive()); } catch (_) { /* ignore */ }
            if (on) unmount();
        },
    };
    for (const [ev, fn] of Object.entries(handlers)) fb.on(ev, fn);
    injectButton();

    return {
        dispose() {
            unmount();
            for (const [ev, fn] of Object.entries(handlers)) fb.off(ev, fn);
        },
        isMounted: () => !!stage,
        toggle,
    };
}
