import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSession, reduceSession } from '../src/session.js';

const st = (phase, filename = 'a.psarc') => ({ phase, filename });
const step = (state, event) => reduceSession(state, event);

test('initial state', () => {
    assert.deepEqual(initialSession(), { phase: 'idle', filename: null });
});

const rows = [
    ['idle go', st('idle', null), { type: 'go', filename: 'a.psarc' }, 'armed', ['saveRestorePoint', 'armVocals', 'play']],
    ['armed ready same', st('armed'), { type: 'ready', filename: 'a.psarc' }, 'playing', ['mount', 'applyDifficulties', 'applyDevices', 'startVocals']],
    ['armed ready different', st('armed'), { type: 'ready', filename: 'b.psarc' }, 'idle', ['teardown']],
    ['armed loading', st('armed'), { type: 'loading' }, 'armed', []],
    ['playing loading', st('playing'), { type: 'loading' }, 'idle', ['teardown']],
    ['ending loading', st('ending'), { type: 'loading' }, 'idle', ['hideResults', 'dropExit', 'teardown']],
    ['playing ended', st('playing'), { type: 'ended' }, 'ending', ['holdExit', 'showResults']],
    ['ending again', st('ending'), { type: 'again' }, 'idle', ['hideResults', 'dropExit', 'keepHides', 'teardown', 'replay']],
    ['ending next', st('ending'), { type: 'next' }, 'idle', ['hideResults', 'teardown', 'releaseExit', 'showBandScreen']],
    ['ending exitTimer is gone', st('ending'), { type: 'exitTimer' }, 'ending', []],
    ['again while playing', st('playing'), { type: 'again' }, 'playing', []],
    ['next while playing', st('playing'), { type: 'next' }, 'playing', []],
    ['again while idle', st('idle', null), { type: 'again' }, 'idle', []],
    ['armed left', st('armed'), { type: 'left' }, 'idle', ['teardown']],
    ['playing left', st('playing'), { type: 'left' }, 'idle', ['teardown']],
    ['ending left', st('ending'), { type: 'left' }, 'idle', ['hideResults', 'dropExit', 'teardown']],
    ['idle left', st('idle', null), { type: 'left' }, 'idle', []],
    ['go while armed', st('armed'), { type: 'go', filename: 'z' }, 'armed', []],
    ['go while playing', st('playing'), { type: 'go', filename: 'z' }, 'playing', []],
    ['ready while playing', st('playing'), { type: 'ready', filename: 'a.psarc' }, 'playing', []],
    ['ended while idle', st('idle', null), { type: 'ended' }, 'idle', []],
];
for (const [name, from, event, phase, effects] of rows) {
    test(`${name}`, () => {
        const r = step(from, event);
        assert.equal(r.state.phase, phase);
        assert.deepEqual(r.effects, effects);
    });
}

test('go stores the filename', () => {
    assert.equal(step(initialSession(), { type: 'go', filename: 'a.psarc' }).state.filename, 'a.psarc');
});

test('a full session', () => {
    let s = initialSession();
    const all = [];
    for (const e of [{ type: 'go', filename: 'a' }, { type: 'loading' }, { type: 'ready', filename: 'a' },
        { type: 'ended' }, { type: 'next' }]) {
        const r = step(s, e); s = r.state; all.push(...r.effects);
    }
    assert.deepEqual(all, ['saveRestorePoint', 'armVocals', 'play', 'mount', 'applyDifficulties', 'applyDevices',
        'startVocals', 'holdExit', 'showResults', 'hideResults', 'teardown', 'releaseExit', 'showBandScreen']);
    assert.equal(s.phase, 'idle');
});

test('teardown happens exactly once however the session ends', () => {
    const go = { type: 'go', filename: 'a' };
    const ready = { type: 'ready', filename: 'a' };
    const paths = {
        'ready-mismatch': [go, { type: 'ready', filename: 'b' }],
        'loading while playing': [go, ready, { type: 'loading' }],
        'left while armed': [go, { type: 'left' }],
        'left while playing': [go, ready, { type: 'left' }],
        'left while ending': [go, ready, { type: 'ended' }, { type: 'left' }],
        'next song': [go, ready, { type: 'ended' }, { type: 'next' }],
        'play again': [go, ready, { type: 'ended' }, { type: 'again' }],
        'loading while ending': [go, ready, { type: 'ended' }, { type: 'loading' }],
    };
    for (const [name, events] of Object.entries(paths)) {
        let s = initialSession();
        const effects = [];
        for (const e of [...events, { type: 'left' }, { type: 'next' }, { type: 'again' }]) {
            const r = step(s, e); s = r.state; effects.push(...r.effects);
        }
        assert.equal(effects.filter((x) => x === 'teardown').length, 1, name);
        // The results never outlive the session, and replay is always the last effect.
        assert.equal(effects.filter((x) => x === 'hideResults').length, effects.filter((x) => x === 'showResults').length, name);
        if (effects.includes('replay')) assert.equal(effects.at(-1), 'replay', name);
    }
});

test('reduceSession does not mutate its input', () => {
    const frozen = Object.freeze({ phase: 'playing', filename: 'a' });
    assert.doesNotThrow(() => reduceSession(frozen, { type: 'ended' }));
    assert.doesNotThrow(() => reduceSession(frozen, { type: 'left' }));
    assert.deepEqual(frozen, { phase: 'playing', filename: 'a' });
});
