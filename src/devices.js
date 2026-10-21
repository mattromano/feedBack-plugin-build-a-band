// Band input devices: list and route guitar, drum and mic inputs. DOM-free:
// `win` and `storage` are injected. Listing never opens a mic (no
// getUserMedia), and nothing here plays sound.

const REQUESTER = 'build_a_band';
const KARAOKE_DEVICE_KEY = 'lyrics_karaoke.deviceId';

const midiOf = (win) => (win && win.feedBack && win.feedBack.midiInput) || null;

// Desktop session sources (native interfaces), or [] when there are none.
async function sessionSources(win) {
    const as = win && win.feedBack && win.feedBack.audioSession;
    if (!as || typeof as.listInputSources !== 'function') return [];
    try {
        const r = await as.listInputSources({ includeUnavailable: false });
        const sources = r && r.payload && r.payload.sources;
        return Array.isArray(sources) ? sources : [];
    } catch (_) {
        return [];
    }
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

export async function applyGuitarDevice(key, win) {
    if (!key) return 'none';
    if ((await sessionSources(win)).length) {
        const as = win.feedBack.audioSession;
        if (typeof as.selectInputSource === 'function') as.selectInputSource({ logicalSourceKey: key }, REQUESTER);
        return 'session';
    }
    const nd = win && win.noteDetect;
    if (nd && typeof nd.setDevice === 'function') nd.setDevice(key);
    return 'browser';
}

export function applyDrumDevice(key, win) {
    if (!key) return 'none';
    const midi = midiOf(win);
    if (midi && typeof midi.select === 'function') {
        const r = midi.select(key);
        if (r && typeof r.catch === 'function') r.catch(() => {});
    }
    const drums = win && win.feedBackDrums;
    if (drums && typeof drums.setMidiInput === 'function') drums.setMidiInput(key);
    return 'ok';
}

// Karaoke reads its mic from this key as a raw string. An empty id (the
// placeholder) leaves karaoke's own pick alone.
export function applyMicDevice(deviceId, storage) {
    if (!deviceId) return 'none';
    try { storage.setItem(KARAOKE_DEVICE_KEY, deviceId); } catch (_) { /* blocked storage */ }
    return 'ok';
}

export async function applyDevices(prefs, win, storage) {
    const p = (prefs && prefs.parts) || {};
    if (p.guitar && p.guitar.on && p.guitar.deviceKey) await applyGuitarDevice(p.guitar.deviceKey, win);
    if (p.drums && p.drums.on && p.drums.deviceKey) applyDrumDevice(p.drums.deviceKey, win);
    if (p.vocals && p.vocals.on && p.vocals.deviceId) applyMicDevice(p.vocals.deviceId, storage);
}

// A note-on with velocity > 0, on any channel.
export function isPadHit(data) {
    if (!data || data.length < 3) return false;
    return (data[0] & 0xF0) === 0x90 && data[2] > 0;
}
