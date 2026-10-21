import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrumArrangement, DRUMS_PATTERNS } from '../src/arrangements.js';

test('findDrumArrangement', () => {
    assert.equal(findDrumArrangement([{ name: 'Lead' }, { name: 'Drums' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Lead', type: 'guitar' }, { name: 'Kit', type: 'drums' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Lead' }, { name: 'Percussion' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Lead' }, { name: 'Drum Kit' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Drumsticks' }]), -1);
    assert.equal(findDrumArrangement([{ name: 'Lead' }]), -1);
    assert.equal(findDrumArrangement([]), -1);
    assert.equal(findDrumArrangement(undefined), -1);
});

test('findDrumArrangement: hasDrumTab fallback', () => {
    const arrs = [{ name: 'Lead' }, { name: 'Drum' }];
    assert.equal(findDrumArrangement(arrs), -1);
    assert.equal(findDrumArrangement(arrs, { hasDrumTab: true }), 1);
    assert.equal(findDrumArrangement(
        [{ name: 'Lead' }, { name: 'Bass' }, { name: 'Kit A' }, { name: 'Kit B' }], { hasDrumTab: true }), 3);
    assert.equal(findDrumArrangement([{ name: 'Lead' }, { name: 'Bass' }], { hasDrumTab: true }), -1);
});

test('DRUMS_PATTERNS is the drums plugin pattern', () => {
    assert.equal(DRUMS_PATTERNS.source, '\\b(?:drums|percussion|drum\\s*kit)\\b');
    assert.equal(DRUMS_PATTERNS.flags, 'i');
});
