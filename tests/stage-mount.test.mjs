// mountStage against a minimal fake DOM: lane structure, the no-drums path,
// failure fallback and idempotent teardown. Real layout/rendering is checked
// in the app (Task 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountStage } from '../src/stage.js';

function makeListeners() {
    const map = new Map();
    return {
        addEventListener(t, f) { (map.get(t) || map.set(t, new Set()).get(t)).add(f); },
        removeEventListener(t, f) { map.get(t)?.delete(f); },
        count() { let n = 0; for (const s of map.values()) n += s.size; return n; },
        fire(t, e) { for (const f of [...(map.get(t) || [])]) f(e); },
    };
}

// Plain style properties plus custom properties backed by a map.
function makeStyle() {
    const props = new Map();
    const style = {};
    Object.defineProperties(style, {
        setProperty: { value: (k, v) => { props.set(k, String(v)); } },
        removeProperty: { value: (k) => { props.delete(k); } },
        getPropertyValue: { value: (k) => (props.has(k) ? props.get(k) : '') },
    });
    return style;
}

function makeEl(tag, doc) {
    const classes = new Set();
    const el = {
        tagName: tag.toUpperCase(), ownerDocument: doc, parentNode: null, children: [],
        style: makeStyle(), dataset: {}, attrs: {}, className: '', textContent: '', title: '',
        classList: {
            add: (c) => classes.add(c), remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        },
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
        append(...cs) { cs.forEach((c) => this.appendChild(c)); },
        remove() {
            if (!this.parentNode) return;
            const p = this.parentNode.children;
            p.splice(p.indexOf(this), 1);
            this.parentNode = null;
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }),
        offsetHeight: 0,
        ...makeListeners(),
    };
    return el;
}

function setup() {
    const win = makeListeners();
    const doc = { defaultView: win, ids: {} };
    doc.createElement = (t) => makeEl(t, doc);
    doc.getElementById = (id) => doc.ids[id] || null;
    const player = makeEl('div', doc);
    const footer = makeEl('div', doc);
    footer.offsetHeight = 48;
    doc.ids['player-footer'] = footer;

    const log = [];
    // Core's event bus: on/off/emit with a CustomEvent-like { detail }.
    const busL = makeListeners();
    const bus = {
        on: (t, f) => busL.addEventListener(t, f),
        off: (t, f) => busL.removeEventListener(t, f),
        emit: (t, detail) => busL.fire(t, { detail }),
        count: () => busL.count(),
    };
    const mainHw = {
        scale: 1.5, // the user's solo-play fret-number size
        resize: () => log.push('main.resize'),
        setContainer: (el) => log.push(el ? 'main.setContainer(slot)' : 'main.setContainer(null)'),
        setVisible: (v) => log.push('main.setVisible(' + v + ')'),
        getLabelScale: () => mainHw.scale,
        setLabelScale: (v, opts) => {
            mainHw.scale = Math.max(0.75, Math.min(2.5, v));
            log.push('label ' + v + (opts && opts.persist === false ? ' (session)' : ' (persisted)'));
        },
    };
    const drumHws = [];
    const coreResize = () => log.push('drum.resize');
    const createHighway = () => {
        const hw = {
            getRenderScale: () => 1,
            setRenderer: (r) => log.push('drum.setRenderer'),
            init: (c, container) => { hw.initArgs = [c, container]; log.push('drum.init'); hw.resize(); },
            connect: (url, opts) => { hw.connectOpts = opts; log.push('drum.connect ' + url); },
            setTime: () => {},
            stop: () => log.push('drum.stop'),
            resize: coreResize,
        };
        drumHws.push(hw);
        return hw;
    };
    const targets = [];
    const drumsApi = { setInputTarget: (c) => { targets.push(c); log.push(c ? 'drums.target(canvas)' : 'drums.target(null)'); } };
    const splitscreen = { stop: () => log.push('split.stop') };
    const deps = {
        mainHighway: mainHw, createHighway, drumsApi, splitscreen, bus,
        getWsUrl: (f, i) => `ws://x/${f}?arrangement=${i}`,
        getDisplayTime: () => 1.5,
        drumRenderer: () => ({}),
        savePrefs: (p) => log.push('save ' + JSON.stringify(p)),
    };
    return { win, doc, player, log, deps, drumHws, mainHw, bus, targets };
}

