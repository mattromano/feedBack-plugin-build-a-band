// RockHeroSmith measure clock: chart time <-> measures from highway.getBeats()
// ([{ time, measure }], measure >= 0 marks a downbeat). Plan 5 R3:
// - two or more downbeats: each downbeat is the next whole measure;
// - else two or more beats: every 4th beat is one (4/4);
// - else 2 s per measure from 0 (120 BPM 4/4, the drums engine's fallback).
// Linear between anchors and extrapolated outside them with the nearest
// segment's slope. Pure; never throws on bad beat data.
// Differs from karaoke's src/measure.js only on degenerate data: 2-4 beats give beat-based measures here (karaoke needs 5+), and duplicate beat times are deduped before picking downbeats (karaoke dedupes downbeats alone).
export const FALLBACK_MEASURE_S = 2;
export const BEATS_PER_MEASURE = 4;

function cleanBeats(beats) {
    const list = (Array.isArray(beats) ? beats : [])
        .filter((b) => b && typeof b.time === 'number' && Number.isFinite(b.time))
        .slice()
        .sort((a, b) => a.time - b.time);
    // Keep strictly increasing times so no segment has zero length.
    return list.filter((b, i) => i === 0 || b.time > list[i - 1].time);
}

// Anchors: [{ t, m }], strictly increasing in both.
function anchorsFor(beats) {
    const list = cleanBeats(beats);
    const downbeats = list.filter((b) => typeof b.measure === 'number' && b.measure >= 0);
    if (downbeats.length >= 2) return downbeats.map((b, i) => ({ t: b.time, m: i }));
    if (list.length >= 2) return list.map((b, i) => ({ t: b.time, m: i / BEATS_PER_MEASURE }));
    return [{ t: 0, m: 0 }, { t: FALLBACK_MEASURE_S, m: 1 }];
}

// Index of the segment [a[i], a[i+1]] to use for x, clamped to the ends.
function segment(anchors, key, x) {
    let lo = 0;
    let hi = anchors.length - 2;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (anchors[mid][key] <= x) lo = mid; else hi = mid - 1;
    }
    return lo;
}

function lerp(anchors, from, to, x) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return 0;
    const i = segment(anchors, from, x);
    const a = anchors[i];
    const b = anchors[i + 1];
    return a[to] + ((x - a[from]) * (b[to] - a[to])) / (b[from] - a[from]);
}

export function createMeasureClock(beats) {
    const anchors = anchorsFor(beats);
    return {
        measureAt: (t) => lerp(anchors, 't', 'm', t),
        timeAtMeasure: (m) => lerp(anchors, 'm', 't', m),
    };
}
