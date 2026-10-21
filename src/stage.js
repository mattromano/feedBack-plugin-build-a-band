// Build-a-Band stage: lays out the vocal strip and the guitar + drum lanes
// inside core's #player, under the band HUD bar. The strip is an empty slot
// that Lyrics Karaoke draws into. The main window.highway is sized into the
// guitar lane (or the drums lane for drums alone, or hidden for vocals
// alone); a drum lane beside guitar is its own createHighway() with the drums
// renderer, fed by a lane clock. Each lane has its own zoom.
// No DOM or browser access at module top level: planStage imports under node.
import { drumArrIndex } from './arrangements.js';
import { clampSplit, computeStageLayout, computeStageRows } from './layout.js';
import { createLaneClock } from './lane-clock.js';
import { clampLabelScale, clampZoom, savePrefs, ZOOM_STEP } from './prefs.js';
import { drumsDifficultyId } from './mappings.js';
import { icon } from './icons.js';
import { getWsUrl } from './ws-url.js';

const LABEL_STEP = 0.25;

// Which lanes a song gets for the parts switched on. Drums gets a lane when
// it is on and the song has a drum chart: a drum
// arrangement, or a song-level drum_tab. `drumIndex` is the drum
// arrangement's index (-1 when there is none); `laneArrangement` is what the
// drum lane's WS opens. Core streams a song's drum_tab on every arrangement's
// WS (ws_highway.py) and the drums renderer draws it on a non-drum part
// (drums screen.js _drumTabFor), so a drum-tab-only song opens the guitar
// arrangement the main highway is on (undefined: core's default).
// `strip` puts the vocal strip on (vocals switched on). `mainPart` is the lane
// holding the main highway: 'guitar' when guitar is on; 'drums' for drums
// alone, with or without the strip (the drum chart is already on the main
// highway); null otherwise (no playable lane: vocals alone, or nothing).
export function planStage(song, parts = { guitar: { on: true }, drums: { on: true } }) {
    const hasDrumTab = !!(song && (song.hasDrumTab || song.has_drum_tab));
    const drumIndex = drumArrIndex(song && song.arrangements, { hasDrumTab });
    const current = song && song.arrangementIndex;
    const laneArrangement = drumIndex >= 0 ? drumIndex
        : (hasDrumTab && Number.isInteger(current) && current >= 0 ? current : undefined);
    const strip = !!(parts && parts.vocals && parts.vocals.on === true);
    const plan = (mainPart, lanes) => ({ strip, mainPart, lanes, drumIndex, laneArrangement });
    const on = (id) => !(parts && parts[id] && parts[id].on === false);
    const drumChart = on('drums') && (drumIndex >= 0 || hasDrumTab);
    if (on('guitar')) return plan('guitar', drumChart ? ['guitar', 'drums'] : ['guitar']);
    if (drumChart) return plan('drums', ['drums']);
    return plan(null, []);
}

function safe(fn) {
    try { return fn(); } catch (e) { console.warn('[build-a-band]', e); return undefined; }
}

