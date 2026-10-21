// Band session state machine. Pure: returns the next state plus the named
// effects the caller must run; never mutates its input.
export function initialSession() {
    return { phase: 'idle', filename: null };
}

const IDLE = Object.freeze({ phase: 'idle', filename: null });

// phase -> event type -> (state, event) => { phase/filename change, effects }
const TABLE = {
    idle: {
        go: (s, e) => [{ phase: 'armed', filename: e.filename }, ['saveRestorePoint', 'play']],
    },
    armed: {
        ready: (s, e) => (e.filename === s.filename
            ? [{ phase: 'playing', filename: s.filename }, ['mount', 'applyDifficulties', 'applyDevices']]
            : [IDLE, ['teardown']]),
        loading: (s) => [s, []],
        left: () => [IDLE, ['teardown']],
    },
    playing: {
        loading: () => [IDLE, ['teardown']],
        ended: (s) => [{ phase: 'ending', filename: s.filename }, ['holdExit', 'startExitTimer']],
        left: () => [IDLE, ['teardown']],
    },
    ending: {
        loading: () => [IDLE, ['cancelExitTimer', 'teardown']],
        exitTimer: () => [IDLE, ['teardown', 'releaseExit', 'showBandScreen']],
        left: () => [IDLE, ['cancelExitTimer', 'teardown']],
    },
};

export function reduceSession(state, event) {
    const row = TABLE[state.phase];
    const fn = row && event && row[event.type];
    if (!fn) return { state, effects: [] };
    const [next, effects] = fn(state, event);
    return { state: { phase: next.phase, filename: next.filename }, effects: [...effects] };
}
