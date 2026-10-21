import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masteryFor, drumsDifficultyId, masteryFromPct, guitarArrIndex } from '../src/mappings.js';

test('masteryFor maps the four levels', () => {
    assert.equal(masteryFor('easy'), 0.25);
    assert.equal(masteryFor('medium'), 0.5);
    assert.equal(masteryFor('hard'), 0.75);
    assert.equal(masteryFor('expert'), 1);
    assert.equal(masteryFor('x'), 0.5);
});

test('drumsDifficultyId passes the four ids through', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert']) assert.equal(drumsDifficultyId(d), d);
    assert.equal(drumsDifficultyId('expert_plus'), 'medium');
});

test('masteryFromPct', () => {
    assert.equal(masteryFromPct(80), 0.8);
    assert.equal(masteryFromPct('100'), null);
    assert.equal(masteryFromPct(140), 1);
    assert.equal(masteryFromPct(undefined), null);
});

test('guitarArrIndex', () => {
    assert.equal(guitarArrIndex([{ index: 0, name: 'Lead' }, { index: 2, name: 'Bass' }], 'Bass'), 2);
    assert.equal(guitarArrIndex([{ name: 'Lead' }, { name: 'Rhythm' }], 'rhythm'), 1);
    assert.equal(guitarArrIndex([{ index: 0, name: 'Combo', smart_name: 'Lead' }], 'Lead'), 0);
    assert.equal(guitarArrIndex([{ name: 'Lead' }], 'Bass'), undefined);
});
