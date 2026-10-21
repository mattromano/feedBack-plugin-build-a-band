// Start-to-join manager for the band screen. DOM-free: everything is injected.
//
// Unclaimed controllers are heard through core's passive `gamepadInput.watch`; a Start
// (`pause`) press on one that is set up joins it. Joined, connected controllers are
// claimed (owner `build_a_band`) so their frets light up and the menus stand down.
// `listControllers()` and `createMapper()` return Promises, so the controller list and
// the mappers are cached: input that arrives before a mapper resolves is ignored.
//
// Watch/handle event times (`t`) are seconds, as core reports them.
import { CONTROLLER_KINDS, kindFor as defaultKindFor } from './controller-model.js';

export const OWNER = 'build_a_band';
export const LEAVE_HOLD_MS = 1000;
export const MIRROR_WINDOW_S = 0.05;   // identical-id slots pressing Start within 50 ms are one press
const BACK_BUTTON = 8;                 // standard mapping
const FRETS = ['green', 'red', 'yellow', 'blue', 'orange'];

function newLit() {
    return { green: false, red: false, yellow: false, blue: false, orange: false, strum: false };
}

export function createJoinManager({
    gamepadInput, kinds = CONTROLLER_KINDS, kindFor = () => 'five_fret',
    setTimer, clearTimer, onJoin, onLeave, onPrimary, onLight, onChange,
} = {}) {
    const noop = () => {};
    const emit = { join: onJoin || noop, leave: onLeave || noop, primary: onPrimary || noop, light: onLight || noop, change: onChange || noop };

    let running = false;
    let seq = 0;                       // invalidates in-flight refreshes across stop/start
    let unwatch = null;
    let unchange = null;
    let joined = new Set();
    let entries = [];                  // cached controller list
    let connected = new Set();
    let needsSetup = [];
    const mappers = new Map();         // key -> mapper
    const pending = new Set();         // keys whose mapper is being created
    const claims = new Map();          // key -> { handle, listener }
    const lit = new Map();             // key -> lit flags (reused)
    const strums = new Map();          // key -> [up, down]
    const holds = new Map();           // key -> timer handle
    const recentStart = new Map();     // controller id -> { pad, t }

    const apiFor = (key) => {
        let kind;
        try { kind = kindFor(key); } catch (_) { kind = 'five_fret'; }
        const k = kinds && kinds[kind];
        try { return (k && k.api && k.api()) || null; } catch (_) { return null; }
    };
    const fiveFretApi = () => {
        const k = kinds && kinds.five_fret;
        try { return (k && k.api && k.api()) || null; } catch (_) { return null; }
    };
    const entryByKey = (key) => entries.find((e) => e.controllerKey === key) || null;
    const entryByPad = (index) => entries.find((e) => e.index === index) || null;

    function ensureMapper(key) {
        if (mappers.has(key) || pending.has(key)) return;
        const api = apiFor(key);
        if (!api || typeof api.createMapper !== 'function') return;
        pending.add(key);
        const mine = seq;
        (async () => {
            try {
                const m = await api.createMapper(key);
                if (m && mine === seq && running) mappers.set(key, m);
            } catch (_) { /* no mapper: stays ignored */ }
            pending.delete(key);
        })();
    }

    async function loadList() {
        const api = fiveFretApi();
        if (!api || typeof api.listControllers !== 'function') return [];
        try {
            const list = await api.listControllers();
            return Array.isArray(list) ? list.filter((c) => c && typeof c.controllerKey === 'string') : [];
        } catch (_) {
            return [];
        }
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

    function setLit(key, name, on) {
        let l = lit.get(key);
        if (!l) { l = newLit(); lit.set(key, l); }
        l[name] = on;
    }

    function claimedInput(key, ev) {
        if (!ev || ev.type !== 'button') return;
        if (ev.index === BACK_BUTTON) {
            const e = entryByKey(key);
            if (e && e.mapping === 'standard') {
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
        }
        const mapper = mappers.get(key);
        if (!mapper) { ensureMapper(key); return; }
        const out = mapper.map(ev);
        let changed = false;
        for (let i = 0; i < out.length; i++) {
            const { action, value } = out[i];
            const on = value > 0;
            if (action === 'pause') {
                if (on) emit.primary(key);
            } else if (FRETS.includes(action)) {
                setLit(key, action, on);
                changed = true;
            } else if (action === 'strum_up' || action === 'strum_down') {
                let s = strums.get(key);
                if (!s) { s = [false, false]; strums.set(key, s); }
                s[action === 'strum_up' ? 0 : 1] = on;
                setLit(key, 'strum', s[0] || s[1]);
                changed = true;
            }
        }
        if (changed) emit.light(key, lit.get(key));
    }

    function claimKey(key) {
        if (!running || claims.has(key) || !gamepadInput || typeof gamepadInput.claim !== 'function') return;
        const e = entryByKey(key);
        if (!e || !e.connected || (e.claimedBy && e.claimedBy !== OWNER)) return;
        let handle = null;
        try { handle = gamepadInput.claim(e.index, OWNER); } catch (_) { handle = null; }
        if (!handle) return;
        const listener = (ev) => claimedInput(key, ev);
        handle.addListener(listener);
        claims.set(key, { handle, listener });
        ensureMapper(key);
    }

    function syncClaims() {
        for (const key of [...claims.keys()]) {
            const e = entryByKey(key);
            if (!joined.has(key) || !e || !e.connected) release(key);
        }
        for (const key of joined) claimKey(key);
    }

    async function refresh() {
        const mine = ++seq;
        const list = await loadList();
        if (!running || mine !== seq) return;
        entries = list;
        connected = new Set();
        needsSetup = [];
        for (const e of list) {
            if (!e.connected) continue;
            connected.add(e.controllerKey);
            if (e.kind === null) {
                if (!joined.has(e.controllerKey)) needsSetup.push({ controllerKey: e.controllerKey, name: e.name });
            } else {
                ensureMapper(e.controllerKey);
            }
        }
        syncClaims();
        emit.change();
    }

    function watched(ev) {
        if (!ev || ev.type !== 'button') return;
        const e = entryByPad(ev.pad);
        if (!e || !e.connected || e.kind === null) return;
        const key = e.controllerKey;
        const mapper = mappers.get(key);
        if (!mapper) { ensureMapper(key); return; }
        const out = mapper.map(ev);
        for (let i = 0; i < out.length; i++) {
            if (out[i].action !== 'pause' || !(out[i].value > 0)) continue;
            const prev = recentStart.get(e.id);
            if (prev && prev.pad !== ev.pad && ev.t - prev.t >= 0 && ev.t - prev.t <= MIRROR_WINDOW_S) return;
            recentStart.set(e.id, { pad: ev.pad, t: ev.t });
            if (joined.has(key)) { claimKey(key); return; }
            joined.add(key);
            emit.join({ controllerKey: key, name: e.name });
            claimKey(key);
            return;
        }
    }

    function available() {
        return !!(gamepadInput && typeof gamepadInput.watch === 'function') && !!fiveFretApi();
    }

    function stopRunning() {
        running = false;
        seq++;
        if (unwatch) { try { unwatch(); } catch (_) { /* ignore */ } unwatch = null; }
        if (unchange) { try { unchange(); } catch (_) { /* ignore */ } unchange = null; }
        for (const key of [...claims.keys()]) release(key);
        for (const key of [...holds.keys()]) cancelHold(key);
        mappers.clear();
        pending.clear();
        recentStart.clear();
    }

    return {
        start(joinedKeys) {
            if (running) stopRunning();
            joined = new Set(Array.isArray(joinedKeys) ? joinedKeys : []);
            if (!available()) return;
            running = true;
            try { unwatch = gamepadInput.watch(watched); } catch (_) { unwatch = null; }
            if (typeof gamepadInput.on === 'function') {
                try { unchange = gamepadInput.on('change', () => { refresh(); }); } catch (_) { unchange = null; }
            }
            refresh();
        },
        stop() { if (running) stopRunning(); },
        setJoined(keys) {
            joined = new Set(Array.isArray(keys) ? keys : []);
            if (running) syncClaims();
        },
        status() {
            let reason = null;
            if (!gamepadInput || typeof gamepadInput.watch !== 'function') reason = 'no-watch';
            else if (!fiveFretApi()) reason = 'no-five-fret';
            return { available: reason === null, reason, needsSetup, connected };
        },
    };
}
