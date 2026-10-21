// Engine events to band score entries (plan 4 R3): note_detect's notedetect:hit/miss, the drums
// plugin's drums:* bus events and karaoke's karaoke:phrase / karaoke:reset. Each returns null for
// an event that isn't the band's.
const finite = Number.isFinite;
const or = (v, fallback) => (finite(v) ? v : fallback);
const isObject = (v) => typeof v === 'object' && v !== null;

const DRUM_JUDGMENTS = ['hit', 'miss', 'overhit'];

export function guitarEntry(detail, t) {
    if (!(detail && detail.isDefault === true && detail.counted === true)) return null;
    return {
        part: 'guitar', t, kind: detail.hit ? 'hit' : 'miss',
        points: detail.hit ? or(detail.points, 0) : 0,
        multiplier: or(detail.multiplier, 1), streak: or(detail.streak, 0),
    };
}

export function drumsEntry(type, detail, t, bandCanvas) {
    if (!(bandCanvas && detail && detail.canvas === bandCanvas && DRUM_JUDGMENTS.includes(type))) return null;
    return {
        part: 'drums', t, kind: type,
        points: type === 'hit' ? or(detail.points, 0) : 0,
        // Star power doubles the drums multiplier; the band multiplier leaves overdrive out (R4).
        multiplier: (or(detail.multiplier, 0) || 1) / (detail.spActive ? 2 : 1),
        streak: detail.combo | 0,
        stars: finite(detail.stars) ? detail.stars : null,
    };
}

export function vocalsEntry(detail, t) {
    if (!isObject(detail)) return null;
    return {
        part: 'vocals', t, kind: 'phrase',
        points: or(detail.points, 0), multiplier: or(detail.multiplier, 1), streak: or(detail.streak, 0),
        stars: finite(detail.stars) ? detail.stars : null,
        accuracy: or(detail.accuracy, 0),
        rating: typeof detail.rating === 'string' ? detail.rating : null,
        // A phrase passed when karaoke's running phrase streak is still alive after it.
        passed: detail.streak > 0,
    };
}

export function vocalsTotals(detail) {
    if (!isObject(detail)) return null;
    return {
        multiplier: or(detail.multiplier, 1), streak: or(detail.streak, 0),
        stars: finite(detail.stars) ? detail.stars : null,
    };
}
