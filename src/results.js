// What the results screen shows (plan 4 R17): pure, from a band score snapshot. No DOM.
import { PART_TYPES } from './parts.js';
import { starDisplay } from './stars.js';
import { formatScore, difficultyLabel } from './hud-model.js';

const NAMES = { drums: 'Drums', vocals: 'Vocals' };
const FALLBACK_AWARDS = { guitar: 'Riff keeper', drums: 'Held it down', vocals: 'Big voice' };
// Flawless and Most accurate both need this many judgments.
const ACCURACY_MIN_JUDGED = 20;
const STREAK_AWARD_MIN = 10;

const num = (v) => (Number.isFinite(v) ? v : 0);

function partName(id, partPrefs) {
    if (id !== 'guitar') return NAMES[id] || id;
    const arr = partPrefs && typeof partPrefs.arrangement === 'string' && partPrefs.arrangement ? partPrefs.arrangement : 'Lead';
    return 'Guitar · ' + arr;
}

function notesHit(p) {
    return formatScore(num(p.hits)) + ' / ' + formatScore(num(p.hits) + num(p.misses));
}

function partStats(id, p, drumsExtra) {
    const score = ['Score', formatScore(num(p.score))];
    if (id === 'vocals') {
        // Ratings are karaoke's own strings, ordered by mean phrase accuracy (R3, R17).
        const phrases = (Array.isArray(p.phrases) ? p.phrases : [])
            .filter((r) => r && typeof r.rating === 'string')
            .sort((a, b) => num(b.meanAccuracy) - num(a.meanAccuracy))
            .map((r) => formatScore(num(r.count)) + ' ' + r.rating);
        return [score, ['Phrases', phrases.length ? phrases.join(' · ') : '—'],
            ['Best run', formatScore(num(p.bestStreak)) + ' phrases']];
    }
    const stats = [score, ['Best streak', formatScore(num(p.bestStreak))], ['Notes hit', notesHit(p)]];
    if (id === 'guitar') stats.push(['Band bonus', formatScore(num(p.bonus))]);
    if (id === 'drums') {
        stats.push(['Overhits', formatScore(num(p.overhits))]);
        if (drumsExtra && Number.isFinite(drumsExtra.phrasesHit) && Number.isFinite(drumsExtra.phrasesTotal)) {
            stats.push(['Star power phrases', formatScore(drumsExtra.phrasesHit) + ' / ' + formatScore(drumsExtra.phrasesTotal)]);
        }
    }
    return stats;
}

// The card holding the unique highest finite value of `get`, or null on a tie or none.
function uniqueTop(cards, get) {
    let best = null;
    let top = -Infinity;
    let ties = 0;
    for (const c of cards) {
        const v = get(c);
        if (!Number.isFinite(v)) continue;
        if (v > top) { top = v; best = c; ties = 1; } else if (v === top) ties++;
    }
    return ties === 1 ? best : null;
}

// One award per card, in R17's priority order. Cards carry `accuracy` (0-1 or null),
// `judged` and `bestStreak`.
export function pickAwards(cards) {
    const list = Array.isArray(cards) ? cards : [];
    const band = list.length >= 2;
    const streakTop = band ? uniqueTop(list, (c) => c.bestStreak) : null;
    const streakCard = streakTop && streakTop.bestStreak >= STREAK_AWARD_MIN ? streakTop : null;
    const accurateCard = band ? uniqueTop(list, (c) => (num(c.judged) >= ACCURACY_MIN_JUDGED ? c.accuracy : null)) : null;
    return list.map((c) => {
        if (c.accuracy === 1 && num(c.judged) >= ACCURACY_MIN_JUDGED) return 'Flawless';
        if (c === streakCard) return 'Best streak in the band';
        if (c === accurateCard) return 'Most accurate';
        return FALLBACK_AWARDS[c.part] || '';
    });
}

// resultsModel({ snapshot, prefs, song: {title, artist}, oneLevel, drumsExtra: {phrasesHit, phrasesTotal} | null })
//   -> { stars, starDisplay, score, title, subtitle, cards }
// One card per part that is on and in the snapshot, in part order (guitar, drums, vocals).
export function resultsModel({ snapshot, prefs, song, oneLevel, drumsExtra }) {
    const snap = snapshot || {};
    const parts = snap.parts || {};
    const pp = (prefs && prefs.parts) || {};
    const s = song || {};
    const text = (v) => (typeof v === 'string' ? v : '');
    const cards = [];
    for (const type of PART_TYPES) {
        const id = type.id;
        const p = parts[id];
        if (!p || !(pp[id] && pp[id].on)) continue;
        const accuracy = Number.isFinite(p.accuracy) ? p.accuracy : null;
        cards.push({
            part: id,
            name: partName(id, pp[id]),
            difficulty: id === 'guitar' && oneLevel ? 'One level' : difficultyLabel(pp[id].difficulty),
            color: type.color,
            icon: type.icon,
            accuracy,
            accuracyPct: accuracy === null ? null : Math.round(accuracy * 100),
            judged: num(p.hits) + num(p.misses),
            score: num(p.score),
            bestStreak: num(p.bestStreak),
            stats: partStats(id, p, drumsExtra),
            award: '',
        });
    }
    pickAwards(cards).forEach((award, i) => { cards[i].award = award; });
    const stars = Number.isFinite(snap.stars) ? snap.stars : null;
    return {
        stars,
        starDisplay: starDisplay(stars),
        score: num(snap.score),
        title: text(s.title),
        subtitle: [text(s.title), text(s.artist)].filter(Boolean).join(' · '),
        cards,
    };
}
