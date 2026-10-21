import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    guitarBaseScore, guitarStarThresholds, bandStars, clampStars, starDisplay,
} from '../src/stars.js';
import { GUITAR_STAR_MULTIPLIERS, starScoreThresholds } from '../src/yarg-rules.js';

const singles = (n) => Array.from({ length: n }, (_, i) => ({ t: i }));

test("guitarBaseScore follows note_detect's multiplier ladder", () => {
    assert.equal(guitarBaseScore(singles(9), []), 450);
    assert.equal(guitarBaseScore(singles(10), []), 450 + 100);
    assert.equal(guitarBaseScore([{ t: 1 }], [{ t: 0 }]), 150);
    assert.equal(guitarBaseScore(null, undefined), 0);
});

test('guitarStarThresholds is null with no notes', () => {
    assert.equal(guitarStarThresholds([], []), null);
    assert.equal(guitarStarThresholds(null, null), null);
    // 9 × 50 + 11 × 100 (streaks 10-20 at ×2) = 1550
    assert.deepEqual(guitarStarThresholds(singles(20), []),
        starScoreThresholds(1550, GUITAR_STAR_MULTIPLIERS));
});

test('bandStars averages what exists', () => {
    assert.equal(bandStars([2, null, 4]), 3);
    assert.equal(bandStars([null]), null);
    assert.equal(bandStars([]), null);
});

test('clampStars', () => {
    assert.equal(clampStars(7), 6);
    assert.equal(clampStars(-1), 0);
    assert.equal(clampStars(NaN), null);
    assert.equal(clampStars(3.4), 3.4);
});

test('starDisplay', () => {
    assert.deepEqual(starDisplay(null), { full: 0, partial: 0, gold: false });
    assert.deepEqual(starDisplay(3.25), { full: 3, partial: 0.25, gold: false });
    assert.deepEqual(starDisplay(5.5), { full: 5, partial: 0, gold: false });
    assert.deepEqual(starDisplay(6), { full: 5, partial: 0, gold: true });
});
