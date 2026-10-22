// Band input devices: list and route guitar, drum and mic inputs. DOM-free:
// `win` and `storage` are injected. Listing never opens a mic (no
// getUserMedia), and nothing here plays sound.

const REQUESTER = 'rockherosmith';
const KARAOKE_DEVICE_KEY = 'lyrics_karaoke.deviceId';

const midiOf = (win) => (win && win.feedBack && win.feedBack.midiInput) || null;

// The desktop session's input list: { sources, selected } where `selected`
// is the logicalSourceKey core has selected (or null).
async function sessionInputs(win) {
    const as = win && win.feedBack && win.feedBack.audioSession;
    if (!as || typeof as.listInputSources !== 'function') return { sources: [], selected: null };
    try {
        const r = await as.listInputSources({ includeUnavailable: false });
        const payload = (r && r.payload) || {};
        const sel = payload.selected;
        return {
            sources: Array.isArray(payload.sources) ? payload.sources : [],
            selected: (sel && typeof sel.logicalSourceKey === 'string') ? sel.logicalSourceKey : null,
        };
    } catch (_) {
        return { sources: [], selected: null };
    }
}

// Desktop session sources (native interfaces), or [] when there are none.
async function sessionSources(win) {
    return (await sessionInputs(win)).sources;
}

// Browser audioinput devices. enumerateDevices() never prompts.
async function browserAudioInputs(win) {
    const md = win && win.navigator && win.navigator.mediaDevices;
    if (!md || typeof md.enumerateDevices !== 'function') return [];
    try {
        const all = await md.enumerateDevices();
        return (Array.isArray(all) ? all : [])
            .filter((d) => d && d.kind === 'audioinput')
            .map((d, i) => ({ key: d.deviceId, label: d.label || `Input ${i + 1}` }));
    } catch (_) {
        return [];
    }
}

export async function listGuitarInputs(win) {
    const sources = await sessionSources(win);
    if (sources.length) {
        return { via: 'session', items: sources.map((s) => ({ key: s.logicalSourceKey, label: s.label })) };
    }
    return { via: 'browser', items: await browserAudioInputs(win) };
}

export function listDrumInputs(win) {
    const midi = midiOf(win);
    if (!midi || typeof midi.listSources !== 'function') return [];
    try {
        const list = midi.listSources();
        return (Array.isArray(list) ? list : []).map((s) => ({ key: s.logicalSourceKey, label: s.label }));
    } catch (_) {
        return [];
    }
}

// May show the Web-MIDI permission prompt (no sound).
export async function findKit(win) {
    const midi = midiOf(win);
    if (midi && typeof midi.discover === 'function') {
        try { await midi.discover(); } catch (_) { /* list whatever is known */ }
    }
    return listDrumInputs(win);
}

export function listMicInputs(win) {
    return browserAudioInputs(win);
}

// A getter's value, or undefined when the API has none (or it throws).
function read(obj, name) {
    if (!obj || typeof obj[name] !== 'function') return undefined;
    try { return obj[name](); } catch (_) { return undefined; }
}

// `memo` (optional, one per band runtime) remembers the keys last handed to
// note_detect and drums, which have no getter for their current input: an
// unchanged key is not re-applied, so a Go never restarts note_detect's
// capture or drums' MIDI connection for the device they already have.
export async function applyGuitarDevice(key, win, memo) {
    if (!key) return 'none';
    const session = await sessionInputs(win);
    if (session.sources.length) {
        const as = win.feedBack.audioSession;
        if (session.selected !== key && typeof as.selectInputSource === 'function') {
            as.selectInputSource({ logicalSourceKey: key }, REQUESTER);
        }
        return 'session';
    }
    // Browser path: only a real audioinput deviceId may reach note_detect. A
    // stale desktop source key would overwrite its device with one that does
    // not exist.
    const nd = win && win.noteDetect;
    if (!nd || typeof nd.setDevice !== 'function') return 'browser';
    if (!(await browserAudioInputs(win)).some((d) => d.key === key)) return 'browser';
    const current = read(nd, 'getDevice');
    const unchanged = current !== undefined ? current === key : !!memo && memo.noteDetect === key;
    if (!unchanged) nd.setDevice(key);
    if (memo) memo.noteDetect = key;
    return 'browser';
}

export function applyDrumDevice(key, win, memo) {
    if (!key) return 'none';
    const midi = midiOf(win);
    if (midi && typeof midi.select === 'function' && read(midi, 'getSelected') !== key) {
        const r = midi.select(key);
        if (r && typeof r.catch === 'function') r.catch(() => {});
    }
    const drums = win && win.feedBackDrums;
    if (drums && typeof drums.setMidiInput === 'function') {
        const current = read(drums, 'getMidiInput');
        const unchanged = current !== undefined ? current === key : !!memo && memo.drums === key;
        if (!unchanged) drums.setMidiInput(key);
        if (memo) memo.drums = key;
    }
    return 'ok';
}

// Karaoke reads its mic from this key as a raw string. An empty id (the
// placeholder) leaves karaoke's own pick alone, and so does the same id.
export function applyMicDevice(deviceId, storage) {
    if (!deviceId) return 'none';
    try {
        if (storage.getItem(KARAOKE_DEVICE_KEY) !== deviceId) storage.setItem(KARAOKE_DEVICE_KEY, deviceId);
    } catch (_) { /* blocked storage */ }
    return 'ok';
}

export async function applyDevices(prefs, win, storage, memo) {
    const p = (prefs && prefs.parts) || {};
    if (p.guitar && p.guitar.on && p.guitar.deviceKey) await applyGuitarDevice(p.guitar.deviceKey, win, memo);
    if (p.drums && p.drums.on && p.drums.deviceKey) applyDrumDevice(p.drums.deviceKey, win, memo);
    if (p.vocals && p.vocals.on && p.vocals.deviceId) applyMicDevice(p.vocals.deviceId, storage);
}

// A note-on with velocity > 0, on any channel.
export function isPadHit(data) {
    if (!data || data.length < 3) return false;
    return (data[0] & 0xF0) === 0x90 && data[2] > 0;
}