// mountStage({ player, song, prefs, deps })
//   -> { unmount(), setSplit(pct), stripSlot, laneSlot(part), getDrumCanvas() }
// stripSlot is the vocal strip's empty container (null without vocals).
// laneSlot(part) is a lane's slot element (null when the part has no lane);
// getDrumCanvas() is the live drum-lane canvas (null without a second highway).
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
    const guitarMain = plan.mainPart === 'guitar';
    let lanes = plan.lanes;
    if (guitarMain && lanes.includes('drums') && (typeof drumRenderer !== 'function' || typeof makeHighway !== 'function')) {
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
    // Vocal strip slot: first child, full width under the HUD row.
    const rows = computeStageRows({ strip: plan.strip, lanes });
    let stripSlot = null;
    if (rows.strip) {
        stripSlot = doc.createElement('div');
        stripSlot.className = 'bab-strip';
        stripSlot.dataset.part = 'vocals';
        stripSlot.style.top = rows.strip.topPx + 'px';
        if (rows.strip.fill) stripSlot.style.bottom = '0px';
        else stripSlot.style.height = rows.strip.heightPx + 'px';
        root.appendChild(stripSlot);
    }
    if (rows.lanesTopPx !== null) player.style.setProperty('--bab-lanes-top', rows.lanesTopPx + 'px');
    for (const part of lanes) if (part !== 'drums') root.appendChild(slots[part]);
    let divider = null;
    if (slots.drums && lanes.length === 2) {
        divider = doc.createElement('div');
        divider.className = 'bab-divider';
        divider.setAttribute('role', 'separator');
        divider.setAttribute('aria-orientation', 'vertical');
        divider.title = 'Drag to resize lanes';
        root.appendChild(divider);
    }
    if (slots.drums) root.appendChild(slots.drums);
    // The slot holding the main highway is see-through (CSS).
    if (plan.mainPart && slots[plan.mainPart]) slots[plan.mainPart].classList.add('bab-lane-main');

    // Fret-number size: band mode has its own (prefs.labelScale). Applied for
    // this session only ({ persist: false }) so core's saved solo-play value is
    // untouched, and the solo value is put back on unmount.
    // Guitar only: the fret numbers belong to the guitar chart.
    const soloLabelScale = guitarMain ? safe(() => mainHw.getLabelScale()) : undefined;
    let labelScale = clampLabelScale(prefs && prefs.labelScale);
    if (guitarMain) safe(() => mainHw.setLabelScale(labelScale, { persist: false }));

    // Per-lane zoom. Each lane has an invisible, untransformed measuring box
    // (100/z % of the lane) that its highway sizes to; the canvas is drawn at
    // scale(z) from the top-left, so it fills the lane exactly. Core's resize()
    // measures getBoundingClientRect(), so the box itself is never transformed.
    const zoom = {
        guitar: clampZoom(prefs && prefs.zoom && prefs.zoom.guitar),
        drums: clampZoom(prefs && prefs.zoom && prefs.zoom.drums),
    };
    const boxes = {};
    let drumHw = null;
    let drumCanvas = null;
    function sizeBox(part) {
        boxes[part].style.width = (100 / zoom[part]) + '%';
        boxes[part].style.height = (100 / zoom[part]) + '%';
    }
    function scaleDrumCanvas(c) {
        c.style.position = 'absolute';
        c.style.left = '0px';
        c.style.top = '0px';
        c.style.transformOrigin = '0 0';
        c.style.transform = 'scale(' + zoom.drums + ')';
    }
    function applyZoom(part) {
        sizeBox(part);
        if (part === plan.mainPart) {
            player.style.setProperty('--bab-main-zoom', String(zoom[part]));
            safe(() => mainHw.resize());
        } else if (part === 'drums' && drumHw) {
            if (drumCanvas) scaleDrumCanvas(drumCanvas);
            safe(() => drumHw.resize());
        }
    }

    // Lane chrome, shown on hover: guitar has fret-number size and zoom,
    // drums has zoom.
    // content: { text } or { html } (a Lucide icon).
    const chromeBtn = (content, title, onClick) => {
        const b = doc.createElement('button');
        b.type = 'button';
        if (content.html) b.innerHTML = content.html;
        else b.textContent = content.text;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return b;
    };
    const chromeLabel = (text, cls) => {
        const l = doc.createElement('span');
        if (cls) l.className = cls;
        l.textContent = text;
        return l;
    };
    const labelStep = (delta) => () => {
        const next = clampLabelScale(Math.round((labelScale + delta) * 100) / 100);
        if (next === labelScale) return;
        labelScale = next;
        safe(() => mainHw.setLabelScale(next, { persist: false }));
        safe(() => persist({ labelScale: next }));
    };
    const zoomStep = (part, dir) => () => {
        const next = clampZoom(zoom[part] + dir * ZOOM_STEP);
        if (next === zoom[part]) return;
        safe(() => persist({ zoom: { ...zoom, [part]: next } }));
        zoom[part] = next;
        applyZoom(part);
    };
    for (const part of lanes) {
        const chrome = doc.createElement('div');
        chrome.className = 'bab-lane-chrome';
        if (part === 'guitar') {
            chrome.append(chromeLabel('Fret numbers'),
                chromeBtn({ text: '−' }, 'Smaller fret numbers', labelStep(-LABEL_STEP)),
                chromeBtn({ text: '+' }, 'Bigger fret numbers', labelStep(LABEL_STEP)));
        }
        chrome.append(chromeLabel('Zoom', 'bab-chrome-zoom'),
            chromeBtn({ html: icon('zoom-out', { size: 14 }) }, 'Zoom out', zoomStep(part, -1)),
            chromeBtn({ html: icon('zoom-in', { size: 14 }) }, 'Zoom in', zoomStep(part, 1)));
        slots[part].appendChild(chrome);
        const box = doc.createElement('div');
        box.className = 'bab-zoom-box';
        boxes[part] = box;
        sizeBox(part);
        slots[part].appendChild(box);
    }
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

    function resizeAll() {
        safe(() => mainHw.resize());
        if (drumHw) safe(() => drumHw.resize());
    }

    fitFooter();
    applyLayout();

    // 4-5. Main highway into its slot (CSS positions #highway over it). With
    // no lane (vocals alone) it is hidden at the very end of mount, after
    // everything that can throw, so an aborted mount never leaves #highway
    // hidden for solo play.
    const mainHidden = !plan.mainPart;
    if (!mainHidden) {
        player.style.setProperty('--bab-main-zoom', String(zoom[plan.mainPart]));
        safe(() => mainHw.setContainer(boxes[plan.mainPart]));
    }

    // The drum canvas core is actually drawing on. A renderer whose context
    // type differs from the canvas's (the drums 3D view is webgl2) makes core
    // clone the canvas into the slot (_replaceCanvas) and announce it with
    // highway:canvas-replaced — during init, or on any later view switch.
    // Follow it, as splitscreen does, so kit hits and teardown target the
    // live element rather than the detached original.
    function adoptCanvas(next) {
        if (!next || next === drumCanvas) return;
        drumCanvas = next;
        scaleDrumCanvas(drumCanvas);
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
    if (slots.drums && guitarMain) {
        try {
            drumCanvas = doc.createElement('canvas');
            drumCanvas.className = 'bab-drum-canvas';
            drumCanvas.style.cssText = 'width:100%;height:100%;display:block;';
            scaleDrumCanvas(drumCanvas);
            slots.drums.appendChild(drumCanvas);
            const hw = makeHighway();
            drumHw = hw;
            // Renderer before init so the fresh canvas locks to its context
            // type (splitscreen's recreatePanelHighway order). The lane's zoom
            // box is passed as init's resize container, so core's own resize()
            // measures the box, applies the effective render scale and
            // notifies the renderer (renderer.resize(w, h), gated on it being
            // inited). A hand-rolled resize override can't reach the renderer.
            hw.setRenderer(drumRenderer());
            hw.init(drumCanvas, boxes.drums);
            if (drumCanvas.parentNode !== slots.drums) adoptCanvas(slotCanvas());
            // secondary: parse and draw the drum chart without rebroadcasting
            // it as the current song (song:loaded / song:ready / beats:loaded).
            hw.connect(wsUrl(song.filename, plan.laneArrangement), { onSongInfo() {}, secondary: true });
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

    // Hover over a lane reveals its chrome. Tracked on #player by rect, since
    // the canvases and overlays above the lanes would swallow :hover.
    function onPointerMove(e) {
        for (const slot of Object.values(slots)) {
            const r = slot.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
            slot.classList.toggle('bab-hover', inside);
        }
    }
    function onPointerLeave() { for (const slot of Object.values(slots)) slot.classList.remove('bab-hover'); }
    if (lanes.length > 0) {
        player.addEventListener('pointermove', onPointerMove);
        player.addEventListener('pointerleave', onPointerLeave);
    }

    function onWindowResize() { fitFooter(); resizeAll(); }
    win.addEventListener('resize', onWindowResize);
    let footerObserver = null;
    const footerEl = doc.getElementById('player-footer');
    if (footerEl && typeof win.ResizeObserver === 'function') {
        footerObserver = new win.ResizeObserver(() => { fitFooter(); if (drumHw) safe(() => drumHw.resize()); });
        footerObserver.observe(footerEl);
    }
    resizeAll();

    // Vocals alone: setVisible(false) stops the main highway's drawing and the
    // class hides the last frame it left on the canvas.
    if (mainHidden) {
        player.classList.add('bab-main-hidden');
        safe(() => mainHw.setVisible(false));
    }

    let mounted = true;
    return {
        stripSlot,
        laneSlot(part) { return slots[part] || null; },
        getDrumCanvas() { return drumHw ? drumCanvas : null; },
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
            // 5-7. Main highway back to viewport sizing (or shown again).
            if (mainHidden) {
                safe(() => mainHw.setVisible(null));
                player.classList.remove('bab-main-hidden');
            } else {
                safe(() => mainHw.setContainer(null));
            }
            safe(() => player.style.removeProperty('--bab-lanes-top'));
            safe(() => player.style.removeProperty('--bab-main-zoom'));
            player.classList.remove('bab-stage');
            if (stripSlot) safe(() => stripSlot.remove());
            safe(() => root.remove());
            safe(() => mainHw.resize());
        },
    };
}
