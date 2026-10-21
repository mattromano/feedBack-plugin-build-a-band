// Fail mode's stem mutes through core's capability host (plan 5 R13), with fake
// capabilities that only record calls: nothing plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAIL_CLAIM_PREFIX, SOUND_CLAIM_ID, stemIdFor, muteStem, restoreStem } from '../src/stem-claims.js';

function fakeCaps({ status = 'handled', outcome = 'handled', throwOn = null } = {}) {
    const calls = [];
    return {
        calls,
        claim(req) { calls.push(['claim', req]); if (throwOn === 'claim') throw new Error('claim'); return () => {}; },
        release(req) { calls.push(['release', req]); if (throwOn === 'release') throw new Error('release'); return { ok: true }; },
        dispatch(req) {
            calls.push(['dispatch', req]);
            if (throwOn === 'dispatch') return Promise.reject(new Error('dispatch'));
            return Promise.resolve({ status, outcome });
        },
    };
}

test('stemIdFor picks the part\'s stem and never other', () => {
    assert.equal(stemIdFor('guitar', { arrangement: 'Lead' }, ['guitar_lead', 'drums']), 'guitar_lead');
    assert.equal(stemIdFor('guitar', { arrangement: 'Rhythm' }, ['bass', 'guitar']), 'guitar');
    assert.equal(stemIdFor('guitar', { arrangement: 'Bass' }, ['bass']), 'bass');
    assert.equal(stemIdFor('guitar', { arrangement: 'Bass' }, ['guitar']), null);
    assert.equal(stemIdFor('guitar', { arrangement: 'Lead' }, ['other']), null);
    assert.equal(stemIdFor('drums', {}, ['guitar', 'drums']), 'drums');
    assert.equal(stemIdFor('vocals', {}, ['vocals']), 'vocals');
    assert.equal(stemIdFor('vocals', {}, []), null);
    assert.equal(stemIdFor('drums', {}, null), null);
});

test('muteStem claims, then mutes by id', async () => {
    const caps = fakeCaps();
    const ok = await muteStem({ caps, part: 'drums', stemId: 'drums' });
    assert.equal(ok, true);
    const claimId = 'build_a_band:fail:drums';
    assert.equal(FAIL_CLAIM_PREFIX + 'drums', claimId);
    assert.deepEqual(caps.calls, [
        ['claim', { capability: 'stems', claimId, requester: 'build_a_band' }],
        ['dispatch', {
            capability: 'stems', command: 'mute', requester: 'build_a_band',
            args: { id: 'drums', claimId }, claim: { claimId, capability: 'stems' },
        }],
    ]);
});

test("muteStem: core's dispatch reports a handled provider as outcome 'handled'", async () => {
    // Core's dispatch maps a provider's { outcome: 'handled' } without a status to status 'applied'.
    assert.equal(await muteStem({ caps: fakeCaps({ status: 'applied', outcome: 'handled' }), part: 'guitar', stemId: 'guitar' }), true);
    assert.equal(await muteStem({ caps: fakeCaps({ status: 'no-owner', outcome: 'no-owner' }), part: 'guitar', stemId: 'guitar' }), false);
});

test('muteStem without capabilities resolves false', async () => {
    assert.equal(await muteStem({ caps: null, part: 'drums', stemId: 'drums' }), false);
    assert.equal(await muteStem({ caps: {}, part: 'drums', stemId: 'drums' }), false);
    assert.equal(await muteStem({ caps: fakeCaps({ throwOn: 'claim' }), part: 'drums', stemId: 'drums' }), false);
    assert.equal(await muteStem({ caps: fakeCaps({ throwOn: 'dispatch' }), part: 'drums', stemId: 'drums' }), false);
});

test('restoreStem restores then releases', async () => {
    const caps = fakeCaps();
    await restoreStem({ caps, part: 'guitar' });
    const claimId = 'build_a_band:fail:guitar';
    assert.deepEqual(caps.calls, [
        ['dispatch', { capability: 'stems', command: 'restore', requester: 'build_a_band', args: { claimId } }],
        ['release', { capability: 'stems', claimId, requester: 'build_a_band' }],
    ]);
});

test('restoreStem still releases when the restore fails, and never throws', async () => {
    const caps = fakeCaps({ throwOn: 'dispatch' });
    await restoreStem({ caps, part: 'drums' });
    assert.deepEqual(caps.calls.map((c) => c[0]), ['dispatch', 'release']);
    await restoreStem({ caps: fakeCaps({ throwOn: 'release' }), part: 'drums' });
    await restoreStem({ caps: null, part: 'drums' });
});

test('mute and restore take a claim id', async () => {
    assert.equal(SOUND_CLAIM_ID, 'build_a_band:sound:drums');
    const claimId = SOUND_CLAIM_ID;
    const caps = fakeCaps();
    assert.equal(await muteStem({ caps, part: 'drums', stemId: 'drums', claimId }), true);
    assert.deepEqual(caps.calls, [
        ['claim', { capability: 'stems', claimId, requester: 'build_a_band' }],
        ['dispatch', {
            capability: 'stems', command: 'mute', requester: 'build_a_band',
            args: { id: 'drums', claimId }, claim: { claimId, capability: 'stems' },
        }],
    ]);
    const caps2 = fakeCaps();
    await restoreStem({ caps: caps2, part: 'drums', claimId });
    assert.deepEqual(caps2.calls, [
        ['dispatch', { capability: 'stems', command: 'restore', requester: 'build_a_band', args: { claimId } }],
        ['release', { capability: 'stems', claimId, requester: 'build_a_band' }],
    ]);
});

test('stemIdFor five_fret: bass, rhythm stem or guitar, guitar', () => {
    assert.equal(stemIdFor('five_fret', { part: 'bass' }, ['bass', 'guitar']), 'bass');
    assert.equal(stemIdFor('five_fret', { part: 'bass' }, ['guitar']), null);
    assert.equal(stemIdFor('five_fret', { part: 'rhythm' }, ['guitar', 'rhythm']), 'rhythm');
    assert.equal(stemIdFor('five_fret', { part: 'rhythm' }, ['guitar_lead', 'drums']), 'guitar_lead');
    assert.equal(stemIdFor('five_fret', { part: 'guitar' }, ['rhythm', 'guitar']), 'guitar');
    assert.equal(stemIdFor('five_fret', { part: 'guitar' }, ['rhythm', 'other']), null);
    assert.equal(stemIdFor('five_fret', { part: 'guitar' }, undefined), null);
    assert.equal(stemIdFor('five_fret', null, ['guitar']), 'guitar', 'no part reads as Lead');
});