const withDrums = { filename: 'a.psarc', arrangements: [{ name: 'Lead' }, { name: 'Drums' }] };
const noDrums = { filename: 'a.psarc', arrangements: [{ name: 'Lead' }] };
const tabOnly = { filename: 'deep.feedpak', hasDrumTab: true, arrangementIndex: 0,
    arrangements: [{ index: 0, name: 'Lead' }, { index: 1, name: 'Rhythm' }, { index: 2, name: 'Bass' }] };

// The lane clock defaults to rAF; give node a no-op pair.
globalThis.requestAnimationFrame ??= () => 1;
globalThis.cancelAnimationFrame ??= () => {};

test('two lanes: splitscreen stops first, slots sized by split, drum lane wired', () => {
    const { player, log, deps, drumHws } = setup();
    mountStage({ player, song: withDrums, prefs: { split: 70 }, deps });
    assert.equal(log[0], 'split.stop');
    assert.ok(player.classList.contains('bab-stage'));
    const root = player.children[0];
    assert.equal(root.className, 'bab-lanes');
    assert.equal(root.style.bottom, '48px');
    const [guitar, divider, drums] = root.children;
    assert.equal(guitar.dataset.part, 'guitar');
    assert.equal(guitar.style.width, '70%');
    assert.equal(divider.className, 'bab-divider');
    assert.equal(divider.style.left, '70%');
    assert.equal(drums.dataset.part, 'drums');
    assert.equal(drums.style.left, '70%');
    assert.equal(drums.style.width, '30%');
    assert.ok(log.indexOf('drum.setRenderer') < log.indexOf('drum.init'));
    assert.ok(log.includes('main.setContainer(slot)'));
    assert.ok(log.includes('drum.connect ws://x/a.psarc?arrangement=1'));
    assert.ok(log.includes('drums.target(canvas)'));
    // Core's own resize() sizes the drum canvas to the slot (so the renderer
    // is notified): init gets the slot as container, resize is not replaced.
    const [canvas, container] = drumHws[0].initArgs;
    assert.equal(container, drums);
    assert.equal(canvas.parentNode, drums);
    assert.equal(drumHws[0].resize.name, 'coreResize', 'drum hw.resize not overridden');
});

test('no drum chart: guitar alone at full width, no drum highway', () => {
    const { player, log, deps, drumHws } = setup();
    const s = mountStage({ player, song: noDrums, prefs: { split: 62 }, deps });
    const root = player.children[0];
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].style.width, '100%');
    assert.equal(drumHws.length, 0);
    s.unmount();
    assert.equal(player.children.length, 0);
    assert.ok(!log.includes('drum.stop'));
});

test('unmount restores everything in order and is idempotent', () => {
    const { win, player, log, deps } = setup();
    const s = mountStage({ player, song: withDrums, prefs: {}, deps });
    log.length = 0;
    s.unmount();
    assert.deepEqual(log, ['drum.stop', 'drums.target(null)', 'label 1.5 (session)', 'main.setContainer(null)', 'main.resize']);
    assert.ok(!player.classList.contains('bab-stage'));
    assert.equal(player.children.length, 0);
    assert.equal(win.count(), 0, 'window listeners removed');
    assert.equal(player.count(), 0, 'player listeners removed');
    log.length = 0;
    assert.doesNotThrow(() => s.unmount());
    assert.deepEqual(log, []);
});

