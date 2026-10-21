// The app sidebar over the stage (plan 7 R7, R8). While body.bab-sidebar-open is set,
// the plugin CSS shows #v3-sidebar fixed above #player. Opening it never pauses.
// While open it is a modal dialog (role="dialog", aria-modal="true"), so drum keys
// stand down under it (plan 7 R14); closing puts the earlier attributes back.
// Nav links are taken over in the capture phase and handed to onNavigate; follow()
// re-clicks one with the takeover bypassed so shell's own handler runs.
const OPEN_CLASS = 'bab-sidebar-open';
const MODAL_ATTRS = [['role', 'dialog'], ['aria-modal', 'true']];

function contains(root, node) {
    for (let n = node; n; n = n.parentNode) if (n === root) return true;
    return false;
}

// createSidebarOverlay({ doc, onNavigate })
//   -> { open(via), close(), toggle(via), isOpen(), follow(link), destroy() }
export function createSidebarOverlay({ doc, onNavigate }) {
    const sidebar = doc.getElementById('v3-sidebar');
    let open = false;
    let byEdge = false;
    let following = false;
    let destroyed = false;
    let saved = null;

    function onClick(e) {
        if (following) return;
        const t = e && e.target;
        const link = t && typeof t.closest === 'function' ? t.closest('a[data-v3-nav]') : null;
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof onNavigate === 'function') onNavigate(link, link.getAttribute('data-v3-nav'));
    }
    function onPointerDown(e) {
        if (open && !contains(sidebar, e && e.target)) close();
    }
    function onLeave() { close(); }

    function setEdge(on) {
        if (on === byEdge) return;
        byEdge = on;
        if (on) sidebar.addEventListener('pointerleave', onLeave);
        else sidebar.removeEventListener('pointerleave', onLeave);
    }

    if (sidebar) {
        sidebar.addEventListener('click', onClick, true);
        doc.addEventListener('pointerdown', onPointerDown, true);
    }

    function openIt(via = 'menu') {
        if (!sidebar || destroyed) return false;
        if (open) {
            // A menu open makes an edge-opened sidebar stay.
            if (via !== 'edge') setEdge(false);
            return true;
        }
        open = true;
        saved = MODAL_ATTRS.map(([k]) => [k, sidebar.getAttribute(k)]);
        for (const [k, v] of MODAL_ATTRS) sidebar.setAttribute(k, v);
        doc.body.classList.add(OPEN_CLASS);
        setEdge(via === 'edge');
        return true;
    }

    function close() {
        if (!open) return;
        open = false;
        setEdge(false);
        for (const [k, v] of saved) {
            if (v === null) sidebar.removeAttribute(k);
            else sidebar.setAttribute(k, v);
        }
        saved = null;
        doc.body.classList.remove(OPEN_CLASS);
    }

    return {
        open: openIt,
        close,
        toggle(via) {
            if (open) close();
            else openIt(via);
            return open;
        },
        isOpen: () => open,
        follow(link) {
            following = true;
            try { link.click(); } finally { following = false; }
            close();
        },
        destroy() {
            if (destroyed) return;
            close();
            destroyed = true;
            if (sidebar) {
                sidebar.removeEventListener('click', onClick, true);
                doc.removeEventListener('pointerdown', onPointerDown, true);
            }
        },
    };
}
