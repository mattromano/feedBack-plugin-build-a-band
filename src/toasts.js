// The toast stack: a .rhs-toasts column (role=status, aria-live=polite) in the host,
// at most `max` toasts, oldest dropped first. The same text already showing restarts
// its timer instead of stacking. The container is created on the first show and
// removed by clear().
export function createToastStack({ doc, getHost, setTimer, clearTimer, ttlMs = 4000, max = 3 }) {
    let box = null;
    const items = []; // { text, el, timer }, oldest first

    function drop(item) {
        const i = items.indexOf(item);
        if (i >= 0) items.splice(i, 1);
        clearTimer(item.timer);
        item.el.remove();
    }

    function arm(item) {
        clearTimer(item.timer);
        item.timer = setTimer(() => {
            item.timer = null;
            drop(item);
        }, ttlMs);
    }

    function show(text) {
        const t = String(text);
        const same = items.find((it) => it.text === t);
        if (same) { arm(same); return; }
        const host = getHost();
        if (!host) return;
        if (!box || box.parentNode !== host) {
            box = doc.createElement('div');
            box.className = 'rhs-toasts';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            host.appendChild(box);
        }
        const el = doc.createElement('div');
        el.className = 'rhs-toast';
        el.textContent = t;
        box.appendChild(el);
        const item = { text: t, el, timer: null };
        items.push(item);
        arm(item);
        while (items.length > max) drop(items[0]);
    }

    function clear() {
        for (const it of [...items]) drop(it);
        if (box) { box.remove(); box = null; }
    }

    return { show, clear, texts: () => items.map((it) => it.text) };
}
