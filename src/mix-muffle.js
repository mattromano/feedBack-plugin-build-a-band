// The Rock Band "audio drop" for a song with no stem of the player's own (an
// unsplit song: no stems, or only the `full` stem): the whole song's mix is
// muffled on a miss and comes back on a hit. Which audio path plays the song
// decides how:
//   - stems (window.feedBack.stems.audioGraph, a single-stem pack in the
//     browser): a real low-pass muffle. A BiquadFilter and a gain sit between
//     stems' master and the context's destination, inserted on the first duck
//     and taken out at release(); duck/restore glide its cutoff and gain.
//   - JUCE (window._juceMode, desktop native engine): the engine's backing
//     gain is dipped (feedBackDesktop.audio.setGain('backing', ...)); no filter
//     is reachable there.
//   - HTML5 (core's <audio id="audio">): its volume is dipped.
// The dips are never saved: restore re-applies core's Song fader value
// (feedBack.audio.applySongVolume, which reads the stored volume and writes
// nothing). With no reachable path every call is a no-op; nothing here throws.
export const MUFFLE_HZ = 650;
export const MUFFLE_GAIN = 0.7;
export const DIP = 0.4;
const OPEN_HZ = 20000;
const GLIDE_DOWN_S = 0.025;
const GLIDE_UP_S = 0.05;

function safe(fn) {
    try { return fn(); } catch (_) { return undefined; }
}

const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };

// createMixMuffle({ win, doc }) -> { duck(): route | null, restore(), release(), route(), ducked() }
export function createMixMuffle({ win, doc } = {}) {
    let ducked = null;          // the route the duck went through, or null
    let html5Prev = null;       // the <audio> volume before an HTML5 dip (no core fader)
    let insert = null;          // { graph, filter, gain } while the filter sits in stems' graph

    const fb = () => (win && (win.feedBack || win.slopsmith)) || null;
    const audioEl = () => (doc && typeof doc.getElementById === 'function' ? safe(() => doc.getElementById('audio')) : null);
    const graph = () => {
        const host = fb();
        const g = (host && host.stems && host.stems.audioGraph) || (win && win.slopsmith && win.slopsmith.stems && win.slopsmith.stems.audioGraph);
        return g && g.context && g.masterNode ? g : null;
    };
    const juceSetGain = () => {
        const d = win && win.feedBackDesktop;
        const fn = d && d.audio && d.audio.setGain;
        return typeof fn === 'function' ? fn : null;
    };
    // Core's Song fader, 0..1 (80% when it can't be read).
    const songLinear = () => {
        const audio = fb() && fb().audio;
        let v = audio && typeof audio.readSongVolume === 'function' ? safe(() => Number(audio.readSongVolume())) : NaN;
        if (!Number.isFinite(v)) v = safe(() => parseFloat(win.localStorage.getItem('volume')));
        if (!Number.isFinite(v)) v = 80;
        return Math.min(1, Math.max(0, v / 100));
    };
    const applySong = () => {
        const audio = fb() && fb().audio;
        if (!audio || typeof audio.applySongVolume !== 'function') return false;
        safe(() => quiet(audio.applySongVolume()));
        return true;
    };

    function route() {
        if (win && win._juceMode) return juceSetGain() ? 'juce' : null;
        if (graph()) return 'stems';
        const a = audioEl();
        return a && typeof a.volume === 'number' ? 'html5' : null;
    }

    // Puts the filter after stems' master (once per graph). False when the
    // master isn't wired to the destination as expected: then nothing changes.
    function ensureInsert(g) {
        if (insert && insert.graph.masterNode === g.masterNode) return true;
        if (insert) detach();
        const ctx = g.context;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0;
        filter.frequency.value = Math.min(OPEN_HZ, (ctx.sampleRate || 44100) / 2 - 100);
        const gain = ctx.createGain();
        gain.gain.value = 1;
        filter.connect(gain);
        gain.connect(ctx.destination);
        g.masterNode.connect(filter);
        try {
            g.masterNode.disconnect(ctx.destination);
        } catch (_) {
            // Not wired to the destination (another host re-routed it): undo.
            safe(() => g.masterNode.disconnect(filter));
            safe(() => gain.disconnect());
            return false;
        }
        insert = { graph: g, filter, gain };
        return true;
    }

    function glide(open) {
        if (!insert) return;
        const { graph: g, filter, gain } = insert;
        const t = g.context.currentTime || 0;
        const hz = open ? Math.min(OPEN_HZ, (g.context.sampleRate || 44100) / 2 - 100) : MUFFLE_HZ;
        const tc = open ? GLIDE_UP_S : GLIDE_DOWN_S;
        safe(() => { filter.frequency.cancelScheduledValues(t); filter.frequency.setTargetAtTime(hz, t, tc); });
        safe(() => { gain.gain.cancelScheduledValues(t); gain.gain.setTargetAtTime(open ? 1 : MUFFLE_GAIN, t, tc); });
    }

    // The filter comes out; stems' master goes straight to the destination again
    // when it is still the published one (a torn-down graph is left alone).
    function detach() {
        const ins = insert;
        insert = null;
        if (!ins) return;
        const live = graph();
        safe(() => ins.graph.masterNode.disconnect(ins.filter));
        safe(() => ins.gain.disconnect());
        if (live && live.masterNode === ins.graph.masterNode) safe(() => ins.graph.masterNode.connect(ins.graph.context.destination));
    }

    function duck() {
        const r = route();
        if (r === 'stems') {
            const ok = safe(() => ensureInsert(graph())) === true;
            if (!ok) return null;
            glide(false);
        } else if (r === 'juce') {
            const setGain = juceSetGain();
            safe(() => quiet(setGain('backing', songLinear() * DIP)));
        } else if (r === 'html5') {
            const a = audioEl();
            if (!ducked || ducked !== 'html5') html5Prev = a.volume;
            const base = fb() && fb().audio && typeof fb().audio.readSongVolume === 'function' ? songLinear() : html5Prev;
            safe(() => { a.volume = Math.min(1, Math.max(0, base * DIP)); });
        } else {
            return null;
        }
        ducked = r;
        return r;
    }

    function restore() {
        const r = ducked;
        ducked = null;
        if (insert) glide(true);
        if (r === 'juce' || r === 'html5') {
            if (!applySong()) {
                if (r === 'juce') { const setGain = juceSetGain(); if (setGain) safe(() => quiet(setGain('backing', songLinear()))); }
                const a = audioEl();
                if (r === 'html5' && a && html5Prev !== null) safe(() => { a.volume = html5Prev; });
            }
        }
        html5Prev = null;
    }

    return {
        route,
        ducked: () => ducked,
        duck,
        restore,
        // The session ends: the mix comes back and the filter comes out.
        release() {
            restore();
            detach();
        },
    };
}
