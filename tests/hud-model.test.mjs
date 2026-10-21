import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatScore, difficultyLabel, OD_CALLOUT, crowdZone, glowLevel, streakCallout, bandMultiplierText,
} from '../src/hud-model.js';

test('formatScore groups en-US, rounds, and shows 0 for non-numbers', () => {
    assert.equal(formatScore(412880), '412,880');
    assert.equal(formatScore(NaN), '0');
    assert.equal(formatScore(undefined), '0');
    assert.equal(formatScore(1234.6), '1,235');
    assert.equal(formatScore(-0.2), '0');
});

test('difficultyLabel capitalises known ids, unknown is empty', () => {
    assert.equal(difficultyLabel('easy'), 'Easy');
    assert.equal(difficultyLabel('medium'), 'Medium');
    assert.equal(difficultyLabel('hard'), 'Hard');
    assert.equal(difficultyLabel('expert'), 'Expert');
    assert.equal(difficultyLabel('nope'), '');
    assert.equal(difficultyLabel(undefined), '');
});

test('crowdZone: red under 0.25, yellow under 0.55, green above', () => {
    assert.equal(crowdZone(0.2), 'red');
    assert.equal(crowdZone(0.25), 'yellow');
    assert.equal(crowdZone(0.55), 'green');
    assert.equal(crowdZone(0), 'red');
    assert.equal(crowdZone(1), 'green');
});

test('glowLevel rises from 0.15 to 1 over a 50 streak', () => {
    assert.equal(glowLevel(0), 0.15);
    assert.equal(glowLevel(50), 1);
    assert.equal(glowLevel(25), 0.575);
    assert.equal(glowLevel(200), 1);
    assert.equal(glowLevel(NaN), 0.15);
});

test('streakCallout: note streaks every 50, phrase streaks every 5', () => {
    assert.equal(streakCallout('guitar', 49, 50), '50 NOTE STREAK!');
    assert.equal(streakCallout('drums', 50, 51), null);
    assert.equal(streakCallout('vocals', 4, 5), '5 PHRASE STREAK!');
    assert.equal(streakCallout('guitar', 60, 50), null);
    assert.equal(streakCallout('drums', 99, 100), '100 NOTE STREAK!');
    assert.equal(streakCallout('guitar', 0, 0), null);
    assert.equal(streakCallout('keys', 49, 50), null);
});

test('bandMultiplierText', () => {
    assert.equal(bandMultiplierText(3), 'BAND ×3');
});

test('OD_CALLOUT holds the five overdrive callouts and is frozen', () => {
    assert.deepEqual({ ...OD_CALLOUT }, {
        ready: 'Overdrive ready', noodle: 'Noodle it up!', deploy: 'OVERDRIVE!', out: 'DROPPED OUT', saved: 'SAVED!',
    });
    assert.ok(Object.isFrozen(OD_CALLOUT));
});
