import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrumArrangement } from '../src/arrangements.js';

test('findDrumArrangement', () => {
    assert.equal(findDrumArrangement([{ name: 'Lead' }, { name: 'Drums' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Lead', type: 'guitar' }, { name: 'Kit', type: 'drums' }]), 1);
    assert.equal(findDrumArrangement([{ name: 'Lead' }]), -1);
    assert.equal(findDrumArrangement([]), -1);
});
