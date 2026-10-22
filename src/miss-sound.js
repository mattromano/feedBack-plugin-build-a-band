// The Rock Band miss "clunk" (controller players in Rock Band part audio): a
// short, quiet dull fret noise synthesized with WebAudio, no sample files. A
// band-passed noise burst and a low falling thump, ~130 ms. Rate-limited so a
// burst of misses never stacks into noise. One AudioContext, made on the first
// play and resumed when the browser suspended it. Never throws: with no
// WebAudio (or a failing one) play() just answers false.
export const MISS_SOUND_GAP_MS = 90;
export const MISS_SOUND_VOLUME = 0.16;
const NOISE_S = 0.12;
const END_S = 0.15;

function defaultFactory(win) {
    return () => {
        const Ctx = win && (win.AudioContext || win.webkitAudioContext);
        return typeof Ctx === 'function' ? new Ctx() : null;
    };
}

function defaultNow(win) {
    return () => {
        const perf = win && win.performance;
        return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
    };
}

// createMissSound({ win, audioFactory?, now?, gapMs?, volume? }) -> { play(): boolean, context() }
//   audioFactory(): a new AudioContext (default: win.AudioContext), or null.
export function createMissSound({ win, audioFactory, now, gapMs = MISS_SOUND_GAP_MS, volume = MISS_SOUND_VOLUME } = {}) {
    const factory = typeof audioFactory === 'function' ? audioFactory : defaultFactory(win);
    const clock = typeof now === 'function' ? now : defaultNow(win);
    let ctx = null;
    let failed = false;
    let noise = null;
    let last = -Infinity;

    function context() {
        if (ctx || failed) return ctx;
        try { ctx = factory() || null; } catch (_) { ctx = null; }
        if (!ctx) failed = true;
        return ctx;
    }

    function noiseBuffer(c) {
        if (noise) return noise;
        const rate = c.sampleRate || 44100;
        const n = Math.max(1, Math.floor(rate * NOISE_S));
        noise = c.createBuffer(1, n, rate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        return noise;
    }

    function synth(c) {
        const t = c.currentTime;
        const out = c.createGain();
        out.gain.value = volume;
        out.connect(c.destination);
        // The fret noise: a dull band of noise, gone in ~90 ms.
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c);
        const band = c.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 900;
        band.Q.value = 0.9;
        const nEnv = c.createGain();
        nEnv.gain.setValueAtTime(0.0001, t);
        nEnv.gain.exponentialRampToValueAtTime(0.6, t + 0.003);
        nEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(band);
        band.connect(nEnv);
        nEnv.connect(out);
        // The thump: a low sine falling 140 -> 55 Hz.
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
        const oEnv = c.createGain();
        oEnv.gain.setValueAtTime(0.0001, t);
        oEnv.gain.exponentialRampToValueAtTime(1, t + 0.004);
        oEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        osc.connect(oEnv);
        oEnv.connect(out);
        src.start(t);
        src.stop(t + END_S);
        osc.start(t);
        osc.stop(t + END_S);
        // Free the voice once it ends.
        osc.onended = () => { try { out.disconnect(); } catch (_) { /* gone */ } };
    }

    return {
        context: () => ctx,
        play() {
            const at = Number(clock());
            if (Number.isFinite(at) && at - last < gapMs) return false;
            const c = context();
            if (!c) return false;
            last = Number.isFinite(at) ? at : last;
            try {
                if (c.state === 'suspended' && typeof c.resume === 'function') {
                    const r = c.resume();
                    if (r && typeof r.catch === 'function') r.catch(() => {});
                }
                synth(c);
                return true;
            } catch (_) {
                return false;
            }
        },
    };
}
