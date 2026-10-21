// The results model (plan 4 R17): pure, from a band score snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultsModel, pickAwards } from '../src/results.js';

function prefsOn(on = { guitar: true, drums: true, vocals: true }) {
    return {
        parts: {
            guitar: { on: !!on.guitar, arrangement: 'Lead', difficulty: 'hard' },
            drums: { on: !!on.drums, difficulty: 'expert' },
            vocals: { on: !!on.vocals, difficulty: 'medium' },
        },
    };
}

const part = (p) => ({
    score: 0, bonus: 0, multiplier: 1, streak: 0, bestStreak: 0, hits: 0, misses: 0, overhits: 0,
    crowd: 0.66, stars: null, accuracy: null, phrases: [], ...p,
});

const SNAPSHOT = {
    score: 412880, bonus: 500, bandMultiplier: 2, stars: 4.2,
    parts: {
        // Vocals first: cards still come out in guitar, drums, vocals order.
        vocals: part({
            score: 9300, hits: 21, misses: 4, bestStreak: 7, accuracy: 0.79,
            phrases: [
                { rating: 'Strong', count: 9, meanAccuracy: 0.8 },
                { rating: 'Awesome', count: 12, meanAccuracy: 0.95 },
            ],
        }),
        guitar: part({ hits: 90, misses: 10, bestStreak: 40, score: 9000, bonus: 500, accuracy: 0.9 }),
        drums: part({ hits: 80, misses: 20, overhits: 3, bestStreak: 30, score: 7000, accuracy: 0.8 }),
    },
};

test('a full band card set in part order with R17 stats', () => {
    const m = resultsModel({
        snapshot: SNAPSHOT, prefs: prefsOn(), song: { title: 'Everlong', artist: 'Foo Fighters' },
        oneLevel: false, drumsExtra: { phrasesHit: 4, phrasesTotal: 5 },
    });
    assert.equal(m.score, 412880);
    assert.equal(m.stars, 4.2);
    assert.equal(m.starDisplay.full, 4);
    assert.equal(m.starDisplay.gold, false);
    assert.equal(m.title, 'Everlong');
    assert.equal(m.subtitle, 'Everlong · Foo Fighters');
    assert.deepEqual(m.cards.map((c) => c.part), ['guitar', 'drums', 'vocals']);
    const [g, d, v] = m.cards;
    assert.equal(g.name, 'Guitar · Lead');
    assert.equal(g.difficulty, 'Hard');
    assert.equal(g.color, '#f5c542');
    assert.equal(g.icon, 'guitar');
    assert.equal(g.accuracyPct, 90);
    assert.equal(g.score, 9000);
    assert.equal(g.bestStreak, 40);
    assert.deepEqual(g.stats, [['Score', '9,000'], ['Best streak', '40'], ['Notes hit', '90 / 100'], ['Band bonus', '500']]);
    assert.equal(d.name, 'Drums');
    assert.equal(d.difficulty, 'Expert');
    assert.equal(d.accuracyPct, 80);
    assert.deepEqual(d.stats, [['Score', '7,000'], ['Best streak', '30'], ['Notes hit', '80 / 100'], ['Overhits', '3'],
        ['Star power phrases', '4 / 5']]);
    assert.equal(v.name, 'Vocals');
    assert.equal(v.accuracyPct, 79);
    assert.deepEqual(v.stats, [['Score', '9,300'], ['Phrases', '12 Awesome · 9 Strong'], ['Best run', '7 phrases']]);
    for (const c of m.cards) assert.equal(typeof c.award, 'string');
});

test('drums without star power data has no star power row', () => {
    const m = resultsModel({ snapshot: SNAPSHOT, prefs: prefsOn({ drums: true }), song: {}, oneLevel: false, drumsExtra: null });
    assert.deepEqual(m.cards.map((c) => c.part), ['drums']);
    assert.ok(!m.cards[0].stats.some(([label]) => label === 'Star power phrases'));
    assert.equal(m.subtitle, '');
});

test('a part that is off, or missing from the snapshot, has no card', () => {
    const snapshot = { ...SNAPSHOT, parts: { guitar: SNAPSHOT.parts.guitar } };
    const m = resultsModel({ snapshot, prefs: prefsOn({ guitar: true, vocals: true }), song: {}, oneLevel: false, drumsExtra: null });
    assert.deepEqual(m.cards.map((c) => c.part), ['guitar']);
});

test('nothing judged gives a dash, not NaN', () => {
    const snapshot = { score: 0, bonus: 0, bandMultiplier: 1, stars: null, parts: { guitar: part({}) } };
    const m = resultsModel({ snapshot, prefs: prefsOn({ guitar: true }), song: { title: 'T', artist: 'A' }, oneLevel: false, drumsExtra: null });
    const [g] = m.cards;
    assert.equal(g.accuracyPct, null);
    assert.equal(g.score, 0);
    assert.equal(m.score, 0);
    assert.deepEqual(m.starDisplay, { full: 0, partial: 0, gold: false });
    assert.ok(g.stats.every(([, value]) => !/NaN/.test(value)));
    assert.deepEqual(g.stats.find(([label]) => label === 'Notes hit'), ['Notes hit', '0 / 0']);
});

test('one level guitar', () => {
    const m = resultsModel({ snapshot: SNAPSHOT, prefs: prefsOn({ guitar: true }), song: {}, oneLevel: true, drumsExtra: null });
    assert.equal(m.cards[0].difficulty, 'One level');
});

test('gold stars at 6', () => {
    const m = resultsModel({ snapshot: { ...SNAPSHOT, stars: 6 }, prefs: prefsOn(), song: {}, oneLevel: false, drumsExtra: null });
    assert.equal(m.starDisplay.gold, true);
});

const card = (part, accuracy, judged, bestStreak) => ({
    part, accuracy, accuracyPct: accuracy === null ? null : Math.round(accuracy * 100), judged, bestStreak,
});

test('awards', () => {
    assert.deepEqual(pickAwards([card('guitar', 1, 25, 30), card('drums', 0.8, 100, 40), card('vocals', 0.7, 20, 5)]),
        ['Flawless', 'Best streak in the band', 'Big voice']);
    assert.deepEqual(pickAwards([card('guitar', 0.5, 10, 3)]), ['Riff keeper']);
    // Tied best streaks: no streak award; the unique most accurate card gets its award.
    assert.deepEqual(pickAwards([card('guitar', 0.9, 50, 40), card('drums', 0.8, 50, 40)]), ['Most accurate', 'Held it down']);
});

test('awards: flawless needs 20 judged; streaks under 10 and tied accuracy give nothing', () => {
    assert.deepEqual(pickAwards([card('guitar', 1, 19, 5), card('drums', 1, 19, 9)]), ['Riff keeper', 'Held it down']);
    assert.deepEqual(pickAwards([card('drums', null, 0, 0), card('vocals', null, 0, 0)]), ['Held it down', 'Big voice']);
});
