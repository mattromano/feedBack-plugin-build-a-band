// Drum sound modes (plan 6 R2, R5, R16): a pure state machine for whether the song's
// drum stem should be muted. 'song' never mutes, 'kit' (My kit only) always does,
// and 'rockband' drops out on a miss or overhit and returns on the next hit or a seek.
// `judge` and `seek` return whether the wanted state changed; the runtime turns a
// change into one claim operation. Nothing here touches audio.
export const DRUM_SOUND_MODES = ['song', 'rockband', 'kit'];

// The Rock Band drop-out rule, shared with the controllers' part audio
// (stem-sound.js): a miss, an overhit or an overstrum drops out, a hit comes
// back, anything else leaves `dropped` as it is.
export function dropoutStep(dropped, kind) {
    if (kind === 'miss' || kind === 'overhit' || kind === 'overstrum') return true;
    if (kind === 'hit') return false;
    return dropped;
}

export function createDrumSound(mode) {
    const m = DRUM_SOUND_MODES.includes(mode) ? mode : 'song';
    let muted = m === 'kit';
    const set = (next) => {
        if (next === muted) return false;
        muted = next;
        return true;
    };
    return {
        mode: m,
        muted: () => muted,
        judge(type) {
            return m === 'rockband' ? set(dropoutStep(muted, type)) : false;
        },
        seek() {
            return m === 'rockband' ? set(false) : false;
        },
    };
}
