// Tests for src/yarg-rules.js (star rules ported from YARG / YARG.Core).
// Copyright (c) YARC (YARG) contributors
// Licensed under the GNU Lesser General Public License v3.0
// (see https://github.com/YARC-Official/YARG.Core/blob/master/LICENSE and ../LICENSE.LGPL-3.0;
// the LGPL builds on the GPL-3.0 in ../LICENSE.GPL-3.0).
// Re-implemented in JavaScript (node:test) for the feedBack RockHeroSmith plugin. See ../NOTICE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUITAR_STAR_MULTIPLIERS, OVERDRIVE, starScoreThresholds, starsFromScore } from '../src/yarg-rules.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≈ ${b}`);

test("guitar thresholds are YARG's", () => {
    assert.deepEqual(GUITAR_STAR_MULTIPLIERS, [0.06, 0.12, 0.2, 0.47, 0.78, 1.15]);
});

test('starScoreThresholds floors base × multiplier', () => {
    assert.deepEqual(starScoreThresholds(1000, GUITAR_STAR_MULTIPLIERS), [60, 120, 200, 470, 780, 1150]);
});

test('starsFromScore: whole stars on strictly greater, then the fraction', () => {
    const th = starScoreThresholds(1000, GUITAR_STAR_MULTIPLIERS);
    assert.equal(starsFromScore(0, th), 0);
    assert.equal(starsFromScore(30, th), 0.5);
    assert.equal(starsFromScore(60, th), 1);
    near(starsFromScore(61, th), 1.0167);
    assert.equal(starsFromScore(780, th), 5);
    assert.equal(starsFromScore(1150, th), 6);
    assert.equal(starsFromScore(5000, th), 6);
});

test('overdrive numbers', () => {
    assert.deepEqual(OVERDRIVE, { phraseGain: 0.25, deployMin: 0.5, barMeasures: 8, multiplier: 2 });
    assert.ok(Object.isFrozen(OVERDRIVE));
});
