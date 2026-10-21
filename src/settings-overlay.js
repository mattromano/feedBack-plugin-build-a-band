// Settings over the paused song (plan 7 R9, R12). #settings shows fixed over #player
// while body.bab-settings-over is set; the active screen stays the player, so nothing
// tears the song down. As a modal dialog it makes core's shortcuts skip keys inside
// it, gamepad-nav keep focus in it and drums stand down. Core's own back button is
// hidden by the CSS; ours goes first and takes focus. Esc closes; the player's keys
// aimed at the page behind are swallowed; media keys are held.
import { holdMediaKeys } from './media-keys.js';
import { PLAYER_KEYS } from './results-screen.js';

const OVER_CLASS = 'bab-settings-over';
const DIALOG_ATTRS = [['role', 'dialog'], ['aria-modal', 'true'], ['aria-label', 'Settings']];

function contains(root, node) {
    for (let n = node; n; n = n.parentNode) if (n === root) return true;
    return false;
}

const warn = (e) => { console.warn('[build-a-band] loadSettings failed', e); };

// openSettingsOverlay({ doc, win, onClose }) -> { kind: 'settings', close({ silent }) } | null
export function openSettingsOverlay({ doc, win, onClose }) {
    const settings = doc.getElementById('settings');
    if (!settings) return null;

    const saved = DIALOG_ATTRS.map(([k]) => [k, settings.getAttribute(k)]);
    for (const [k, v] of DIALOG_ATTRS) settings.setAttribute(k, v);
    doc.body.classList.add(OVER_CLASS);

    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'bab-settings-back';
    back.textContent = 'Back to the song';
    back.addEventListener('click', () => close());
    settings.prepend(back);
    try { back.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ }

    if (typeof win.loadSettings === 'function') {
        try {
            const r = win.loadSettings();
            if (r && typeof r.then === 'function') r.then(null, warn);
        } catch (e) { warn(e); }
    }

    const releaseMedia = holdMediaKeys(win.navigator);

    function onKey(e) {
        if (!e) return;
        if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
        }
        if ((PLAYER_KEYS.has(e.key) || e.code === 'Space') && !contains(settings, e.target)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
    win.addEventListener('keydown', onKey, true);

    let shown = true;
    function close({ silent } = {}) {
        if (!shown) return;
        shown = false;
        win.removeEventListener('keydown', onKey, true);
        releaseMedia();
        back.remove();
        for (const [k, v] of saved) {
            if (v === null) settings.removeAttribute(k);
            else settings.setAttribute(k, v);
        }
        doc.body.classList.remove(OVER_CLASS);
        if (!silent && typeof onClose === 'function') onClose();
    }

    return { kind: 'settings', close };
}
