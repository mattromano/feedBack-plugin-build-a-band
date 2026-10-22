// RockHeroSmith lane clock: one shared time read per frame fed to every
// lane's highway. schedule/cancel default lazily to rAF/cAF so importing
// under node never touches browser globals.
//
// Errors never stop the loop, but they are not silent either: each failing
// lane, and each distinct getTime error message, is reported once through
// `warn` (default console.warn) so a broken lane shows up in the real app
// without flooding the console at 60 Hz.
export function createLaneClock({ getTime, schedule, cancel, warn } = {}) {
    const lanes = new Set();
    let handle = null;
    let running = false;
    let generation = 0;
    const warnedLanes = new WeakSet();
    const warnedTimeErrors = new Set();

    const sched = (fn) => (schedule || globalThis.requestAnimationFrame.bind(globalThis))(fn);
    const unsched = (h) => (cancel || globalThis.cancelAnimationFrame.bind(globalThis))(h);
    const report = (...args) => {
        try { (warn || console.warn)('[rockherosmith]', ...args); } catch (_) { /* never let logging throw */ }
    };

    function tick() {
        let t;
        try { t = getTime(); } catch (e) {
            const kind = String((e && e.message) || e);
            if (!warnedTimeErrors.has(kind)) {
                warnedTimeErrors.add(kind);
                report('lane clock: reading song time failed:', e);
            }
            return; // skip this tick, keep the loop alive
        }
        for (const hw of lanes) {
            try { hw.setTime(t); } catch (e) {
                // One bad lane must not block the rest.
                if (!warnedLanes.has(hw)) {
                    warnedLanes.add(hw);
                    report('lane clock: a lane failed to take the time:', e);
                }
            }
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