test('divider drag resizes live and saves the clamped split on release', () => {
    const { win, player, log, deps } = setup();
    const s = mountStage({ player, song: withDrums, prefs: {}, deps });
    const [guitar, divider] = player.children[0].children;
    const before = win.count();
    divider.fire('pointerdown', { preventDefault() {} });
    win.fire('pointermove', { clientX: 950 }); // 95% -> clamped to 80
    assert.equal(guitar.style.width, '80%');
    win.fire('pointerup', {});
    assert.ok(log.includes('save {"split":80}'));
    assert.equal(win.count(), before, 'drag listeners removed');
    s.unmount();
});

test('drum lane failure falls back to guitar only and still tears down', () => {
    const { win, player, log, deps } = setup();
    deps.drumRenderer = () => { throw new Error('boom'); };
    const errors = [];
    const error = console.error;
    console.error = (...a) => errors.push(a);
    let s;
    try { s = mountStage({ player, song: withDrums, prefs: {}, deps }); } finally { console.error = error; }
    assert.match(String(errors[0] && errors[0][0]), /drum lane failed to start/);
    const root = player.children[0];
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].style.width, '100%');
    s.unmount();
    assert.equal(player.children.length, 0);
    assert.equal(win.count(), 0);
});

test('fret number buttons step the band scale by 0.25 without touching the solo preference', () => {
    const { player, log, deps } = setup();
    const s = mountStage({ player, song: noDrums, prefs: {}, deps });
    const chrome = player.children[0].children[0].children[0];
    const [, minus, plus] = chrome.children;
    log.length = 0;
    plus.fire('click', { stopPropagation() {} });
    minus.fire('click', { stopPropagation() {} });
    minus.fire('click', { stopPropagation() {} });
    assert.deepEqual(log, [
        'label 1.25 (session)', 'save {"labelScale":1.25}',
        'label 1 (session)', 'save {"labelScale":1}',
        'label 0.75 (session)', 'save {"labelScale":0.75}',
    ]);
    s.unmount();
});

test('mount applies the band fret-number scale; unmount restores the solo one', () => {
    const { player, log, deps, mainHw } = setup();
    const s = mountStage({ player, song: noDrums, prefs: { labelScale: 2 }, deps });
    assert.equal(mainHw.scale, 2);
    assert.ok(log.includes('label 2 (session)'));
    s.unmount();
    assert.equal(mainHw.scale, 1.5);
    assert.ok(!log.some((l) => l.endsWith('(persisted)')), 'never writes the solo preference');
});

test('the drum lane connects as a secondary highway', () => {
    const { player, deps, drumHws } = setup();
    const s = mountStage({ player, song: withDrums, prefs: {}, deps });
    assert.equal(drumHws[0].connectOpts.secondary, true);
    assert.equal(typeof drumHws[0].connectOpts.onSongInfo, 'function');
    s.unmount();
});

// Core's _replaceCanvas: a renderer with a different context type clones the
// canvas into the slot during init and announces highway:canvas-replaced.
function replacingInit(hw, doc, bus, { announce }) {
    hw.init = (c, container) => {
        hw.initArgs = [c, container];
        const fresh = doc.createElement('canvas');
        const kids = container.children;
        kids[kids.indexOf(c)] = fresh;
        fresh.parentNode = container;
        c.parentNode = null;
        hw.replacement = fresh;
        if (announce) bus.emit('highway:canvas-replaced', { oldCanvas: c, newCanvas: fresh, contextType: 'webgl2' });
    };
}

for (const announce of [true, false]) {
    test(`a canvas replaced during init is the one targeted and removed (${announce ? 'event' : 'read back from slot'})`, () => {
        const { player, doc, deps, bus, targets } = setup();
        const make = deps.createHighway;
        let hw;
        deps.createHighway = () => { hw = make(); replacingInit(hw, doc, bus, { announce }); return hw; };
        const s = mountStage({ player, song: withDrums, prefs: {}, deps });
        const drums = player.children[0].children[2];
        assert.ok(hw.replacement, 'fake init replaced the canvas');
        assert.equal(targets.at(-1), hw.replacement, 'kit hits pinned to the live canvas');
        s.unmount();
        assert.equal(hw.replacement.parentNode, null, 'live canvas removed');
        assert.ok(!drums.children.includes(hw.replacement));
        assert.equal(bus.count(), 0, 'bus listener removed');
    });
}

