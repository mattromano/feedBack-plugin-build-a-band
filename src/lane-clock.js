// Build-a-Band lane clock: one shared time read per frame fed to every
// lane's highway. schedule/cancel default lazily to rAF/cAF so importing
// under node never touches browser globals.
export function createLaneClock({ getTime, schedule, cancel } = {}) {
    const lanes = new Set();
    let handle = null;
    let running = false;
    let generation = 0;

    const sched = (fn) => (schedule || globalThis.requestAnimationFrame.bind(globalThis))(fn);
    const unsched = (h) => (cancel || globalThis.cancelAnimationFrame.bind(globalThis))(h);

    function tick() {
        let t;
        try { t = getTime(); } catch (_) { return; } // skip this tick, keep the loop alive
        for (const hw of lanes) {
            try { hw.setTime(t); } catch (_) { /* one bad lane must not block the rest */ }
        }
    }

    // A frame only reschedules while it still belongs to the current run
    // (generation unchanged), so re-entrant stop()/start() can't fork loops.
    function makeFrame(gen) {
        return function frame() {
            if (!running || gen !== generation) return;
            try { tick(); } finally {
                if (running && gen === generation) handle = sched(frame);
            }
        };
    }

    return {
        add(hw) { lanes.add(hw); },
        remove(hw) { lanes.delete(hw); },
        tick,
        start() {
            if (running) return;
            running = true;
            generation++;
            handle = sched(makeFrame(generation));
        },
        stop() {
            if (!running) return;
            running = false;
            generation++;
            if (handle !== null) unsched(handle);
            handle = null;
        },
    };
}
