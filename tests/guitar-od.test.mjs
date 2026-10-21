import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PHRASE_CLEAR, PHRASE_GRACE_S, GAP_MIN_S, NOODLE_ONSETS, NOODLE_GUARD_S,
    chartPhrases, itemTimes, findGaps, createPhraseTracker, createNoodle,
} from '../src/guitar-od.js';

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test('constants', () => {
    assert.equal(PHRASE_CLEAR, 0.9);
    assert.equal(PHRASE_GRACE_S, 0.5);
    assert.equal(GAP_MIN_S, 2);
    assert.equal(NOODLE_ONSETS, 3);
    assert.equal(NOODLE_GUARD_S, 0.3);
});

test('chartPhrases: phrases, then sections, then none', () => {
    assert.deepEqual(chartPhrases({ getPhrases: () => [{ start_time: 0, end_time: 4 }] }), [{ start: 0, end: 4 }]);
    assert.deepEqual(chartPhrases({
        getPhrases: () => null,
        getSections: () => [{ name: 'b', time: 10 }, { name: 'a', time: 0 }],
    }), [{ start: 0, end: 10 }, { start: 10, end: Infinity }]);
    assert.deepEqual(chartPhrases({}), []);
    assert.deepEqual(chartPhrases(null), []);
    assert.deepEqual(chartPhrases({
        getPhrases: () => { throw new Error('x'); },
        getSections: () => { throw new Error('y'); },
    }), []);
    assert.deepEqual(chartPhrases({ getPhrases: () => [{ start_time: 'a' }], getSections: () => [{ time: NaN }] }), []);
});

test('itemTimes: finite note and chord times, sorted', () => {
    assert.deepEqual(itemTimes([{ t: 3 }, { t: NaN }, null, { t: 1 }], [{ t: 2, notes: [] }, {}]), [1, 2, 3]);
    assert.deepEqual(itemTimes(null, undefined), []);
});

test('findGaps uses sustains and keeps gaps of 2 s or more', () => {
    const notes = [{ t: 0, sus: 1 }, { t: 3.5 }, { t: 15 }];
    const chords = [{ t: 10, notes: [{ sus: 0.5 }, { sus: 2 }] }];
    assert.deepEqual(findGaps(notes, chords), [{ start: 1, end: 3.5 }, { start: 3.5, end: 10 }, { start: 12, end: 15 }]);
    assert.deepEqual(findGaps([{ t: 0, sus: 1 }, { t: 2.5 }], []), []);
    // No gap before the first note or after the last.
    assert.deepEqual(findGaps([{ t: 20 }, { t: 21 }], []), []);
    assert.deepEqual(findGaps([], []), []);
    assert.deepEqual(findGaps(null, null), []);
    // A long sustain covering later notes keeps the latest end.
    assert.deepEqual(findGaps([{ t: 0, sus: 10 }, { t: 2 }, { t: 11 }], []), []);
    assert.deepEqual(findGaps([{ t: 0 }, { t: 1 }], [], 0.5), [{ start: 0, end: 1 }]);
});

test('a phrase clears at 90 % of its notes', () => {
    const phrases = [{ start: 0, end: 10 }];
    const times = range(0, 10);
    const nine = createPhraseTracker({ phrases, times });
    for (const n of range(0, 9)) nine.judge(n, true, n);
    nine.judge(9, false, 9);
    assert.equal(nine.closeUpTo(10.4, 11), 0);
    assert.equal(nine.closeUpTo(10.5, 11), 1);
    assert.equal(nine.closeUpTo(20, 21), 0); // closed once

    const eight = createPhraseTracker({ phrases, times });
    for (const n of range(0, 8)) eight.judge(n, true, n);
    assert.equal(eight.closeUpTo(10.5, 11), 0);

    const dup = createPhraseTracker({ phrases, times });
    for (const n of range(0, 8)) dup.judge(n, true, n);
    dup.judge(7.0001, true, 8);
    dup.judge(7, true, 9);
    assert.equal(dup.closeUpTo(10.5, 11), 0);
});

