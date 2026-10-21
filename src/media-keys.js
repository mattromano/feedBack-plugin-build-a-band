// Media keys held over an overlay (plan 7 R15). Core sets no Media Session handlers, so
// Chromium's default play action would restart the ended song behind the results or
// Settings. While held, each action has a no-op handler; the last release puts back
// the default (null). Counted per session object.
export const MEDIA_ACTIONS = ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto'];

const noop = () => {};
// session -> { count, set: actions that took the handler }
const holds = new WeakMap();

// holdMediaKeys(navigator) -> release(). A no-op without a media session.
export function holdMediaKeys(nav) {
    const session = nav && nav.mediaSession;
    if (!session || typeof session.setActionHandler !== 'function') return () => {};
    let entry = holds.get(session);
    if (!entry) {
        entry = { count: 0, set: [] };
        for (const action of MEDIA_ACTIONS) {
            try {
                session.setActionHandler(action, noop);
                entry.set.push(action);
            } catch (_) { /* an unsupported action is skipped */ }
        }
        holds.set(session, entry);
    }
    entry.count++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (--entry.count > 0) return;
        holds.delete(session);
        for (const action of entry.set) {
            try { session.setActionHandler(action, null); } catch (_) { /* nothing to restore */ }
        }
    };
}
