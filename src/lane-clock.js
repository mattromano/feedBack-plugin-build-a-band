// Build-a-Band lane clock: one shared time read per frame fed to every
// lane's highway. schedule/cancel default lazily to rAF/cAF so importing
// under node never touches browser globals.
export function createLaneClock({ getTime, schedule, cancel } = {}) {
    const lanes = new Set();
    let handle = null;
    let running = false;

    const sched = (fn) => (schedule || globalThis.requestAnimationFrame.bind(globalThis))(fn);
    const unsched = (h) => (cancel || globalThis.cancelAnimationFrame.bind(globalThis))(h);

    function tick() {
        const t = getTime();
        for (const hw of lanes) {
            try { hw.setTime(t); } catch (_) { /* one bad lane must not block the rest */ }
        }
    }

    function frame() {
        if (!running) return;
        tick();
        if (running) handle = sched(frame);
    }

    return {
        add(hw) { lanes.add(hw); },
        remove(hw) { lanes.delete(hw); },
        tick,
        start() {
            if (running) return;
            running = true;
            handle = sched(frame);
        },
        stop() {
            if (!running) return;
            running = false;
            if (handle !== null) unsched(handle);
            handle = null;
        },
    };
}