test('duplicate note times count once toward the 90 %', () => {
    // Two items at the same millisecond (e.g. a double-stop as two notes) share one judgment key.
    const times = [...range(0, 10), 3, 3.0001, 7];
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 10 }], times });
    for (const n of range(0, 10)) tr.judge(n, true, n);
    assert.equal(tr.closeUpTo(10.5, 11), 1);
});

test('phrases without notes never clear', () => {
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 4 }, { start: 4, end: 8 }], times: [5, 6] });
    tr.judge(5, true, 5);
    tr.judge(6, true, 6);
    assert.equal(tr.closeUpTo(100, 100), 1);
    const none = createPhraseTracker({ phrases: [], times: [1] });
    none.judge(1, true, 1);
    assert.equal(none.closeUpTo(100, 100), 0);
    const bare = createPhraseTracker();
    assert.equal(bare.closeUpTo(100, 100), 0);
});

test('rewind reopens phrases closed after the seek and forgets later judgments', () => {
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 10 }], times: range(0, 10) });
    for (const t of range(1, 10)) tr.judge(t - 1, true, t);
    assert.equal(tr.closeUpTo(10.5, 12), 1);
    tr.rewindTo(5);
    assert.equal(tr.closeUpTo(10.5, 13), 0);
});

test('rewind keeps phrases closed before the seek', () => {
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 10 }], times: range(0, 10) });
    for (const t of range(1, 10)) tr.judge(t - 1, true, t);
    assert.equal(tr.closeUpTo(10.5, 12), 1);
    tr.rewindTo(12.5);
    assert.equal(tr.closeUpTo(10.5, 13), 0);
});

test('loop wrap reopens phrases from the loop start', () => {
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 10 }, { start: 10, end: 20 }], times: range(0, 20) });
    for (const n of range(0, 9)) tr.judge(n, true, n);
    assert.equal(tr.closeUpTo(10.5, 11), 1);
    tr.reopenFrom(0);
    // The reopened phrase forgot its hits: closing it again without new ones earns nothing.
    assert.equal(tr.closeUpTo(10.5, 30), 0);
    tr.reopenFrom(0);
    for (const n of range(0, 9)) tr.judge(n, true, 30 + n);
    assert.equal(tr.closeUpTo(10.5, 40), 1);
});

test('loop wrap leaves phrases before the loop start closed', () => {
    const tr = createPhraseTracker({ phrases: [{ start: 0, end: 10 }, { start: 10, end: 20 }], times: range(0, 20) });
    for (const n of range(0, 20)) tr.judge(n, true, n);
    assert.equal(tr.closeUpTo(20.5, 21), 2);
    tr.reopenFrom(10);
    for (const n of range(10, 20)) tr.judge(n, true, 30 + n);
    assert.equal(tr.closeUpTo(20.5, 51), 1);
});

test('noodle: three new attacks in an open gap deploy, once', () => {
    const nd = createNoodle({ gaps: [{ start: 4, end: 8 }] });
    assert.equal(nd.onset(4.1), false); // guard: the gap-opening note's late attack
    assert.equal(nd.onset(5), false);
    assert.equal(nd.onset(5.5), false);
    assert.equal(nd.onset(6), true);
    assert.equal(nd.onset(6.5), false);
    assert.deepEqual(nd.zoneAt(5), { start: 4, end: 8, index: 0 });
    assert.equal(nd.zoneAt(9), null);
    nd.reset();
    assert.equal(nd.onset(5), false);
    assert.equal(nd.onset(5.5), false);
    assert.equal(nd.onset(6), true);
});

test('noodle: onsets outside any gap are ignored', () => {
    const nd = createNoodle({ gaps: [{ start: 4, end: 8 }, { start: 12, end: 16 }] });
    for (const t of [1, 2, 3, 8, 9, 10, NaN, undefined]) assert.equal(nd.onset(t), false);
    assert.equal(nd.onset(5), false);
    assert.equal(nd.onset(13), false);
    assert.equal(nd.onset(14), false);
    assert.equal(nd.onset(6), false); // second in gap 0: counts are per gap
    assert.equal(nd.onset(15), true);
    assert.equal(nd.zoneAt(3), null);
    assert.equal(nd.zoneAt(12).index, 1);
    assert.equal(createNoodle().zoneAt(1), null);
    assert.equal(createNoodle({ gaps: null }).onset(1), false);
});
