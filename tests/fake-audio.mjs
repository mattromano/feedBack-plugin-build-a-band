// A fake WebAudio context: every node only records what it is told. Nothing plays.
function fakeParam(log, name, value = 0) {
    const p = { value, events: [] };
    for (const m of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) {
        p[m] = (...args) => { p.events.push([m, ...args]); log.push([name + '.' + m, ...args]); };
    }
    return p;
}

export function makeFakeContext({ state = 'running', sampleRate = 48000 } = {}) {
    const log = [];
    const ctx = {
        log, state, sampleRate, currentTime: 1, resumed: 0, nodes: [],
        destination: { kind: 'destination', inputs: [] },
        resume() { ctx.resumed++; ctx.state = 'running'; return Promise.resolve(); },
    };
    const node = (kind, extra = {}) => {
        const n = {
            kind, outputs: [], ...extra,
            connect(to) { n.outputs.push(to); log.push(['connect', kind, to.kind]); return to; },
            disconnect(to) {
                if (to === undefined) { n.outputs = []; log.push(['disconnect', kind]); return; }
                const i = n.outputs.indexOf(to);
                if (i < 0) { const e = new Error('not connected'); e.name = 'InvalidAccessError'; throw e; }
                n.outputs.splice(i, 1);
                log.push(['disconnect', kind, to.kind]);
            },
        };
        ctx.nodes.push(n);
        return n;
    };
    ctx.node = node;
    ctx.createGain = () => node('gain', { gain: fakeParam(log, 'gain', 1) });
    ctx.createBiquadFilter = () => node('biquad', { type: 'lowpass', frequency: fakeParam(log, 'frequency', 350), Q: fakeParam(log, 'Q', 1) });
    ctx.createOscillator = () => node('osc', {
        type: 'sine', frequency: fakeParam(log, 'oscfreq', 440),
        start(t) { log.push(['start', 'osc', t]); }, stop(t) { log.push(['stop', 'osc', t]); },
    });
    ctx.createBufferSource = () => node('source', {
        buffer: null, start(t) { log.push(['start', 'source', t]); }, stop(t) { log.push(['stop', 'source', t]); },
    });
    ctx.createBuffer = (ch, n, rate) => {
        const data = new Float32Array(n);
        log.push(['createBuffer', ch, n, rate]);
        return { length: n, sampleRate: rate, getChannelData: () => data };
    };
    return ctx;
}
