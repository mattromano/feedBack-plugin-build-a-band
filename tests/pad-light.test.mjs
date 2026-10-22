// Drum pad light: a listener on core's shared MIDI session, opened and closed
// as rockherosmith without touching anyone else's listener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPadLight } from '../src/pad-light.js';

function fakeMidi() {
    const listeners = new Set();
    const handle = {
        addListener: (f) => listeners.add(f),
        removeListener: (f) => listeners.delete(f),
    };
    const calls = { open: [], close: [] };
    const midiInput = {
        open: async (o) => { calls.open.push(o); return { outcome: 'handled', handle }; },
        close: (o) => { calls.close.push(o); return { outcome: 'handled' }; },
    };
    const send = (data) => { for (const f of [...listeners]) f(data, 0); };
    return { listeners, handle, calls, midiInput, send };
}

test("pad hits light, other messages don't", async () => {
    const m = fakeMidi();
    let hits = 0;
    const light = await openPadLight({ midiInput: m.midiInput, key: 'webmidi:kit', onHit: () => hits++ });
    assert.deepEqual(m.calls.open, [{ logicalSourceKey: 'webmidi:kit', requester: 'rockherosmith' }]);
    m.send([0x99, 38, 100]);
    m.send([0x99, 38, 0]);
    m.send([0x89, 38, 64]);
    m.send([0xB0, 4, 90]);
    m.send(new Uint8Array([0x90, 36, 12]));
    assert.equal(hits, 2);
    light.close();
});

test('close removes only our listener and closes as rockherosmith', async () => {
    const m = fakeMidi();
    const theirs = () => {};
    m.handle.addListener(theirs);
    let hits = 0;
    const light = await openPadLight({ midiInput: m.midiInput, key: 'webmidi:kit', onHit: () => hits++ });
    assert.equal(m.listeners.size, 2);
    light.close();
    light.close();
    assert.equal(m.listeners.size, 1);
    assert.ok(m.listeners.has(theirs), 'the other listener stays registered');
    assert.deepEqual(m.calls.close, [{ logicalSourceKey: 'webmidi:kit', requester: 'rockherosmith' }]);
    m.send([0x99, 38, 100]);
    assert.equal(hits, 0);
});

test('an open without a handle still closes cleanly', async () => {
    const m = fakeMidi();
    m.midiInput.open = async () => ({ outcome: 'denied', handle: null });
    const light = await openPadLight({ midiInput: m.midiInput, key: 'webmidi:kit', onHit: () => {} });
    light.close();
    assert.deepEqual(m.calls.close, [{ logicalSourceKey: 'webmidi:kit', requester: 'rockherosmith' }]);
});
