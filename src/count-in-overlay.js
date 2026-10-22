// The band's 3-2-1 count-in. Draws only: it listens to core's count-in:tick {n, total}
// and count-in:hide {completed} and plays nothing (the clicks are core's own).
// Core counts up 1..total; the band shows total - n + 1, then ROCK! when completed.
const ROCK_MS = 600;

export function createCountInOverlay({ doc, bus, getHost, setTimer, clearTimer }) {
    let el = null;
    let timer = null;

    function cancelTimer() {
        if (timer !== null) { clearTimer(timer); timer = null; }
    }
    function remove() {
        cancelTimer();
        if (el) { el.remove(); el = null; }
    }
    function draw(text) {
        const host = getHost();
        if (!host) return;
        if (!el || el.parentNode !== host) {
            if (el) el.remove();
            el = doc.createElement('div');
            el.className = 'rhs-countin';
            el.setAttribute('aria-hidden', 'true');
            host.appendChild(el);
        }
        el.textContent = text;
    }

    const detail = (e) => (e && e.detail) || e || {};
    function onTick(e) {
        const { n, total } = detail(e);
        cancelTimer();
        const left = Number(total) - Number(n) + 1;
        draw(Number.isFinite(Number(total)) && Number.isFinite(left) ? String(left) : String(n));
    }
    function onHide(e) {
        cancelTimer();
        if (!detail(e).completed) { remove(); return; }
        draw('ROCK!');
        timer = setTimer(() => { timer = null; remove(); }, ROCK_MS);
    }

    bus.on('count-in:tick', onTick);
    bus.on('count-in:hide', onHide);

    return {
        destroy() {
            bus.off('count-in:tick', onTick);
            bus.off('count-in:hide', onHide);
            remove();
        },
    };
}
