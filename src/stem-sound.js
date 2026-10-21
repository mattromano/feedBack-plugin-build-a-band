// Part audio for controller players (Plan 3 Decision 10): a pure state machine for
// which song stems the band wants muted, one rule per stem. Nothing here touches
// audio; the runtime turns each changed stem into one claim operation.
//   - A stem drops on a miss or overstrum only when every player on it is a
//     controller set to Rock Band; an active controller's hit on it, or any seek,
//     brings it back. An Always play controller or a real part keeps it playing.
//   - Fail: a stem mutes when every player on it has failed out and at least one
//     of them is a controller (real parts alone keep their own fail claims). A
//     rescue clears that, and the stem's drop-out with it.
//   - Failed players' judgments never move a stem.
import { dropoutStep } from './drum-sound.js';

// createStemSound({ members: [{ id, stemId, controller, mode: 'rockband'|'always' }] })
// Members with no stemId are ignored. judge, setFailed and seek return the stem
// ids whose muted() changed.
export function createStemSound({ members } = {}) {
    // stemId -> { players: member[], rockband: bool, dropped: bool }
    const stems = new Map();
    const stemOf = new Map();
    for (const m of Array.isArray(members) ? members : []) {
        if (!m || typeof m.stemId !== 'string' || !m.stemId) continue;
        if (!stems.has(m.stemId)) stems.set(m.stemId, { players: [], rockband: true, dropped: false });
        const st = stems.get(m.stemId);
        st.players.push(m);
        if (!(m.controller === true && m.mode === 'rockband')) st.rockband = false;
        if (m.controller === true) stemOf.set(m.id, m.stemId);
    }
    let failed = new Set();
    const failMuted = (st) => st.players.every((m) => failed.has(m.id)) && st.players.some((m) => m.controller === true);
    const isMuted = (st) => failMuted(st) || (st.rockband && st.dropped);
    // Runs `change` and returns the stems whose muted() moved.
    const changes = (change) => {
        const before = new Map([...stems].map(([id, st]) => [id, isMuted(st)]));
        change();
        return [...stems].filter(([id, st]) => isMuted(st) !== before.get(id)).map(([id]) => id);
    };
    return {
        stems: () => [...stems.keys()],
        muted: (stemId) => { const st = stems.get(stemId); return !!st && isMuted(st); },
        judge(id, kind) {
            const st = stems.get(stemOf.get(id));
            if (!st || failed.has(id) || !st.rockband) return [];
            return changes(() => { st.dropped = dropoutStep(st.dropped, kind); });
        },
        setFailed(ids) {
            return changes(() => {
                const next = new Set(Array.isArray(ids) ? ids : []);
                for (const st of stems.values()) {
                    if (st.players.some((m) => failed.has(m.id) && !next.has(m.id))) st.dropped = false;
                }
                failed = next;
            });
        },
        seek() {
            return changes(() => { for (const st of stems.values()) st.dropped = false; });
        },
    };
}
