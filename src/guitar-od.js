// RockHeroSmith guitar overdrive rules (plan 5 R8, R9), pure:
// - earning: a chart phrase whose notes were hit at PHRASE_CLEAR or better
//   earns once it closes, PHRASE_GRACE_S after its end (engine verdicts land
//   late);
// - "Noodle it up": gaps of GAP_MIN_S or more between notes, where the
//   NOODLE_ONSETS-th new attack (after NOODLE_GUARD_S into the gap) deploys.
// Chart time throughout (highway.getTime(), judgment noteTime, onset t);
// `t` arguments are the band's display time, used only to order rewinds.
export const PHRASE_CLEAR = 0.9;
export const PHRASE_GRACE_S = 0.5;
export const GAP_MIN_S = 2;
export const NOODLE_ONSETS = 3;
export const NOODLE_GUARD_S = 0.3;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const list = (v) => (Array.isArray(v) ? v : []);
// One key per note, as note_detect judges each note once.
const noteKey = (noteTime) => Math.round(noteTime * 1000);

function safeCall(obj, name) {
    try {
        return obj && typeof obj[name] === 'function' ? obj[name]() : null;
    } catch (_) {
        return null;
    }
}

// Phrase windows [start, end): the chart's phrases, else its sections (each
// ending at the next, the last never), else none.
export function chartPhrases(hw) {
    const phrases = list(safeCall(hw, 'getPhrases'))
        .filter((p) => p && finite(p.start_time) && finite(p.end_time))
        .map((p) => ({ start: p.start_time, end: p.end_time }));
    if (phrases.length) return phrases;
    const sections = list(safeCall(hw, 'getSections'))
        .filter((s) => s && finite(s.time))
        .map((s) => s.time)
        .sort((a, b) => a - b);
    return sections.map((start, i) => ({ start, end: i + 1 < sections.length ? sections[i + 1] : Infinity }));
}

export function itemTimes(notes, chords) {
    return [...list(notes), ...list(chords)]
        .filter((n) => n && finite(n.t))
        .map((n) => n.t)
        .sort((a, b) => a - b);
}

const susOf = (v) => (finite(v) && v > 0 ? v : 0);

// R9: from the latest note end so far (t + sus; a chord by its longest sus)
// to the next note's t, kept when at least minGapS. No leading or trailing gap.
export function findGaps(notes, chords, minGapS = GAP_MIN_S) {
    const items = [
        ...list(notes).filter((n) => n && finite(n.t)).map((n) => ({ t: n.t, end: n.t + susOf(n.sus) })),
        ...list(chords).filter((c) => c && finite(c.t)).map((c) => ({
            t: c.t,
            end: c.t + list(c.notes).reduce((m, n) => Math.max(m, susOf(n && n.sus)), 0),
        })),
    ].sort((a, b) => a.t - b.t);
    const gaps = [];
    let latestEnd = null;
    for (const item of items) {
        if (latestEnd !== null && item.t - latestEnd >= minGapS) gaps.push({ start: latestEnd, end: item.t });
        latestEnd = latestEnd === null ? item.end : Math.max(latestEnd, item.end);
    }
    return gaps;
}

export function createPhraseTracker({ phrases, times } = {}) {
    // Distinct note keys, so the 90 % total uses the same key as the hits.
    const noteTimes = [...new Set(list(times).filter(finite).map(noteKey))].map((k) => k / 1000);
    const windows = list(phrases)
        .filter((p) => p && finite(p.start) && typeof p.end === 'number' && !Number.isNaN(p.end))
        .map((p) => ({
            start: p.start,
            end: p.end,
            expected: noteTimes.filter((n) => n >= p.start && n < p.end).length,
            closedAt: null,
        }));
    const hits = new Map(); // noteKey -> { noteTime, t }

    const inside = (w, noteTime) => noteTime >= w.start && noteTime < w.end;
    const hitsIn = (w) => {
        let n = 0;
        for (const h of hits.values()) if (inside(w, h.noteTime)) n++;
        return n;
    };

    return {
        judge(noteTime, hit, t) {
            if (!hit || !finite(noteTime)) return;
            const key = noteKey(noteTime);
            if (!hits.has(key)) hits.set(key, { noteTime, t: finite(t) ? t : 0 });
        },
        closeUpTo(chartT, t) {
            if (!finite(chartT)) return 0;
            let cleared = 0;
            for (const w of windows) {
                if (w.closedAt !== null || !(w.end + PHRASE_GRACE_S <= chartT)) continue;
                w.closedAt = finite(t) ? t : 0;
                if (w.expected >= 1 && hitsIn(w) / w.expected >= PHRASE_CLEAR) cleared++;
            }
            return cleared;
        },
        // Backward seek: judgments recorded after t go; phrases closed after t reopen.
        rewindTo(t) {
            if (!finite(t)) return;
            for (const [key, h] of hits) if (h.t > t) hits.delete(key);
            for (const w of windows) if (w.closedAt !== null && w.closedAt > t) w.closedAt = null;
        },
        // Loop wrap: phrases starting at or after the loop start reopen and
        // forget their hits. Gains already earned stay with the meter.
        reopenFrom(chartT) {
            if (!finite(chartT)) return;
            for (const w of windows) {
                if (w.start < chartT) continue;
                w.closedAt = null;
                for (const [key, h] of hits) if (inside(w, h.noteTime)) hits.delete(key);
            }
        },
    };
}

export function createNoodle({ gaps } = {}) {
    const zones = list(gaps).filter((g) => g && finite(g.start) && finite(g.end) && g.end > g.start);
    let counts = new Map(); // zone index -> onsets counted
    let deployed = new Set();

    const indexAt = (t) => (finite(t) ? zones.findIndex((g) => g.start <= t && t < g.end) : -1);

    return {
        zoneAt(chartT) {
            const i = indexAt(chartT);
            return i < 0 ? null : { start: zones[i].start, end: zones[i].end, index: i };
        },
        onset(onsetT) {
            const i = indexAt(onsetT);
            if (i < 0 || deployed.has(i) || onsetT < zones[i].start + NOODLE_GUARD_S) return false;
            const n = (counts.get(i) || 0) + 1;
            counts.set(i, n);
            if (n < NOODLE_ONSETS) return false;
            deployed.add(i);
            return true;
        },
        reset() {
            counts = new Map();
            deployed = new Set();
        },
    };
}
