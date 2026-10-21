// Build-a-Band stage: lays out guitar + drum lanes inside core's #player.
// The guitar lane is the main window.highway sized into a slot; the drum lane
// is its own createHighway() with the drums renderer, fed by a lane clock.
// No DOM or browser access at module top level: planStage imports under node.
import { findDrumArrangement } from './arrangements.js';
import { clampSplit, computeStageLayout } from './layout.js';
import { createLaneClock } from './lane-clock.js';
import { clampLabelScale, savePrefs } from './prefs.js';
import { drumsDifficultyId } from './mappings.js';
import { getWsUrl } from './ws-url.js';

const LABEL_STEP = 0.25;

// Which lanes a song gets for the parts switched on. Guitar off means no
// stage (a drums-only session plays the drum arrangement on the main
// highway); drums gets a lane when it is on and the song has a drum chart.
export function planStage(song, parts = { guitar: { on: true }, drums: { on: true } }) {
    const drumIndex = findDrumArrangement(song && song.arrangements,
        { hasDrumTab: !!(song && (song.hasDrumTab || song.has_drum_tab)) });
    const on = (id) => !(parts && parts[id] && parts[id].on === false);
    if (!on('guitar')) return { lanes: [], drumIndex };
    return { lanes: on('drums') && drumIndex >= 0 ? ['guitar', 'drums'] : ['guitar'], drumIndex };
}

function safe(fn) {
    try { return fn(); } catch (e) { console.warn('[build-a-band]', e); return undefined; }
}

