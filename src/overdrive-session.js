// RockHeroSmith per-song overdrive (plan 5 R16): the guitar meter, its phrase
// tracker and Noodle it up, the drums, vocals and controller meters mirrored
// from their engines, and the HUD bars and callouts, behind one small interface so the
// runtime only routes events.
// Clocks (R17): `t` is the band's display time (the meter, rewinds);
// `chartT`, `noteTime` and `onsetT` are chart time (phrases, gaps, onsets).
import { OVERDRIVE } from './yarg-rules.js';
import { createMeasureClock } from './measure-clock.js';
import { createOverdriveMeter } from './overdrive.js';
import { createPhraseTracker, createNoodle, findGaps, itemTimes } from './guitar-od.js';
import { drumsOverdrive, vocalsOverdrive } from './part-events.js';
import { OD_CALLOUT } from './hud-model.js';

// controllers: [{ id, read }], each read() returning that lane's engine state
// (its `starPower` has the drums engine's shape).
export function createOverdriveSession({ parts, beats, guitar, getHud, readDrums, readVocals, controllers } = {}) {
    // A reader that throws falls back silently after one warning per tag
    // ('drums', 'vocals', 'hud'), so a broken source shows once, not per tick.
    const warned = new Set();
    function safe(fn, fallback = null, tag = null) {
        try {
            return typeof fn === 'function' ? fn() : fallback;
        } catch (e) {
            if (tag && !warned.has(tag)) {
                warned.add(tag);
                console.warn('[rockherosmith] overdrive', tag, e);
            }
            return fallback;
        }
    }

    const playing = new Set(Array.isArray(parts) ? parts : []);
    // Guitar overdrive needs both a guitar part in the band and its chart.
    const g = playing.has('guitar') && guitar && typeof guitar === 'object' ? (() => {
        const meter = createOverdriveMeter({ clock: createMeasureClock(beats) });
        const tracker = createPhraseTracker({ phrases: guitar.phrases, times: itemTimes(guitar.notes, guitar.chords) });
        const noodle = createNoodle({ gaps: findGaps(guitar.notes, guitar.chords) });
        return { meter, tracker, noodle };
    })() : null;

    let zone = null; // the open Noodle it up gap, or null
    let calledGaps = new Set(); // gap indexes whose "Noodle it up!" was called out
    const wasReady = new Map(); // part -> ready at the last tick

    const hud = () => safe(getHud, null, 'hud');
    const hudCall = (method, ...args) => {
        const h = hud();
        if (h && typeof h[method] === 'function') safe(() => h[method](...args), null, 'hud');
    };

    // The mirrored meters; null when the reader is missing, throws or has no state.
    // Drums (and controller) ready is the engine's canActivate when it gives one;
    // otherwise the fill rule, with an epsilon for the engine's float drift.
    const starPowerMeter = (state) => {
        const od = drumsOverdrive(state);
        if (!od) return null;
        const ready = typeof od.canActivate === 'boolean'
            ? od.canActivate
            : od.fill >= OVERDRIVE.deployMin - 1e-9 && !od.active;
        return { fill: od.fill, active: od.active, ready };
    };
    const mirrored = {
        drums: () => starPowerMeter(safe(readDrums, null, 'drums')),
        vocals: () => vocalsOverdrive(safe(readVocals, null, 'vocals')),
    };
    const lanes = (Array.isArray(controllers) ? controllers : []).filter((c) => c && typeof c.id === 'string');
    const laneMeter = (c) => starPowerMeter(safe(c.read, null, c.id));

    function draw(part, state) {
        hudCall('setOverdrive', part, state.fill, state.active);
        hudCall('setReady', part, state.ready);
        if (state.ready && !wasReady.get(part)) hudCall('callout', part, OD_CALLOUT.ready);
        wasReady.set(part, state.ready);
    }

    function forgetZone() {
        zone = null;
        calledGaps = new Set();
        if (g) g.noodle.reset();
    }

    return {
        factorFor(part, t) {
            return part === 'guitar' && g && g.meter.isActiveAt(t) ? OVERDRIVE.multiplier : 1;
        },
        guitarJudgment(noteTime, hit, t) {
            if (g) g.tracker.judge(noteTime, hit, t);
        },
        // Onsets reach the noodle only while the zone can be open (meter ready),
        // so attacks before the bar is ready never use up a gap's one deploy.
        onset(onsetT, t) {
            if (!g || !g.meter.stateAt(t).ready) return false;
            if (!g.noodle.onset(onsetT) || !g.meter.deploy(t)) return false;
            hudCall('callout', 'guitar', OD_CALLOUT.deploy);
            return true;
        },
        deployed(part) {
            hudCall('callout', part, OD_CALLOUT.deploy);
        },
        tick(chartT, t) {
            if (g) {
                const cleared = g.tracker.closeUpTo(chartT, t);
                for (let i = 0; i < cleared; i++) g.meter.gain(t);
                const state = g.meter.stateAt(t);
                zone = state.ready ? g.noodle.zoneAt(chartT) : null;
                draw('guitar', state);
                hudCall('setNoodle', !!zone);
                if (zone && !calledGaps.has(zone.index)) {
                    calledGaps.add(zone.index);
                    hudCall('callout', 'guitar', OD_CALLOUT.noodle);
                }
            }
            for (const part of ['drums', 'vocals']) {
                if (!playing.has(part)) continue;
                const state = mirrored[part]();
                if (state) draw(part, state);
            }
            for (const c of lanes) {
                const state = laneMeter(c);
                if (state) draw(c.id, state);
            }
        },
        rewindTo(t) {
            if (g) {
                g.meter.rewindTo(t);
                g.tracker.rewindTo(t);
            }
            forgetZone();
        },
        loopWrap(chartT) {
            if (g) g.tracker.reopenFrom(chartT);
            forgetZone();
        },
        snapshot(t) {
            const read = (part) => {
                const s = playing.has(part) ? mirrored[part]() : null;
                return s && (part === 'drums' ? { fill: s.fill, active: s.active } : s);
            };
            const ctl = {};
            for (const c of lanes) {
                const m = laneMeter(c);
                ctl[c.id] = m && { fill: m.fill, active: m.active };
            }
            return {
                guitar: g ? g.meter.stateAt(t) : null,
                drums: read('drums'),
                vocals: read('vocals'),
                controllers: ctl,
                noodle: !!zone,
            };
        },
    };
}
