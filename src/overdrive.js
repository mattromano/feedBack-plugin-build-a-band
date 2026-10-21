// Build-a-Band overdrive meter (plan 5 R3), one shape for every part:
// fill 0..1; ready = not active and fill >= deployMin; deploy only when
// ready; while active the fill drains by measures / barMeasures; reaching 0
// ends it; a gain while active adds (cap 1) and so extends it.
//
// The meter keeps an event log ({ kind: 'gain' | 'deploy', t }) and computes
// state by replaying it up to the asked time, so a rewind just drops later
// events. Times never go backwards in the log: an event earlier than the last
// is stored at the last event's time. YARG's numbers come from yarg-rules.js
// (LGPL-3.0); this file only uses them.
import { OVERDRIVE } from './yarg-rules.js';
import { createMeasureClock } from './measure-clock.js';

const EPS = 1e-9;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export function createOverdriveMeter({ clock } = {}) {
    const measures = clock && typeof clock.measureAt === 'function' ? clock : createMeasureClock([]);
    let events = [];

    const lastT = () => (events.length ? events[events.length - 1].t : -Infinity);
    const at = (t) => {
        const last = lastT();
        if (!finite(t)) return finite(last) ? last : 0;
        return t < last ? last : t;
    };

    function drain(state, t1, t2) {
        if (!state.active || !(t2 > t1)) return;
        const used = (measures.measureAt(t2) - measures.measureAt(t1)) / OVERDRIVE.barMeasures;
        if (!finite(used) || used <= 0) return;
        state.fill -= used;
        if (state.fill <= EPS) {
            state.fill = 0;
            state.active = false;
        }
    }

    function replay(t) {
        const state = { fill: 0, active: false };
        let now = null;
        for (const e of events) {
            if (e.t > t) break;
            if (now !== null) drain(state, now, e.t);
            now = e.t;
            if (e.kind === 'gain') {
                state.fill = Math.min(1, state.fill + e.amount);
            } else if (e.kind === 'deploy' && !state.active && state.fill >= OVERDRIVE.deployMin - EPS) {
                state.active = true;
            }
        }
        if (now !== null) drain(state, now, t);
        return state;
    }

    function stateAt(t) {
        const tt = finite(t) ? t : lastT();
        const s = finite(tt) ? replay(tt) : { fill: 0, active: false };
        return { fill: s.fill, active: s.active, ready: !s.active && s.fill >= OVERDRIVE.deployMin - EPS };
    }

    return {
        gain(t, amount = OVERDRIVE.phraseGain) {
            if (!finite(amount) || amount <= 0) return;
            events.push({ kind: 'gain', t: at(t), amount });
        },
        deploy(t) {
            const tt = at(t);
            if (!stateAt(tt).ready) return false;
            events.push({ kind: 'deploy', t: tt });
            return true;
        },
        stateAt,
        isActiveAt: (t) => stateAt(t).active,
        rewindTo(t) {
            if (!finite(t)) return;
            events = events.filter((e) => !(e.t > t));
        },
        reset() {
            events = [];
        },
    };
}
