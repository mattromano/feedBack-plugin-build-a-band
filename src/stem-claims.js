// Fail mode's and the drum sound mode's stem mutes (plan 5 R13, plan 6 R3): a stem
// is muted through core's capability host (`feedBack.capabilities`) under a claim
// of its own (a fail claim per part, or the drum sound claim), and restored, then
// released, when the part comes back or the session ends. Stems
// stacks claims and fades the mute (~12 ms); capability mutes are never saved per
// song. Every call is guarded: a missing or failing host never breaks the session.
export const FAIL_CLAIM_PREFIX = 'build_a_band:fail:';
export const SOUND_CLAIM_ID = 'build_a_band:sound:drums';
// Controller players' part audio (Plan 3): one claim per stem, `<prefix><stemId>`.
export const STEM_SOUND_CLAIM_PREFIX = 'build_a_band:sound:stem:';
const REQUESTER = 'build_a_band';

// The stem a part plays, only when the song's stem list has it; never `other`.
export function stemIdFor(part, partPrefs, stemIds) {
    const ids = Array.isArray(stemIds) ? stemIds.filter((id) => typeof id === 'string') : [];
    const has = (id) => (ids.includes(id) ? id : null);
    if (part === 'guitar') {
        if (partPrefs && partPrefs.arrangement === 'Bass') return has('bass');
        return ids.find((id) => id === 'guitar' || id.startsWith('guitar')) || null;
    }
    // A 5-fret controller: Bass plays the bass stem, Rhythm the rhythm stem (else the guitar stem), Lead the guitar stem.
    if (part === 'five_fret') {
        const guitar = () => ids.find((id) => id === 'guitar' || id.startsWith('guitar')) || null;
        const want = partPrefs && partPrefs.part;
        if (want === 'bass') return has('bass');
        if (want === 'rhythm') return ids.find((id) => id === 'rhythm' || id.startsWith('rhythm')) || guitar();
        return guitar();
    }
    if (part === 'drums') return has('drums');
    if (part === 'vocals') return has('vocals');
    return null;
}

// Claims the part's stem, then mutes it by id. The claim and the dispatch are made
// before the first await, so a restore issued later always follows them.
// Resolves true when the mute was handled: core's dispatch answers a provider's
// `{ outcome: 'handled' }` with status 'applied', so either field counts.
export async function muteStem({ caps, part, stemId, claimId = FAIL_CLAIM_PREFIX + part } = {}) {
    if (!caps || typeof caps.claim !== 'function' || typeof caps.dispatch !== 'function') return false;
    try {
        caps.claim({ capability: 'stems', claimId, requester: REQUESTER });
        const result = await caps.dispatch({
            capability: 'stems', command: 'mute', requester: REQUESTER,
            args: { id: stemId, claimId }, claim: { claimId, capability: 'stems' },
        });
        return !!result && (result.status === 'handled' || result.outcome === 'handled');
    } catch (_) {
        return false;
    }
}

// Restores the part's claim, then releases it (stems drops a released claim's
// snapshot, so the restore must land first).
export async function restoreStem({ caps, part, claimId = FAIL_CLAIM_PREFIX + part } = {}) {
    if (!caps) return;
    try {
        if (typeof caps.dispatch === 'function') {
            await caps.dispatch({ capability: 'stems', command: 'restore', requester: REQUESTER, args: { claimId } });
        }
    } catch (_) { /* released anyway */ }
    try {
        if (typeof caps.release === 'function') caps.release({ capability: 'stems', claimId, requester: REQUESTER });
    } catch (_) { /* nothing else to undo */ }
}
