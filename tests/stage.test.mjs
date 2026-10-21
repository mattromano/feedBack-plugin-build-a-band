import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStage } from '../src/stage.js';

test('planStage with drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }, { name: 'Drums' }] }),
        { lanes: ['guitar', 'drums'], drumIndex: 1 });
});

test('planStage without drums', () => {
    assert.deepEqual(planStage({ arrangements: [{ name: 'Lead' }] }),
        { lanes: ['guitar'], drumIndex: -1 });
});

test('planStage missing arrangements', () => {
    assert.deepEqual(planStage({}), { lanes: ['guitar'], drumIndex: -1 });
});

test('planStage tolerates a null song', () => {
    assert.deepEqual(planStage(null), { lanes: ['guitar'], drumIndex: -1 });
});
