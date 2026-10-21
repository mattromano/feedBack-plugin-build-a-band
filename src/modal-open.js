// Shared by the stage overlays (plan 7 R9, R12): is some other modal up (core's
// _confirmDialog, a plugin dialog), and where focus goes back on close.

// otherModalOpen(doc, win, self): a visible [aria-modal="true"] or .feedBack-modal
// other than `self`. Visibility is checked as drums' _modalOpen does, so a dialog
// that stays mounted but hidden doesn't count.
export function otherModalOpen(doc, win, self) {
    try {
        if (!doc || typeof doc.querySelectorAll !== 'function') return false;
        const nodes = doc.querySelectorAll('[aria-modal="true"], .feedBack-modal');
        for (let i = 0; nodes && i < nodes.length; i++) {
            const n = nodes[i];
            if (!n || n === self) continue;
            if (n.hidden === true) continue;
            if (typeof n.closest === 'function' && n.closest('[hidden]')) continue;
            if (typeof n.getClientRects === 'function') {
                if (n.getClientRects().length === 0 && n.offsetParent === null) continue;
            } else if (n.offsetParent === null) continue;
            if (win && typeof win.getComputedStyle === 'function') {
                const cs = win.getComputedStyle(n);
                if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
            }
            return true;
        }
    } catch (_) { /* a broken check never blocks the overlay's keys */ }
    return false;
}

export function contains(root, node) {
    for (let n = node; n; n = n.parentNode) if (n === root) return true;
    return false;
}

function connected(doc, el) {
    if (typeof el.isConnected === 'boolean') return el.isConnected;
    return contains(doc.body, el);
}

function focus(el) {
    try { el.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ }
}

// restoreFocus(doc, el): focus `el` when it's still in the page, else the player (the
// stage root). #player is a plain div, so it gets tabindex="-1" when it has none, and
// that tabindex goes again once the player loses focus.
export function restoreFocus(doc, el) {
    if (el && typeof el.focus === 'function' && connected(doc, el)) { focus(el); return; }
    const player = doc.getElementById('player');
    if (!player || typeof player.focus !== 'function') return;
    if (!player.hasAttribute('tabindex')) {
        player.setAttribute('tabindex', '-1');
        const drop = () => {
            player.removeEventListener('blur', drop);
            player.removeAttribute('tabindex');
        };
        player.addEventListener('blur', drop);
    }
    focus(player);
}
