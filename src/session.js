// Band session state machine. Pure: returns the next state plus the named
// effects the caller must run; never mutates its input.
export function initialSession() {
    return { phase: 'idle', filename: null };
}

const IDLE = Object.freeze({ phase: 'idle', filename: null });

// phase -> event type -> (state, event) => { phase/filename change, effects }
const TABLE = {
    idle: {
        go: (s, e) => [{ phase: 'armed', filename: e.filename }, ['saveRestorePoint', 'armVocals', 'play']],
    },
    armed: {
        ready: (s, e) => (e.filename === s.filename
            ? [{ phase: 'playing', filename: s.filename }, ['mount', 'applyDifficulties', 'applyDevices', 'startVocals']]
            : [IDLE, ['teardown']]),
        loading: (s) => [s, []],
        left: () => [IDLE, ['teardown']],
    },
    playing: {
        loading: () => [IDLE, ['teardown']],
        ended: (s) => [{ phase: 'ending', filename: s.filename }, ['holdExit', 'showResults']],
        // Fail mode (plan 5 R12): every part dropped out, so the song stops into the results.
        failed: (s) => [{ phase: 'ending', filename: s.filename }, ['pauseSong', 'showResults']],
        left: () => [IDLE, ['teardown']],
    },
    // The results show (R16): Next song releases core's held exit and returns
    // to the band screen; Play again drops it and replays (always last),
    // keeping the plugins' own score displays hidden into the replayed session.
    ending: {
        loading: () => [IDLE, ['hideResults', 'dropExit', 'teardown']],
        again: () => [IDLE, ['hideResults', 'dropExit', 'keepHides', 'teardown', 'replay']],
        next: () => [IDLE, ['hideResults', 'teardown', 'releaseExit', 'showBandScreen']],
        left: () => [IDLE, ['hideResults', 'dropExit', 'teardown']],
    },
};

export function reduceSession(state, event) {
    const row = TABLE[state.phase];
    const fn = row && event && row[event.type];
    if (!fn) return { state, effects: [] };
    const [next, effects] = fn(state, event);
    return { state: { phase: next.phase, filename: next.filename }, effects: [...effects] };
}