// mountStage({ player, song, prefs, deps }) -> { unmount(), setSplit(pct) }
// deps (all optional, default to the window globals):
//   createHighway, getWsUrl, getDisplayTime, drumsApi, splitscreen,
//   mainHighway, drumRenderer (factory returning a renderer), savePrefs,
//   bus (core's window.feedBack event bus).
export function mountStage({ player, song, prefs, deps = {} }) {
    const doc = player.ownerDocument;
    const win = doc.defaultView;
    const mainHw = deps.mainHighway || win.highway;
    const makeHighway = deps.createHighway || win.createHighway;
    const wsUrl = deps.getWsUrl || getWsUrl;
    // Core's display time (follows the count-in rewind sweep); #audio on older cores.
    const displayTime = deps.getDisplayTime || (() => {
        const fb = win.feedBack;
        if (fb && typeof fb.getDisplayTime === 'function') return fb.getDisplayTime();
        const audio = doc.getElementById('audio');
        return audio ? audio.currentTime : NaN;
    });
    const drumsApi = 'drumsApi' in deps ? deps.drumsApi : win.feedBackDrums;
    const splitscreen = 'splitscreen' in deps ? deps.splitscreen : win.slopsmithSplitscreen;
    const drumRenderer = deps.drumRenderer || win.feedBackViz_drums;
    const persist = deps.savePrefs || savePrefs;
    const bus = 'bus' in deps ? deps.bus : win.feedBack;

    // 1. Band mode and splitscreen never run at once.
    safe(() => splitscreen && splitscreen.stop());

    const parts = (prefs && prefs.parts) || undefined;
    const plan = planStage(song, parts);
    // The band drum difficulty, pinned to whichever canvas takes kit input.
    const drumsDiff = drumsDifficultyId(parts && parts.drums && parts.drums.difficulty);
    function pinDrums(canvas) {
        safe(() => drumsApi && drumsApi.setInputTarget(canvas));
        if (drumsApi && typeof drumsApi.setDifficulty === 'function') safe(() => drumsApi.setDifficulty(drumsDiff, canvas));
    }
    let lanes = plan.lanes;
    if (lanes.includes('drums') && (typeof drumRenderer !== 'function' || typeof makeHighway !== 'function')) {
        console.warn('[build-a-band] drums plugin or createHighway missing; guitar lane only');
        lanes = ['guitar'];
    }
    let split = clampSplit(prefs && prefs.split);

    // 2-3. Stage DOM.
    player.classList.add('bab-stage');
    const root = doc.createElement('div');
    root.className = 'bab-lanes';
    const slots = {};
    for (const part of lanes) {
        const slot = doc.createElement('div');
        slot.className = 'bab-lane';
        slot.dataset.part = part;
        slots[part] = slot;
    }
    root.appendChild(slots.guitar);
    let divider = null;
    if (slots.drums) {
        divider = doc.createElement('div');
        divider.className = 'bab-divider';
        divider.setAttribute('role', 'separator');
        divider.setAttribute('aria-orientation', 'vertical');
        divider.title = 'Drag to resize lanes';
        root.appendChild(divider);
        root.appendChild(slots.drums);
    }

    // Fret-number size: band mode has its own (prefs.labelScale). Applied for
    // this session only ({ persist: false }) so core's saved solo-play value is
    // untouched, and the solo value is put back on unmount.
    const soloLabelScale = safe(() => mainHw.getLabelScale());
    let labelScale = clampLabelScale(prefs && prefs.labelScale);
    safe(() => mainHw.setLabelScale(labelScale, { persist: false }));

    // Guitar lane chrome: fret-number label scale, shown on hover.
    const chrome = doc.createElement('div');
    chrome.className = 'bab-lane-chrome';
    const chromeLabel = doc.createElement('span');
    chromeLabel.textContent = 'Fret numbers';
    const stepBtn = (text, delta, title) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.title = title;
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = clampLabelScale(Math.round((labelScale + delta) * 100) / 100);
            if (next === labelScale) return;
            labelScale = next;
            safe(() => mainHw.setLabelScale(next, { persist: false }));
            safe(() => persist({ labelScale: next }));
        });
        return b;
    };
    chrome.append(chromeLabel,
        stepBtn('−', -LABEL_STEP, 'Smaller fret numbers'),
        stepBtn('+', LABEL_STEP, 'Bigger fret numbers'));
    slots.guitar.appendChild(chrome);
    player.appendChild(root);

    // Lanes stop above the footer, as core's own viewport sizing does.
    function fitFooter() {
        const footer = doc.getElementById('player-footer') || doc.getElementById('player-controls');
        root.style.bottom = (footer ? footer.offsetHeight : 0) + 'px';
    }

    function applyLayout() {
        for (const { part, leftPct, widthPct } of computeStageLayout({ lanes, split })) {
            slots[part].style.left = leftPct + '%';
            slots[part].style.width = widthPct + '%';
        }
        if (divider) divider.style.left = split + '%';
    }

    let drumHw = null;
    let drumCanvas = null;
    function resizeAll() {
        safe(() => mainHw.resize());
        if (drumHw) safe(() => drumHw.resize());
    }

    fitFooter();
    applyLayout();

    // 4-5. Main highway into the guitar slot (CSS positions #highway over it).
    safe(() => mainHw.setContainer(slots.guitar));

    // The drum canvas core is actually drawing on. A renderer whose context
    // type differs from the canvas's (the drums 3D view is webgl2) makes core
    // clone the canvas into the slot (_replaceCanvas) and announce it with
    // highway:canvas-replaced — during init, or on any later view switch.
    // Follow it, as splitscreen does, so kit hits and teardown target the
    // live element rather than the detached original.
    function adoptCanvas(next) {
        if (!next || next === drumCanvas) return;
        drumCanvas = next;
        if (drumHw) pinDrums(drumCanvas);
    }
    function onCanvasReplaced(e) {
        const d = e && e.detail;
        if (d && drumCanvas && d.oldCanvas === drumCanvas) adoptCanvas(d.newCanvas);
    }
    // Fallback for a core that swaps without announcing: the slot's canvas.
    function slotCanvas() {
        const kids = slots.drums ? Array.from(slots.drums.children || []) : [];
        return kids.find((c) => c && c.tagName === 'CANVAS') || null;
    }
    const listenBus = !!(bus && typeof bus.on === 'function');
    if (listenBus) bus.on('highway:canvas-replaced', onCanvasReplaced);

    // Drum lane: splitscreen's recreatePanelHighway pattern.
    const clock = createLaneClock({
        getTime: () => {
            const t = displayTime();
            if (!Number.isFinite(t)) throw new Error('no song time');
            return t;
        },
    });
    if (slots.drums) {
        try {
            drumCanvas = doc.createElement('canvas');
            drumCanvas.className = 'bab-drum-canvas';
            drumCanvas.style.cssText = 'width:100%;height:100%;display:block;';
            slots.drums.appendChild(drumCanvas);
            const hw = makeHighway();
            drumHw = hw;
            // Renderer before init so the fresh canvas locks to its context
            // type (splitscreen's recreatePanelHighway order). The drums slot
            // is passed as init's resize container, so core's own resize()
            // measures the slot, applies the effective render scale and
            // notifies the renderer (renderer.resize(w, h), gated on it being
            // inited). A hand-rolled resize override can't reach the renderer.
            hw.setRenderer(drumRenderer());
            hw.init(drumCanvas, slots.drums);
            if (drumCanvas.parentNode !== slots.drums) adoptCanvas(slotCanvas());
            // secondary: parse and draw the drum chart without rebroadcasting
            // it as the current song (song:loaded / song:ready / beats:loaded).
            hw.connect(wsUrl(song.filename, plan.drumIndex), { onSongInfo() {}, secondary: true });
            hw.resize();
            clock.add(hw);
            clock.start();
            pinDrums(drumCanvas);
        } catch (e) {
            // Fall back to the guitar lane alone rather than an empty slot.
            console.error('[build-a-band] drum lane failed to start; guitar lane only', e);
            safe(() => clock.stop());
            if (drumHw) { const hw = drumHw; drumHw = null; safe(() => clock.remove(hw)); safe(() => hw.stop()); }
            safe(() => drumsApi && drumsApi.setInputTarget(null));
            if (drumCanvas) safe(() => drumCanvas.remove());
            safe(() => slots.drums.remove());
            safe(() => divider.remove());
            drumCanvas = null;
            divider = null;
            delete slots.drums;
            lanes = ['guitar'];
            applyLayout();
        }
    }

    // Divider drag: live widths + resize, persist on release.
    let dragging = false;
    function onDragMove(e) {
        if (!dragging) return;
        const rect = root.getBoundingClientRect();
        if (!(rect.width > 0)) return;
        split = clampSplit(((e.clientX - rect.left) / rect.width) * 100);
        applyLayout();
        resizeAll();
    }
    function endDrag() {
        if (!dragging) return;
        dragging = false;
        root.classList.remove('bab-dragging');
        win.removeEventListener('pointermove', onDragMove);
        win.removeEventListener('pointerup', onDragEnd);
        win.removeEventListener('pointercancel', onDragEnd);
    }
    function onDragEnd() {
        endDrag();
        persist({ split });
    }
    if (divider) {
        divider.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            dragging = true;
            root.classList.add('bab-dragging');
            win.addEventListener('pointermove', onDragMove);
            win.addEventListener('pointerup', onDragEnd);
            win.addEventListener('pointercancel', onDragEnd);
        });
    }

    // Hover over the guitar lane reveals its chrome. Tracked on #player by
    // rect, since the canvas and overlays above it would swallow :hover.
    function onPointerMove(e) {
        const r = slots.guitar.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
        slots.guitar.classList.toggle('bab-hover', inside);
    }
    function onPointerLeave() { slots.guitar.classList.remove('bab-hover'); }
    player.addEventListener('pointermove', onPointerMove);
    player.addEventListener('pointerleave', onPointerLeave);

    function onWindowResize() { fitFooter(); resizeAll(); }
    win.addEventListener('resize', onWindowResize);
    let footerObserver = null;
    const footerEl = doc.getElementById('player-footer');
    if (footerEl && typeof win.ResizeObserver === 'function') {
        footerObserver = new win.ResizeObserver(() => { fitFooter(); if (drumHw) safe(() => drumHw.resize()); });
        footerObserver.observe(footerEl);
    }
    resizeAll();

    let mounted = true;
    return {
        setSplit(pct) {
            if (!mounted) return;
            split = clampSplit(pct);
            applyLayout();
            resizeAll();
        },
        unmount() {
            if (!mounted) return;
            mounted = false;
            endDrag();
            player.removeEventListener('pointermove', onPointerMove);
            player.removeEventListener('pointerleave', onPointerLeave);
            win.removeEventListener('resize', onWindowResize);
            if (footerObserver) safe(() => footerObserver.disconnect());
            if (listenBus) safe(() => bus.off('highway:canvas-replaced', onCanvasReplaced));
            // 1. Lane clock.
            safe(() => clock.stop());
            // 2. Drum highway (closes its WS, stops its draw loop) + canvas.
            if (drumHw) {
                const hw = drumHw;
                safe(() => clock.remove(hw));
                safe(() => hw.stop());
                drumHw = null;
            }
            if (drumCanvas) { safe(() => drumCanvas.remove()); drumCanvas = null; }
            // 3. Kit routing back to default.
            safe(() => drumsApi && drumsApi.setInputTarget(null));
            // 4. The solo-play fret-number size, unpersisted (it is already saved).
            if (Number.isFinite(soloLabelScale)) safe(() => mainHw.setLabelScale(soloLabelScale, { persist: false }));
            // 5-7. Main highway back to viewport sizing.
            safe(() => mainHw.setContainer(null));
            player.classList.remove('bab-stage');
            safe(() => root.remove());
            safe(() => mainHw.resize());
        },
    };
}
