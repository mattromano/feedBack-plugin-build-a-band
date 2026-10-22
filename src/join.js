// Start-to-join manager for the band screen. DOM-free: everything is injected.
//
// Unclaimed controllers are heard through core's passive `gamepadInput.watch`; a Start
// (`pause`) press on one that is set up joins it. Joined, connected controllers are
// claimed (owner `rockherosmith`) so their lights follow and the menus stand down.
//
// Every kind in the `kinds` registry (CONTROLLER_KINDS) is consulted through its
// `api()`: `listControllers()` and `createMapper()` return Promises, so the controller
// lists and the mappers are cached (per kind and key): input that arrives before a
// mapper resolves is ignored. A pad's playable kinds come from each kind's listed binding
// kind through `playableKinds` (Decision 12). A joined pad plays as its `playsAs` when that
// is one of its kinds, or as its only kind; otherwise it is undecided: its first kind's
// mapper hears Start only, and on a standard pad each kind's `pickButton` (X 5-Fret,
// B Drums) answers `onPlaysAs` once.
//
// Watch/handle event times (`t`) are seconds, as core reports them.
import { CONTROLLER_KINDS, playableKinds } from './controller-model.js';

export const OWNER = 'rockherosmith';
export const LEAVE_HOLD_MS = 1000;
export const MIRROR_WINDOW_S = 0.05;   // identical-id slots pressing Start within 50 ms are one press
const BACK_BUTTON = 8;                 // standard mapping
const NO_KINDS = Object.freeze([]);
// playableKinds takes each kind's listed binding kind in the built-in registry's order.
const PLAYABLE_ORDER = Object.keys(CONTROLLER_KINDS);

// A kind's light table, { light: [actions] }, as lookups for the event path.
function lightSpec(table) {
    const lights = table && typeof table === 'object' ? table : {};
    const lightOf = new Map();
    for (const light of Object.keys(lights)) for (const a of lights[light]) lightOf.set(a, light);
    return { lights, lightOf };
}

// One per key and kind, reused for every event: the lit flags and each action's held state.
function newLightState(spec) {
    const lit = {};
    const held = {};
    for (const light of Object.keys(spec.lights)) lit[light] = false;
    for (const a of spec.lightOf.keys()) held[a] = false;
    return { lit, held };
}

async function listFrom(api) {
    if (!api || typeof api.listControllers !== 'function') return NO_KINDS;
    try {
        const list = await api.listControllers();
        return Array.isArray(list) ? list.filter((c) => c && typeof c.controllerKey === 'string') : NO_KINDS;
    } catch (_) {
        return NO_KINDS;
    }
}