test('a later canvas replacement on the drum lane re-pins the input target', () => {
    const { player, doc, deps, bus, targets, drumHws } = setup();
    const s = mountStage({ player, song: withDrums, prefs: {}, deps });
    const [oldCanvas] = drumHws[0].initArgs;
    const fresh = doc.createElement('canvas');
    // Another highway's replacement is ignored.
    bus.emit('highway:canvas-replaced', { oldCanvas: doc.createElement('canvas'), newCanvas: doc.createElement('canvas') });
    assert.equal(targets.at(-1), oldCanvas);
    bus.emit('highway:canvas-replaced', { oldCanvas, newCanvas: fresh });
    assert.equal(targets.at(-1), fresh);
    s.unmount();
});

test('the band drum difficulty is pinned to the drum canvas and follows a replacement', () => {
    const { player, doc, deps, bus, drumHws } = setup();
    const diffs = [];
    deps.drumsApi.setDifficulty = (id, c) => diffs.push([id, c]);
    const prefs = { split: 62, parts: { guitar: { on: true }, drums: { on: true, difficulty: 'hard' } } };
    const s = mountStage({ player, song: withDrums, prefs, deps });
    const [drumCanvas] = drumHws[0].initArgs;
    assert.deepEqual(diffs.at(-1), ['hard', drumCanvas]);
    const fresh = doc.createElement('canvas');
    bus.emit('highway:canvas-replaced', { oldCanvas: drumCanvas, newCanvas: fresh });
    assert.deepEqual(diffs.at(-1), ['hard', fresh]);
    s.unmount();
});

test('drums switched off in the band prefs mounts the guitar lane alone', () => {
    const { player, deps, drumHws } = setup();
    const prefs = { split: 62, parts: { guitar: { on: true }, drums: { on: false } } };
    const s = mountStage({ player, song: withDrums, prefs, deps });
    assert.equal(player.children[0].children.length, 1);
    assert.equal(drumHws.length, 0);
    s.unmount();
});

test('a drum-tab-only song gets a drum lane on the guitar arrangement', () => {
    const { player, log, deps } = setup();
    mountStage({ player, song: tabOnly, prefs: {}, deps });
    const parts = player.children[0].children.map((c) => c.dataset && c.dataset.part).filter(Boolean);
    assert.deepEqual(parts, ['guitar', 'drums']);
    assert.ok(log.includes('drum.connect ws://x/deep.feedpak?arrangement=0'), log.join('\n'));
});

const vocalsOn = (guitar, drums) => ({ split: 62, parts: { guitar: { on: guitar }, drums: { on: drums }, vocals: { on: true } } });

test('vocals with guitar and drums: strip slot above the lanes, lanes pushed down', () => {
    const { player, deps, drumHws } = setup();
    const s = mountStage({ player, song: withDrums, prefs: vocalsOn(true, true), deps });
    const strip = s.stripSlot;
    assert.equal(strip.className, 'bab-strip');
    assert.equal(strip.dataset.part, 'vocals');
    assert.equal(strip.style.top, '60px');
    assert.equal(strip.style.height, '90px');
    assert.equal(player.style.getPropertyValue('--bab-lanes-top'), '150px');
    assert.equal(drumHws.length, 1);
    const root = player.children[0];
    assert.equal(root.children[0], strip);
    assert.deepEqual(root.children.map((c) => c.className), ['bab-strip', 'bab-lane', 'bab-divider', 'bab-lane']);
    s.unmount();
    assert.equal(player.style.getPropertyValue('--bab-lanes-top'), '');
});

