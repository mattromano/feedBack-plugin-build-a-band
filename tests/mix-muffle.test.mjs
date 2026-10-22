// The whole-song muffle per audio path, against fakes: nothing plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMixMuffle, MUFFLE_HZ, DIP } from '../src/mix-muffle.js';
import { makeFakeContext } from './fake-audio.mjs';

function stemsGraph() {
    const context = makeFakeContext();
    const masterNode = context.createGain();
    masterNode.connect(context.destination);
    return { context, masterNode };
}

function docWith(audio) {
    return { getElementById: (id) => (id === 'audio' ? audio : null) };
}

// Core's Song fader: applySongVolume re-applies the stored volume to <audio>.
function coreAudio(audio, songVolume = 80, calls = []) {
    return {
        readSongVolume: () => songVolume,
        applySongVolume: () => { calls.push('apply'); if (audio) audio.volume = songVolume / 100; return Promise.resolve(songVolume); },
    };
}

test('stems graph: a low-pass is inserted after the master, glides down on duck and up on restore; release takes it out', () => {
    const g = stemsGraph();
    const win = { feedBack: { stems: { audioGraph: g } } };
    const m = createMixMuffle({ win, doc: docWith(null) });
    assert.equal(m.route(), 'stems');
    assert.equal(m.duck(), 'stems');
    const filter = g.context.nodes.find((n) => n.kind === 'biquad');
    assert.equal(filter.type, 'lowpass');
    assert.deepEqual(g.masterNode.outputs, [filter], 'the master goes through the filter only');
    const out = filter.outputs[0];
    assert.deepEqual(out.outputs, [g.context.destination]);
    assert.equal(filter.frequency.events.at(-1)[0], 'setTargetAtTime');
    assert.equal(filter.frequency.events.at(-1)[1], MUFFLE_HZ);
    assert.ok(out.gain.events.at(-1)[1] < 1, 'and a little quieter');
    // A second duck reuses the filter.
    m.duck();
    assert.equal(g.context.nodes.filter((n) => n.kind === 'biquad').length, 1);
    m.restore();
    assert.ok(filter.frequency.events.at(-1)[1] >= 18000, 'opened up');
    assert.equal(out.gain.events.at(-1)[1], 1);
    assert.equal(m.ducked(), null);
    m.release();
    assert.deepEqual(g.masterNode.outputs, [g.context.destination], 'straight to the destination again');
    assert.deepEqual(out.outputs, []);
});

test('stems graph not wired to the destination: nothing changes, no throw', () => {
    const g = stemsGraph();
    g.masterNode.disconnect(g.context.destination);
    const m = createMixMuffle({ win: { feedBack: { stems: { audioGraph: g } } }, doc: docWith(null) });
    assert.equal(m.duck(), null);
    assert.deepEqual(g.masterNode.outputs, []);
    m.restore();
    m.release();
});

test('a new stems graph: the filter moves to it; a torn-down graph is left alone', () => {
    const g1 = stemsGraph();
    const win = { feedBack: { stems: { audioGraph: g1 } } };
    const m = createMixMuffle({ win, doc: docWith(null) });
    m.duck();
    const g2 = stemsGraph();
    win.feedBack.stems.audioGraph = g2;
    m.duck();
    assert.equal(g1.masterNode.outputs.length, 0, 'the old master is not reconnected');
    assert.equal(g2.masterNode.outputs[0].kind, 'biquad');
    m.release();
    assert.deepEqual(g2.masterNode.outputs, [g2.context.destination]);
});

test('JUCE: the backing gain dips; restore re-applies the Song fader', () => {
    const gains = [];
    const calls = [];
    const win = {
        _juceMode: true,
        feedBack: { audio: coreAudio(null, 80, calls), stems: { audioGraph: stemsGraph() } },
        feedBackDesktop: { audio: { setGain: (bus, v) => { gains.push([bus, v]); return Promise.resolve(); } } },
    };
    const m = createMixMuffle({ win, doc: docWith(null) });
    assert.equal(m.route(), 'juce', 'the native engine wins over a stems graph');
    assert.equal(m.duck(), 'juce');
    assert.deepEqual(gains, [['backing', 0.8 * DIP]]);
    m.restore();
    assert.deepEqual(calls, ['apply']);
    // Without core's fader API the backing gain is set back directly.
    const win2 = { _juceMode: true, feedBack: {}, localStorage: { getItem: () => '50' },
        feedBackDesktop: { audio: { setGain: (bus, v) => { gains.push([bus, v]); } } } };
    const m2 = createMixMuffle({ win: win2, doc: docWith(null) });
    m2.duck();
    m2.restore();
    assert.deepEqual(gains.slice(1), [['backing', 0.5 * DIP], ['backing', 0.5]]);
    // JUCE without setGain: no path.
    assert.equal(createMixMuffle({ win: { _juceMode: true }, doc: docWith(null) }).duck(), null);
});

test('HTML5: the <audio> volume dips; restore re-applies the Song fader, or the old volume', () => {
    const audio = { volume: 0.8 };
    const calls = [];
    const m = createMixMuffle({ win: { feedBack: { audio: coreAudio(audio, 80, calls) } }, doc: docWith(audio) });
    assert.equal(m.duck(), 'html5');
    assert.ok(Math.abs(audio.volume - 0.8 * DIP) < 1e-9);
    m.duck();
    assert.ok(Math.abs(audio.volume - 0.8 * DIP) < 1e-9, 'never dips twice');
    m.restore();
    assert.equal(audio.volume, 0.8);
    assert.deepEqual(calls, ['apply']);
    const bare = { volume: 0.6 };
    const m2 = createMixMuffle({ win: { feedBack: {} }, doc: docWith(bare) });
    m2.duck();
    m2.duck();
    assert.ok(Math.abs(bare.volume - 0.6 * DIP) < 1e-9);
    m2.release();
    assert.equal(bare.volume, 0.6);
});

test('no audio path: every call is a no-op', () => {
    for (const m of [createMixMuffle({}), createMixMuffle({ win: {}, doc: docWith(null) }), createMixMuffle({ win: {}, doc: docWith({}) })]) {
        assert.equal(m.route(), null);
        assert.equal(m.duck(), null);
        m.restore();
        m.release();
    }
});