export function createJoinManager({
    gamepadInput, kinds = CONTROLLER_KINDS,
    setTimer, clearTimer, onJoin, onLeave, onPrimary, onPlaysAs, onLight, onChange,
} = {}) {
    const noop = () => {};
    const emit = {
        join: onJoin || noop, leave: onLeave || noop, primary: onPrimary || noop,
        playsAs: onPlaysAs || noop, light: onLight || noop, change: onChange || noop,
    };
    const registry = kinds || {};
    const kindIds = Object.keys(registry);
    const perKind = (make) => new Map(kindIds.map((k) => [k, make(k)]));

    let running = false;
    let seq = 0;                       // newest refresh wins
    let runGen = 0;                    // bumped only by stop: invalidates in-flight mappers
    let unwatch = null;
    let unchange = null;
    let joined = new Map();            // key -> playsAs (null: undecided)
    const byKey = new Map();           // controllerKey -> entry (rebuilt per refresh)
    const byPad = new Map();           // slot index -> entry
    let padKinds = new Map();          // controllerKey -> playable kinds (rebuilt per refresh)
    let connected = new Set();
    let standard = new Set();          // keys of standard-mapped pads (rebuilt per refresh)
    let needsSetup = [];
    const specs = perKind((k) => lightSpec(registry[k] && registry[k].lights));
    const mappers = perKind(() => new Map());   // kind -> key -> mapper
    const pending = perKind(() => new Set());   // kind -> keys whose mapper is being created
    const lightStates = perKind(() => new Map()); // kind -> key -> { lit, held }
    const claims = new Map();          // key -> { handle, listener }
    const holds = new Map();           // key -> timer handle
    const recentStart = new Map();     // controller id -> { pad, t }

    const apiOf = (kind) => {
        const k = registry[kind];
        try { return (k && typeof k.api === 'function' && k.api()) || null; } catch (_) { return null; }
    };
    const anyApi = () => kindIds.some((k) => !!apiOf(k));
    const kindsOf = (key) => padKinds.get(key) || NO_KINDS;
    // What a joined pad plays as: its playsAs when playable, else its only kind, else null.
    const playKind = (key) => {
        const ks = kindsOf(key);
        const p = joined.get(key);
        if (p && ks.includes(p)) return p;
        return ks.length === 1 ? ks[0] : null;
    };
    // The kind whose mapper hears the pad: what it plays as, else its first kind (Start only).
    const mapperKind = (key) => (joined.has(key) && playKind(key)) || kindsOf(key)[0] || null;
    const mapperFor = (key) => {
        const kind = mapperKind(key);
        const m = kind ? mappers.get(kind).get(key) : undefined;
        if (!m) ensureMapper(key);
        return m || null;
    };

    function ensureMapper(key) {
        const kind = mapperKind(key);
        if (!kind) return;
        const cache = mappers.get(kind);
        const waiting = pending.get(kind);
        if (cache.has(key) || waiting.has(key)) return;
        const api = apiOf(kind);
        if (!api || typeof api.createMapper !== 'function') return;
        waiting.add(key);
        const mine = runGen;
        (async () => {
            try {
                const m = await api.createMapper(key);
                if (m && mine === runGen && running) cache.set(key, m);
            } catch (_) { /* no mapper: stays ignored */ }
            waiting.delete(key);
        })();
    }

    function release(key) {
        const c = claims.get(key);
        if (!c) return;
        claims.delete(key);
        try { c.handle.removeListener(c.listener); } catch (_) { /* gone */ }
        try { c.handle.release(); } catch (_) { /* gone */ }
        cancelHold(key);
    }

    function cancelHold(key) {
        if (!holds.has(key)) return;
        try { clearTimer(holds.get(key)); } catch (_) { /* ignore */ }
        holds.delete(key);
    }

    // The light an action drives is on while any of its actions is held.
    function lightState(kind, key) {
        const states = lightStates.get(kind);
        let s = states.get(key);
        if (!s) { s = newLightState(specs.get(kind)); states.set(key, s); }
        return s;
    }

    // An undecided standard pad: a kind's pick button (X or B) answers, once.
    function pick(key, e, ev) {
        if (!ev.pressed || !e || e.mapping !== 'standard') return false;
        const ks = kindsOf(key);
        if (ks.length < 2) return false;
        for (let i = 0; i < ks.length; i++) {
            const k = registry[ks[i]];
            if (!k || k.pickButton !== ev.index) continue;
            joined.set(key, ks[i]);
            ensureMapper(key);
            emit.playsAs(key, ks[i]);
            return true;
        }
        return false;
    }

    function claimedInput(key, ev) {
        if (!ev || ev.type !== 'button') return;
        const e = byKey.get(key) || null;
        if (ev.index === BACK_BUTTON && e && e.mapping === 'standard') {
            if (ev.pressed) {
                if (!holds.has(key)) {
                    holds.set(key, setTimer(() => {
                        holds.delete(key);
                        joined.delete(key);
                        release(key);
                        emit.leave(key);
                    }, LEAVE_HOLD_MS));
                }
            } else {
                cancelHold(key);
            }
        }
        const play = playKind(key);
        if (play === null && pick(key, e, ev)) return;
        const mapper = mapperFor(key);
        if (!mapper) return;
        const out = mapper.map(ev);
        const spec = play && specs.get(play);
        let s = null;
        for (let i = 0; i < out.length; i++) {
            const { action, value } = out[i];
            const on = value > 0;
            if (action === 'pause') {
                if (on) {
                    // Record the press so a mirrored twin slot's Start right after is not a join.
                    if (e && ev.t !== undefined) recentStart.set(e.id, { pad: e.index, t: ev.t });
                    // An undecided pad waits for its plays-as answer (X / B or the column).
                    if (play !== null) emit.primary(key);
                }
            } else if (spec && spec.lightOf.has(action)) {
                if (!s) s = lightState(play, key);
                s.held[action] = on;
                const light = spec.lightOf.get(action);
                const acts = spec.lights[light];
                let lit = false;
                for (let j = 0; j < acts.length; j++) if (s.held[acts[j]]) { lit = true; break; }
                s.lit[light] = lit;
            }
        }
        if (s) emit.light(key, s.lit);
    }

    function claimKey(key) {
        if (!running || claims.has(key) || !gamepadInput || typeof gamepadInput.claim !== 'function') return;
        const e = byKey.get(key);
        if (!e || !e.connected || (e.claimedBy && e.claimedBy !== OWNER)) return;
        let handle = null;
        try { handle = gamepadInput.claim(e.index, OWNER); } catch (_) { handle = null; }
        if (!handle) return;
        const listener = (ev) => claimedInput(key, ev);
        handle.addListener(listener);
        claims.set(key, { handle, listener });
    }

    function syncClaims() {
        for (const key of [...claims.keys()]) {
            const e = byKey.get(key);
            if (!joined.has(key) || !e || !e.connected) release(key);
        }
        for (const key of joined.keys()) {
            claimKey(key);
            if (claims.has(key)) ensureMapper(key);
        }
    }

    async function refresh() {
        const mine = ++seq;
        const lists = await Promise.all(kindIds.map((k) => listFrom(apiOf(k))));
        if (!running || mine !== seq) return;
        byKey.clear();
        byPad.clear();
        const listed = new Map();      // key -> { kind: listed binding kind }
        for (let i = 0; i < kindIds.length; i++) {
            for (const e of lists[i]) {
                if (!byKey.has(e.controllerKey)) { byKey.set(e.controllerKey, e); byPad.set(e.index, e); }
                let l = listed.get(e.controllerKey);
                if (!l) { l = {}; listed.set(e.controllerKey, l); }
                l[kindIds[i]] = e.kind || null;
            }
        }
        padKinds = new Map();
        for (const [key, l] of listed) {
            padKinds.set(key, Object.freeze(playableKinds(...PLAYABLE_ORDER.map((k) => l[k] || null))));
        }
        const setupWith = Object.freeze(kindIds.filter((k) => !!apiOf(k)));
        connected = new Set();
        standard = new Set();
        needsSetup = [];
        for (const e of byKey.values()) {
            if (e.mapping === 'standard') standard.add(e.controllerKey);
            if (!e.connected) continue;
            const key = e.controllerKey;
            connected.add(key);
            if (kindsOf(key).length === 0) {
                if (!joined.has(key)) needsSetup.push({ controllerKey: key, name: e.name, setupWith });
            } else {
                ensureMapper(key);
            }
        }
        syncClaims();
        emit.change();
    }

    function watched(ev) {
        if (!ev || ev.type !== 'button') return;
        const e = byPad.get(ev.pad);
        if (!e || !e.connected) return;
        const key = e.controllerKey;
        const ks = kindsOf(key);
        if (ks.length === 0) return;
        const mapper = mapperFor(key);
        if (!mapper) return;
        const out = mapper.map(ev);
        for (let i = 0; i < out.length; i++) {
            if (out[i].action !== 'pause' || !(out[i].value > 0)) continue;
            const prev = recentStart.get(e.id);
            // Core polls slots in ascending order within one tick, so the lowest slot's press
            // arrives first and wins.
            if (prev && prev.pad !== ev.pad && ev.t - prev.t >= 0 && ev.t - prev.t <= MIRROR_WINDOW_S) return;
            recentStart.set(e.id, { pad: ev.pad, t: ev.t });
            if (joined.has(key)) { claimKey(key); return; }
            joined.set(key, null);
            emit.join({ controllerKey: key, name: e.name, kinds: ks });
            claimKey(key);
            ensureMapper(key);
            return;
        }
    }

    function available() {
        return !!(gamepadInput && typeof gamepadInput.watch === 'function') && anyApi();
    }

    // [{ key, playsAs }] -> Map key -> playsAs (null: undecided).
    function joinedMap(list) {
        const m = new Map();
        for (const j of Array.isArray(list) ? list : []) {
            if (j && typeof j.key === 'string') m.set(j.key, typeof j.playsAs === 'string' ? j.playsAs : null);
        }
        return m;
    }

    function stopRunning() {
        running = false;
        seq++;
        runGen++;
        if (unwatch) { try { unwatch(); } catch (_) { /* ignore */ } unwatch = null; }
        if (unchange) { try { unchange(); } catch (_) { /* ignore */ } unchange = null; }
        for (const key of [...claims.keys()]) release(key);
        for (const key of [...holds.keys()]) cancelHold(key);
        for (const m of mappers.values()) m.clear();
        for (const p of pending.values()) p.clear();
        recentStart.clear();
    }

    return {
        // joinedList: [{ key, playsAs }], the band's joined controllers.
        start(joinedList) {
            if (running) stopRunning();
            joined = joinedMap(joinedList);
            if (!available()) return;
            running = true;
            try { unwatch = gamepadInput.watch(watched); } catch (_) { unwatch = null; }
            if (typeof gamepadInput.on === 'function') {
                try { unchange = gamepadInput.on('change', () => { refresh(); }); } catch (_) { unchange = null; }
            }
            refresh();
        },
        stop() { if (running) stopRunning(); },
        setJoined(joinedList) {
            joined = joinedMap(joinedList);
            if (running) syncClaims();
        },
        // kinds: Map controllerKey -> playable kinds; needsSetup: [{ controllerKey, name, setupWith }];
        // standard: the keys of standard-mapped pads (X / B answer plays-as on those).
        status() {
            let reason = null;
            if (!gamepadInput || typeof gamepadInput.watch !== 'function') reason = 'no-watch';
            else if (!anyApi()) reason = 'no-controller-plugins';
            return { available: reason === null, reason, needsSetup, connected, standard, kinds: padKinds };
        },
    };
}