test('vocals alone: the strip fills, the main highway is hidden and no lane exists', () => {
    const { player, log, deps, drumHws } = setup();
    const s = mountStage({ player, song: withDrums, prefs: vocalsOn(false, false), deps });
    const strip = s.stripSlot;
    assert.equal(strip.style.top, '60px');
    assert.equal(strip.style.bottom, '0px');
    assert.equal(strip.style.height, undefined);
    assert.ok(log.includes('main.setVisible(false)'));
    assert.ok(!log.includes('main.setContainer(slot)'));
    assert.ok(player.classList.contains('bab-main-hidden'));
    assert.equal(drumHws.length, 0);
    assert.ok(!log.some((l) => l.startsWith('label')));
    const root = player.children[0];
    assert.deepEqual(root.children, [strip]);
    s.unmount();
    assert.ok(log.includes('main.setVisible(null)'));
    assert.ok(!player.classList.contains('bab-main-hidden'));
    assert.equal(player.style.getPropertyValue('--bab-lanes-top'), '');
    assert.equal(strip.parentNode, null);
    assert.equal(player.children.length, 0);
});

test('drums alone with vocals: the main highway takes the drums lane, no second highway, no fret chrome', () => {
    const { player, log, deps, drumHws } = setup();
    const s = mountStage({ player, song: withDrums, prefs: vocalsOn(false, true), deps });
    assert.equal(log.filter((l) => l === 'main.setContainer(slot)').length, 1);
    assert.equal(drumHws.length, 0);
    const root = player.children[0];
    const [strip, lane] = root.children;
    assert.equal(strip, s.stripSlot);
    assert.equal(lane.dataset.part, 'drums');
    assert.equal(lane.style.width, '100%');
    assert.equal(root.children.length, 2, 'no divider');
    assert.ok(!lane.children.some((c) => c.className === 'bab-lane-chrome'));
    assert.ok(!log.includes('drums.target(canvas)'));
    assert.ok(!log.some((l) => l.startsWith('label')));
    assert.ok(!log.includes('main.setVisible(false)'));
    assert.equal(player.style.getPropertyValue('--bab-lanes-top'), '150px');
    s.unmount();
    assert.equal(player.children.length, 0);
    assert.equal(player.count(), 0, 'player listeners removed');
});

test('no vocals: no strip and the plan-2 layout', () => {
    const { player, log, deps } = setup();
    const s = mountStage({ player, song: withDrums, prefs: { split: 62 }, deps });
    assert.equal(s.stripSlot, null);
    assert.equal(player.style.getPropertyValue('--bab-lanes-top'), '');
    assert.ok(!player.children[0].children.some((c) => c.className === 'bab-strip'));
    assert.ok(!log.some((l) => l.startsWith('main.setVisible')));
    s.unmount();
});

test('vocals alone: a mount that throws never leaves the main highway hidden', () => {
    const { player, log, deps } = setup();
    deps.bus = { on: () => { throw new Error('bus down'); }, off: () => {} };
    assert.throws(() => mountStage({ player, song: withDrums, prefs: vocalsOn(false, false), deps }), /bus down/);
    assert.ok(!player.classList.contains('bab-main-hidden'));
    assert.ok(!log.includes('main.setVisible(false)'));
});

test('vocals alone: a remount round trip shows the main highway, then hides it again', () => {
    const { player, log, deps } = setup();
    const a = mountStage({ player, song: withDrums, prefs: vocalsOn(false, false), deps });
    a.unmount();
    assert.ok(!player.classList.contains('bab-main-hidden'));
    const b = mountStage({ player, song: withDrums, prefs: vocalsOn(false, false), deps });
    assert.deepEqual(log.filter((l) => l.startsWith('main.setVisible')),
        ['main.setVisible(false)', 'main.setVisible(null)', 'main.setVisible(false)']);
    assert.ok(player.classList.contains('bab-main-hidden'));
    assert.equal(log.at(-1), 'main.setVisible(false)', 'hidden last in the remount');
    b.unmount();
    assert.ok(!player.classList.contains('bab-main-hidden'));
});
