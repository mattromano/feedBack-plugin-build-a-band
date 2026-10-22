// Drum "hit a pad" light: a listener on core's shared MIDI input session.
// Reads MIDI only; plays nothing. DOM-free.
import { isPadHit } from './devices.js';

const REQUESTER = 'rockherosmith';

// openPadLight({ midiInput, key, onHit }) -> Promise<{ close() }>
export async function openPadLight({ midiInput, key, onHit }) {
    const opts = { logicalSourceKey: key, requester: REQUESTER };
    const result = await midiInput.open(opts);
    const handle = (result && result.handle) || null;
    const fn = (data) => { if (isPadHit(data)) onHit(); };
    if (handle && typeof handle.addListener === 'function') handle.addListener(fn);
    let closed = false;
    return {
        close() {
            if (closed) return;
            closed = true;
            try { if (handle && typeof handle.removeListener === 'function') handle.removeListener(fn); } catch (_) { /* ignore */ }
            try { midiInput.close({ logicalSourceKey: key, requester: REQUESTER }); } catch (_) { /* ignore */ }
        },
    };
}
