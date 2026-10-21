// Window full screen for the stage (plan 7 R2, R20): the HTML Fullscreen API on the
// whole document, so the sidebar and Settings overlays still show over the player.
// It only leaves a full screen it asked for, and never asks when the window already
// fills the screen (the user's own native full screen) or without user activation
// (a Go from a drum pad): the stage then stays in full mode inside the window.

// alreadyFullScreen(win) -> true when the window covers the whole screen.
export function alreadyFullScreen(win) {
    const scr = win && win.screen;
    const width = scr && scr.width;
    const height = scr && scr.height;
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return false;
    return win.outerWidth >= width && win.outerHeight >= height;
}

// createFullScreen({ doc, win }) -> { request(), exit(), isOn(), onChange(fn) }
export function createFullScreen({ doc, win }) {
    let ours = false;
    let warned = false;

    const isOn = () => !!doc.fullscreenElement;

    function request() {
        if (isOn() || alreadyFullScreen(win)) return false;
        const activation = win && win.navigator && win.navigator.userActivation;
        if (activation && activation.isActive === false) return false;
        const root = doc.documentElement;
        if (!root || typeof root.requestFullscreen !== 'function') return false;
        ours = true;
        const refused = (err) => {
            ours = false;
            if (warned) return;
            warned = true;
            console.warn('[build-a-band] full screen refused', err);
        };
        try {
            const p = root.requestFullscreen();
            if (p && typeof p.catch === 'function') p.catch(refused);
        } catch (err) {
            refused(err);
        }
        return true;
    }

    function exit() {
        if (ours && doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
            try {
                const p = doc.exitFullscreen();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) { /* already left */ }
        }
        ours = false;
    }

    function onChange(fn) {
        doc.addEventListener('fullscreenchange', fn);
        return () => doc.removeEventListener('fullscreenchange', fn);
    }

    return { request, exit, isOn, onChange };
}
