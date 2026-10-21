// Silent input level meter: mic stream -> AnalyserNode, read each frame.
// The analyser is NEVER connected to anything, so nothing reaches the
// speakers (no monitoring, no sound). DOM-free: media and audio
// constructors and the frame scheduler are injected.

export function METER_CONSTRAINTS(deviceId) {
    return {
        audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
    };
}

// Root mean square of a time-domain buffer, clamped to 0-1.
export function rmsLevel(buf) {
    if (!buf || !buf.length) return 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length));
}

const stopTracks = (stream) => {
    const tracks = stream && typeof stream.getTracks === 'function' ? stream.getTracks() : [];
    for (const t of tracks) { try { t.stop(); } catch (_) { /* ignore */ } }
};

// createLevelMeter({ deviceId, via, mediaDevices, AudioContext, onLevel,
//                    onState, schedule, cancel, frameSize? }) -> { stop() }
// onState: 'live' | 'no-access' | 'check-in-game'.
// frameSize: the analyser's fftSize; readings are then paced to one per
// frameSize / sampleRate seconds and onLevel(level, ctx.currentTime) gets the
// audio clock. Without it, onLevel(level) fires every frame.
export function createLevelMeter({ deviceId, via, mediaDevices, AudioContext, onLevel, onState, schedule, cancel, frameSize }) {
    let stopped = false;
    let frame = null;
    let stream = null;
    let ctx = null;

    function release() {
        if (frame !== null) { try { cancel(frame); } catch (_) { /* ignore */ } frame = null; }
        stopTracks(stream);
        stream = null;
        if (ctx) { try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ } ctx = null; }
    }

    const handle = {
        stop() {
            if (stopped) return;
            stopped = true;
            release();
        },
    };

    // A desktop native source may not be reachable from getUserMedia; the
    // game's own input check covers it.
    if (via === 'session') {
        onState('check-in-game');
        return handle;
    }

    Promise.resolve()
        .then(() => mediaDevices.getUserMedia(METER_CONSTRAINTS(deviceId)))
        .then((s) => {
            if (stopped) { stopTracks(s); return; }
            stream = s;
            ctx = new AudioContext();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = frameSize || 1024;
            // Source -> analyser only. The analyser has no output connection.
            ctx.createMediaStreamSource(stream).connect(analyser);
            const buf = new Float32Array(analyser.fftSize);
            onState('live');
            const interval = frameSize ? frameSize / ctx.sampleRate : 0;
            let lastAt = -Infinity;
            const tick = () => {
                frame = null;
                if (stopped) return;
                if (!frameSize) {
                    analyser.getFloatTimeDomainData(buf);
                    onLevel(rmsLevel(buf));
                } else if (ctx.currentTime - lastAt >= interval) {
                    lastAt = ctx.currentTime;
                    analyser.getFloatTimeDomainData(buf);
                    onLevel(rmsLevel(buf), ctx.currentTime);
                }
                if (!stopped) frame = schedule(tick);
            };
            frame = schedule(tick);
        })
        .catch((err) => {
            release();
            if (stopped) return;
            const name = err && err.name;
            onState(name === 'NotAllowedError' || name === 'SecurityError' ? 'no-access' : 'check-in-game');
        });

    return handle;
}
