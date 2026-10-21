// Band score ledger: every judgment is a time-stamped entry, and all derived state (part scores,
// band multiplier and bonus, streaks, crowd meters, stars) is a replay of the entries in order,
// so a backward seek can drop later entries and rebuild (plan 4 R2, R4, R6).
import { starsFromScore } from './yarg-rules.js';
import { clampStars, bandStars } from './stars.js';

export const BAND_BONUS_STEP = 0.075;
export const MAX_BAND_MULTIPLIER = 4;
export const CROWD = Object.freeze({
    start: 0.66, hit: 0.02, miss: -0.05, overhit: -0.03, phrasePass: 0.08, phraseFail: -0.10,
});

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function freshPart() {
    return {
        score: 0, bonus: 0, multiplier: 1, streak: 0, bestStreak: 0,
        hits: 0, misses: 0, overhits: 0, crowd: CROWD.start, stars: null,
        phraseAccuracies: [], ratings: new Map(),
    };
}

function freshState(parts) {
    const state = { bonus: 0, parts: new Map() };
    for (const id of parts) state.parts.set(id, freshPart());
    return state;
}

function bandMultiplier(state) {
    let lowest = Infinity;
    for (const p of state.parts.values()) lowest = Math.min(lowest, p.multiplier);
    return Math.min(MAX_BAND_MULTIPLIER, Math.max(1, Number.isFinite(lowest) ? lowest : 1));
}

function crowdStep(entry) {
    switch (entry.kind) {
        case 'hit': return CROWD.hit;
        case 'miss': return CROWD.miss;
        case 'overhit': return CROWD.overhit;
        case 'phrase': return entry.passed ? CROWD.phrasePass : CROWD.phraseFail;
        default: return 0;
    }
}

function apply(entry, state, thresholds) {
    const p = state.parts.get(entry.part);
    if (!p) return;
    const scored = Math.round(num(entry.points, 0) * num(entry.factor, 1));
    p.score += scored;
    p.multiplier = num(entry.multiplier, 1);
    p.streak = num(entry.streak, 0);
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    if (entry.kind === 'hit' || (entry.kind === 'phrase' && entry.passed)) p.hits++;
    else if (entry.kind === 'miss' || entry.kind === 'phrase') p.misses++;
    else if (entry.kind === 'overhit') p.overhits++;
    if (entry.kind === 'phrase') {
        const accuracy = num(entry.accuracy, 0);
        p.phraseAccuracies.push(accuracy);
        if (typeof entry.rating === 'string') {
            const r = p.ratings.get(entry.rating) || { count: 0, sum: 0 };
            r.count++;
            r.sum += accuracy;
            p.ratings.set(entry.rating, r);
        }
    }
    if (Number.isFinite(entry.stars)) p.stars = clampStars(entry.stars);
    if (thresholds.has(entry.part)) p.stars = starsFromScore(p.score, thresholds.get(entry.part));
    p.crowd = clamp01(p.crowd + crowdStep(entry));
    const n = bandMultiplier(state);
    if (scored > 0) {
        const bonus = Math.round(scored * BAND_BONUS_STEP * (n - 1));
        state.bonus += bonus;
        p.bonus += bonus;
    }
}

function accuracyOf(p) {
    if (p.phraseAccuracies.length) {
        return p.phraseAccuracies.reduce((a, b) => a + b, 0) / p.phraseAccuracies.length;
    }
    const judged = p.hits + p.misses;
    return judged ? p.hits / judged : null;
}

export function createBandScore({ parts }) {
    const ids = Array.isArray(parts) ? parts.slice() : [];
    const thresholds = new Map();
    let entries = [];
    let state = freshState(ids);

    function replay() {
        state = freshState(ids);
        for (const entry of entries) apply(entry, state, thresholds);
    }

    return {
        record(entry) {
            if (!entry || !state.parts.has(entry.part)) return;
            const copy = { ...entry };
            entries.push(copy);
            apply(copy, state, thresholds);
        },
        rewindTo(t) {
            entries = entries.filter((entry) => !(entry.t > t));
            replay();
        },
        syncTotals(part, totals) {
            const p = state.parts.get(part);
            if (!p) return;
            p.multiplier = totals ? num(totals.multiplier, 1) : 1;
            p.streak = totals ? num(totals.streak, 0) : 0;
            p.stars = totals ? clampStars(totals.stars) : null;
        },
        setStarThresholds(part, th) {
            const p = state.parts.get(part);
            if (!p) return;
            if (Array.isArray(th)) {
                thresholds.set(part, th.slice());
                p.stars = starsFromScore(p.score, th);
            } else {
                thresholds.delete(part);
                p.stars = null;
            }
        },
        snapshot() {
            const out = { score: 0, bonus: state.bonus, bandMultiplier: bandMultiplier(state), stars: null, parts: {} };
            for (const [id, p] of state.parts) {
                out.score += p.score;
                out.parts[id] = {
                    score: p.score, bonus: p.bonus, multiplier: p.multiplier, streak: p.streak,
                    bestStreak: p.bestStreak, hits: p.hits, misses: p.misses, overhits: p.overhits,
                    crowd: p.crowd, stars: p.stars, accuracy: accuracyOf(p),
                    phrases: [...p.ratings].map(([rating, r]) => ({ rating, count: r.count, meanAccuracy: r.sum / r.count }))
                        .sort((a, b) => b.meanAccuracy - a.meanAccuracy),
                };
            }
            out.score += state.bonus;
            out.stars = bandStars(Object.values(out.parts).map((p) => p.stars));
            return out;
        },
    };
}
