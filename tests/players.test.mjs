import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playingIds, playerStyle } from '../src/players.js';

const ctl = (o) => ({
    key: 'k', id: 'ctl1', name: 'Pad', playsAs: 'five_fret', part: 'guitar',
    difficulty: 'medium', lefty: false, partAudio: 'rockband', on: true, ...o,
});
const prefs = (parts, controllers) => ({
    parts: {
        guitar: { on: true, arrangement: 'Rhythm', difficulty: 'hard' },
        drums: { on: true, difficulty: 'medium' },
        vocals: { on: false, difficulty: 'easy' },
        ...parts,
    },
    controllers,
});

test('playingIds orders fixed parts then controllers', () => {
    const p = prefs({}, [ctl({ id: 'ctl1', key: 'a' }), ctl({ id: 'ctl2', key: 'b', on: false }), ctl({ id: 'ctl3', key: 'c' })]);
    assert.deepEqual(playingIds(p), ['guitar', 'drums', 'ctl1', 'ctl3']);
    assert.deepEqual(playingIds(prefs({ vocals: { on: true } }, [])), ['guitar', 'drums', 'vocals']);
    assert.deepEqual(playingIds({ parts: {} }), []);
    assert.deepEqual(playingIds(null), []);
});

test("playerStyle for parts matches today's labels; controllers get Bass (5-Fret) · Expert · name and AUTO CHART", () => {
    const p = prefs({}, [ctl({ id: 'ctl1', part: 'bass', difficulty: 'expert', name: 'Guitar Hero X' })]);
    const g = playerStyle('guitar', p);
    assert.equal(g.tag, 'Rhythm · Hard');
    assert.equal(g.color, '#f5c542');
    assert.equal(g.icon, 'guitar');
    assert.equal(g.calloutKind, 'guitar');
    assert.equal(playerStyle('guitar', p, { oneLevel: true }).tag, 'Rhythm · One level');
    const d = playerStyle('drums', p);
    assert.equal(d.tag, 'Drums · Medium');
    assert.equal(d.calloutKind, 'drums');
    assert.equal(playerStyle('vocals', p).tag, 'Vocals · Easy');

    const c = playerStyle('ctl1', p);
    assert.equal(c.name, 'Bass (5-Fret)');
    assert.equal(c.tag, 'Bass (5-Fret) · Expert · Guitar Hero X');
    assert.equal(c.color, '#2ecc40');
    assert.equal(c.icon, 'gamepad-2');
    assert.equal(c.calloutKind, 'five_fret');
    assert.equal(playerStyle('ctl1', p, { sourceKind: 'auto' }).tag, 'Bass (5-Fret) · Expert · Guitar Hero X · AUTO CHART');
    assert.equal(playerStyle('ctl1', p, { sourceKind: 'chart' }).tag, 'Bass (5-Fret) · Expert · Guitar Hero X');
    const missing = playerStyle('ctl9', p);
    assert.equal(missing.calloutKind, 'five_fret');
});

test('playerStyle for a drums controller', () => {
    const p = prefs({}, [ctl({ id: 'ctl2', playsAs: 'drums', part: 'drums', difficulty: 'expert', name: 'Xbox' })]);
    assert.deepEqual(playerStyle('ctl2', p), {
        name: 'Drums (Controller)', tag: 'Drums (Controller) · Expert · Xbox', color: '#f28c28', icon: 'drum', calloutKind: 'drums',
    });
    assert.equal(playerStyle('ctl2', p, { sourceKind: 'auto' }).tag, 'Drums (Controller) · Expert · Xbox', 'no AUTO CHART on drums');
    const unnamed = prefs({}, [ctl({ id: 'ctl2', playsAs: 'drums', part: 'drums', difficulty: 'easy', name: '' })]);
    assert.equal(playerStyle('ctl2', unnamed).tag, 'Drums (Controller) · Easy');
});
