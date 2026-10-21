// Media keys held while an overlay shows (plan 7 R15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_ACTIONS, holdMediaKeys } from '../src/media-keys.js';

function fakeSession(throwOn = null) {
    const calls = [];
    return {
        calls,
        setActionHandler(action, fn) {
            if (fn !== null && action === throwOn) throw new TypeError('unsupported');
            calls.push([action, fn]);
        },
    };
}
const nav = (mediaSession) => ({ mediaSession });

test('a hold silences each media action and the release restores them', () => {
    const s = fakeSession();
    const release = holdMediaKeys(nav(s));
    assert.equal(s.calls.length, 6);
    assert.deepEqual(s.calls.map((c) => c[0]), MEDIA_ACTIONS);
    for (const [, fn] of s.calls) assert.equal(typeof fn, 'function');
    assert.equal(s.calls[0][1](), undefined);
    release();
    assert.equal(s.calls.length, 12);
    assert.deepEqual(s.calls.slice(6), MEDIA_ACTIONS.map((a) => [a, null]));
});

test('holds nest', () => {
    const s = fakeSession();
    const r1 = holdMediaKeys(nav(s));
    const r2 = holdMediaKeys(nav(s));
    assert.equal(s.calls.length, 6);
    r1();
    assert.equal(s.calls.length, 6);
    r2();
    assert.equal(s.calls.length, 12);
    assert.ok(s.calls.slice(6).every(([, fn]) => fn === null));
});

test('a release works once', () => {
    const s = fakeSession();
    const r1 = holdMediaKeys(nav(s));
    const r2 = holdMediaKeys(nav(s));
    r1(); r1(); r1();
    assert.equal(s.calls.length, 6, 'a repeated release does not drop the other hold');
    r2();
    r2();
    assert.equal(s.calls.length, 12);
});

test('no media session, or an unsupported action', () => {
    assert.doesNotThrow(() => holdMediaKeys(undefined)());
    assert.doesNotThrow(() => holdMediaKeys({})());
    const s = fakeSession('seekto');
    const release = holdMediaKeys(nav(s));
    assert.deepEqual(s.calls.map((c) => c[0]), MEDIA_ACTIONS.filter((a) => a !== 'seekto'));
    release();
    const nulls = s.calls.filter(([, fn]) => fn === null).map(([a]) => a);
    assert.equal(nulls.length, 5);
    assert.ok(!nulls.includes('seekto'));
});
