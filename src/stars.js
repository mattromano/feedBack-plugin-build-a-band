// Band star maths: guitar's no-miss base from note_detect's scoring, star clamping, the band
// average and the five-star display. YARG's own rules live in yarg-rules.js (LGPL-3.0).
import { GUITAR_STAR_MULTIPLIERS, starScoreThresholds } from './yarg-rules.js';

export const ND_BASE_SINGLE = 50;
export const ND_BASE_CHORD = 100;

// note_detect's streak multiplier ladder.
export function ndMultiplierForStreak(streak) {
    if (streak >= 50) return 4;
    if (streak >= 25) return 3;
    if (streak >= 10) return 2;
    return 1;
}

// note_detect's full-combo score for the shown notes and chords, played in time order.
export function guitarBaseScore(notes, chords) {
    const items = [
        ...(Array.isArray(notes) ? notes : []).map((n) => ({ t: n && n.t, base: ND_BASE_SINGLE })),
        ...(Array.isArray(chords) ? chords : []).map((c) => ({ t: c && c.t, base: ND_BASE_CHORD })),
    ];
    items.sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
    let total = 0;
    items.forEach((item, i) => { total += item.base * ndMultiplierForStreak(i + 1); });
    return total;
}

export function guitarStarThresholds(notes, chords) {
    const base = guitarBaseScore(notes, chords);
    return base > 0 ? starScoreThresholds(base, GUITAR_STAR_MULTIPLIERS) : null;
}

export function clampStars(v) {
    return Number.isFinite(v) ? Math.min(6, Math.max(0, v)) : null;
}

export function bandStars(values) {
    const ok = (Array.isArray(values) ? values : []).filter(Number.isFinite);
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}

export function starDisplay(stars) {
    if (!Number.isFinite(stars)) return { full: 0, partial: 0, gold: false };
    if (stars >= 6) return { full: 5, partial: 0, gold: true };
    const s = Math.max(0, stars);
    const full = Math.min(5, Math.floor(s));
    return { full, partial: full < 5 ? s - full : 0, gold: false };
}
