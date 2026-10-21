// Part audio per stem (Plan 3 Decision 10): a pure state machine, nothing plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStemSound } from '../src/stem-sound.js';

const ctl = (id, stemId, mode = 'rockband') => ({ id, stemId, controller: true, mode });
const real = (id, stemId) => ({ id, stemId, controller: false });

test('a controller miss drops its stem; the next hit by any controller on it restores', () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass'), ctl('ctl2', 'bass')] });
    assert.deepEqual(s.stems(), ['bass']);
    assert.equal(s.muted('bass'), false);
    assert.deepEqual(s.judge('ctl1', 'miss'), ['bass']);
    assert.equal(s.muted('bass'), true);
    assert.deepEqual(s.judge('ctl1', 'miss'), [], 'already dropped');
    assert.deepEqual(s.judge('ctl1', 'sustain-end'), [], 'not a judgment that moves the stem');
    assert.deepEqual(s.judge('ctl2', 'hit'), ['bass'], "the other controller's hit brings it back");
    assert.equal(s.muted('bass'), false);
    assert.deepEqual(s.judge('ctl2', 'hit'), []);
});

test('a bass miss never touches the guitar stem', () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass'), ctl('ctl2', 'guitar')] });
    assert.deepEqual(s.judge('ctl1', 'miss'), ['bass']);
    assert.equal(s.muted('guitar'), false);
    assert.deepEqual(s.judge('ctl2', 'hit'), [], "a hit on the guitar stem doesn't bring the bass back");
    assert.equal(s.muted('bass'), true);
});

test('Lead and Rhythm on one guitar stem share it', () => {
    // A song with no rhythm stem: Rhythm plays the guitar stem too.
    const s = createStemSound({ members: [ctl('ctl1', 'guitar'), ctl('ctl2', 'guitar')] });
    assert.deepEqual(s.stems(), ['guitar']);
    assert.deepEqual(s.judge('ctl2', 'miss'), ['guitar']);
    assert.deepEqual(s.judge('ctl1', 'hit'), ['guitar']);
    assert.equal(s.muted('guitar'), false);
});

test('an Always play controller keeps the stem', () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass', 'always')] });
    assert.deepEqual(s.judge('ctl1', 'miss'), []);
    const shared = createStemSound({ members: [ctl('ctl1', 'bass'), ctl('ctl2', 'bass', 'always')] });
    assert.deepEqual(shared.judge('ctl1', 'miss'), [], "the Always play controller's audio stays");
    assert.equal(shared.muted('bass'), false);
});

test('a real part on the stem keeps it through controller misses', () => {
    const s = createStemSound({ members: [real('guitar', 'guitar'), ctl('ctl1', 'guitar')] });
    assert.deepEqual(s.judge('ctl1', 'miss'), []);
    assert.deepEqual(s.judge('ctl1', 'overstrum'), []);
    assert.equal(s.muted('guitar'), false);
    assert.deepEqual(s.judge('guitar', 'miss'), [], "a real part's judgments never move a stem");
});

test('overstrum drops like a miss', () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass')] });
    assert.deepEqual(s.judge('ctl1', 'overstrum'), ['bass']);
    assert.equal(s.muted('bass'), true);
    assert.deepEqual(s.judge('ctl1', 'hit'), ['bass']);
});

test("a failed controller's stem mutes unless another active player is on it; rescue unmutes", () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass', 'always'), ctl('ctl2', 'guitar'), real('guitar', 'guitar')] });
    assert.deepEqual(s.setFailed(['ctl1']), ['bass'], 'an Always play controller mutes on fail too');
    assert.equal(s.muted('bass'), true);
    assert.deepEqual(s.setFailed(['ctl1', 'ctl2']), [], 'the guitarist still plays the guitar stem');
    assert.deepEqual(s.setFailed(['ctl1', 'ctl2', 'guitar']), ['guitar'], 'everyone on it is out, one a controller');
    assert.deepEqual(s.setFailed(['ctl1', 'ctl2', 'guitar']), [], 'no change, nothing sent');
    assert.deepEqual(s.setFailed(['guitar']).sort(), ['bass', 'guitar'], 'rescue unmutes');
    assert.equal(s.muted('bass'), false);
    // Real parts alone keep their own fail claims: the stem sound never mutes for them.
    const realOnly = createStemSound({ members: [real('guitar', 'guitar')] });
    assert.deepEqual(realOnly.setFailed(['guitar']), []);
    // A rescued controller's dropped stem comes back with it.
    const rb = createStemSound({ members: [ctl('ctl1', 'bass')] });
    rb.judge('ctl1', 'miss');
    assert.deepEqual(rb.setFailed(['ctl1']), [], 'muted already');
    assert.deepEqual(rb.setFailed([]), ['bass']);
    assert.equal(rb.muted('bass'), false);
});

test("failed players' judgments are ignored", () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass'), ctl('ctl2', 'bass')] });
    s.setFailed(['ctl1']);
    assert.deepEqual(s.judge('ctl1', 'miss'), []);
    assert.equal(s.muted('bass'), false, 'ctl2 still plays it');
    s.judge('ctl2', 'miss');
    assert.equal(s.muted('bass'), true);
    assert.deepEqual(s.judge('ctl1', 'hit'), [], "a failed player's hit brings nothing back");
    assert.equal(s.muted('bass'), true);
});

test('seek restores', () => {
    const s = createStemSound({ members: [ctl('ctl1', 'bass'), ctl('ctl2', 'guitar')] });
    s.judge('ctl1', 'miss');
    s.judge('ctl2', 'overstrum');
    assert.deepEqual(s.seek().sort(), ['bass', 'guitar']);
    assert.equal(s.muted('bass'), false);
    assert.deepEqual(s.seek(), []);
    // A seek never brings back a stem every player on has failed out of.
    s.setFailed(['ctl1']);
    assert.deepEqual(s.seek(), []);
    assert.equal(s.muted('bass'), true);
});

test('no stem: nothing changes', () => {
    const s = createStemSound({ members: [ctl('ctl1', null), ctl('ctl2', undefined)] });
    assert.deepEqual(s.stems(), []);
    assert.deepEqual(s.judge('ctl1', 'miss'), []);
    assert.deepEqual(s.setFailed(['ctl1', 'ctl2']), []);
    assert.deepEqual(s.seek(), []);
    assert.equal(s.muted('bass'), false);
    assert.deepEqual(createStemSound({}).stems(), []);
    assert.deepEqual(createStemSound({ members: [ctl('ctl1', 'bass')] }).judge('nobody', 'miss'), []);
});
