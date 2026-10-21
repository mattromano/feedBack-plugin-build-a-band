// createBandHud against the fake DOM and a fake stage exposing laneSlot / stripSlot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBandHud } from '../src/hud.js';
import { readFileSync } from 'node:fs';
import { makeDoc, makeEl } from './fake-dom.mjs';

const PREFS = {
    parts: {
        guitar: { on: true, arrangement: 'Lead', difficulty: 'hard' },
        drums: { on: true, difficulty: 'expert' },
        vocals: { on: true, difficulty: 'medium' },
    },
};

function setup({ parts = ['guitar', 'drums'], strip = false, oneLevel = false, lanes = parts } = {}) {
    const doc = makeDoc();
    const player = makeEl('div', doc);
    player.setAttribute('id', 'player');
    doc.body.appendChild(player);
    const slots = {};
    for (const p of lanes) {
        if (p === 'vocals') continue;
        slots[p] = makeEl('div', doc);
        player.appendChild(slots[p]);
    }
    const stripSlot = strip ? makeEl('div', doc) : null;
    if (stripSlot) player.appendChild(stripSlot);
    const stage = { laneSlot: (p) => slots[p] || null, stripSlot };
    const hud = createBandHud({
        doc, player, stage, parts, prefs: PREFS, song: { title: 'Holiday', artist: 'Green Day' }, oneLevel,
    });
    const partHud = (p) => player.querySelector(`.bab-part-hud[data-part="${p}"]`);
    return { doc, player, slots, stripSlot, hud, partHud };
}

function part(over = {}) {
    return { score: 0, bonus: 0, multiplier: 1, streak: 0, crowd: 0.66, stars: null, ...over };
}

function snap(over = {}, parts = {}) {
    return {
        score: 0, bonus: 0, bandMultiplier: 1, stars: null,
        parts: { guitar: part(parts.guitar), drums: part(parts.drums), vocals: part(parts.vocals) },
        ...over,
    };
}

test('builds the bar and one HUD per playing part', () => {
    const { player, slots, hud, partHud } = setup();
    assert.equal(player.querySelectorAll('.bab-hud').length, 1);
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 2);
    assert.equal(player.querySelector('.bab-hud-song').textContent, 'Holiday · Green Day');
    assert.equal(partHud('guitar').parentNode, slots.guitar);
    assert.equal(partHud('drums').parentNode, slots.drums);
    assert.equal(partHud('guitar').style.props['--bab-c'], '#f5c542');
    assert.equal(partHud('drums').style.props['--bab-c'], '#e0533d');
    assert.equal(partHud('guitar').querySelector('.bab-tag').textContent, 'Lead · Hard');
    assert.ok(partHud('guitar').querySelector('.bab-tag').innerHTML.includes('<svg'), 'tag icon');
    assert.equal(partHud('drums').querySelector('.bab-tag').textContent, 'Drums · Expert');
    assert.equal(partHud('guitar').querySelector('.bab-od').querySelector('i').style.width, '0%');
    assert.equal(player.querySelectorAll('.bab-star').length, 5);
    hud.destroy();
});

test('one-level guitar charts say so in the tag', () => {
    const { hud, partHud } = setup({ parts: ['guitar'], oneLevel: true });
    assert.equal(partHud('guitar').querySelector('.bab-tag').textContent, 'Lead · One level');
    hud.destroy();
});

test('update shows score, band multiplier, bonus, crowd and multiplier', () => {
    const { player, hud, partHud } = setup();
    const mult = player.querySelector('.bab-hud-mult');
    assert.equal(mult.textContent, 'BAND ×1');
    assert.equal(mult.classList.contains('bab-hot'), false);
    assert.equal(player.querySelector('.bab-hud-bonus').textContent, '');
    hud.update(snap({ score: 1234, bonus: 87, bandMultiplier: 2 }, { guitar: { multiplier: 3, crowd: 0.66 }, drums: { crowd: 0.1 } }));
    assert.equal(player.querySelector('.bab-hud-score').textContent, '1,234');
    assert.equal(mult.textContent, 'BAND ×2');
    assert.ok(mult.classList.contains('bab-hot'));
    assert.equal(player.querySelector('.bab-hud-bonus').textContent, '+87 bonus');
    assert.equal(partHud('guitar').querySelector('.bab-mult').textContent, '×3');
    const crowd = partHud('guitar').querySelector('.bab-crowd').querySelector('i');
    assert.equal(crowd.style.bottom, '66%');
    assert.ok(crowd.classList.contains('bab-crowd-green'));
    const drumsCrowd = partHud('drums').querySelector('.bab-crowd').querySelector('i');
    assert.equal(drumsCrowd.style.bottom, '10%');
    assert.ok(drumsCrowd.classList.contains('bab-crowd-red'));
    hud.update(snap({ bandMultiplier: 1 }, { drums: { crowd: 0.4 } }));
    assert.equal(mult.classList.contains('bab-hot'), false);
    assert.equal(player.querySelector('.bab-hud-bonus').textContent, '');
    assert.ok(drumsCrowd.classList.contains('bab-crowd-yellow'));
    assert.equal(drumsCrowd.classList.contains('bab-crowd-red'), false);
    hud.destroy();
});

test('stars fill by share and turn gold at 6', () => {
    const { player, hud } = setup();
    const fills = () => player.querySelectorAll('.bab-star-fill').map((f) => f.style.width);
    hud.update(snap({ stars: 2.5 }));
    assert.deepEqual(fills(), ['100%', '100%', '50%', '0%', '0%']);
    assert.equal(player.querySelector('.bab-hud-stars').classList.contains('bab-gold'), false);
    hud.update(snap({ stars: 6 }));
    assert.deepEqual(fills(), ['100%', '100%', '100%', '100%', '100%']);
    assert.ok(player.querySelector('.bab-hud-stars').classList.contains('bab-gold'));
    hud.update(snap({ stars: null }));
    assert.deepEqual(fills(), ['0%', '0%', '0%', '0%', '0%']);
    hud.destroy();
});

test('a streak milestone pops a callout', () => {
    const { hud, partHud } = setup();
    const co = partHud('guitar').querySelector('.bab-callout');
    hud.update(snap({}, { guitar: { streak: 49 } }));
    assert.equal(co.textContent, '');
    assert.equal(co.classList.contains('bab-show'), false);
    hud.update(snap({}, { guitar: { streak: 50 } }));
    assert.equal(co.textContent, '50 NOTE STREAK!');
    assert.ok(co.classList.contains('bab-show'));
    assert.equal(partHud('drums').querySelector('.bab-callout').textContent, '');
    hud.destroy();
});

test('the first update never pops a callout (a HUD rebuilt mid-song)', () => {
    const { hud, partHud } = setup();
    hud.update(snap({}, { guitar: { streak: 50 } }));
    assert.equal(partHud('guitar').querySelector('.bab-callout').textContent, '');
    hud.destroy();
});

test('glow follows the streak and flashes when it breaks', () => {
    const { hud, partHud } = setup();
    const glow = partHud('guitar').querySelector('.bab-glow');
    assert.equal(glow.style.props['--bab-glow'], '0.15');
    hud.update(snap({}, { guitar: { streak: 25 } }));
    assert.equal(glow.style.props['--bab-glow'], '0.575');
    assert.equal(glow.classList.contains('bab-glow-miss'), false);
    hud.update(snap({}, { guitar: { streak: 0 } }));
    assert.equal(glow.style.props['--bab-glow'], '0.15');
    assert.ok(glow.classList.contains('bab-glow-miss'));
    hud.destroy();
});

test('callout() sets the text and shows it', () => {
    const { hud, partHud } = setup();
    hud.callout('drums', 'HELLO');
    const co = partHud('drums').querySelector('.bab-callout');
    assert.equal(co.textContent, 'HELLO');
    assert.ok(co.classList.contains('bab-show'));
    hud.callout('keys', 'nothing');
    hud.destroy();
});

test('setOverdrive fills the bar and writes only changes', () => {
    const { hud, partHud } = setup();
    hud.setOverdrive('guitar', 0.42, true);
    assert.equal(partHud('guitar').querySelector('.bab-od').querySelector('i').style.width, '42%');
    assert.ok(partHud('guitar').classList.contains('bab-od-active'));
    hud.setOverdrive('guitar', 2, false);
    assert.equal(partHud('guitar').querySelector('.bab-od').querySelector('i').style.width, '100%');
    assert.equal(partHud('guitar').classList.contains('bab-od-active'), false);
    hud.destroy();
});

test('overdrive bar, ready pulse and active glow', () => {
    const { hud, partHud } = setup();
    const fill = partHud('guitar').querySelector('.bab-od').querySelector('i');
    hud.setOverdrive('guitar', 0.5, false);
    assert.equal(fill.style.width, '50%');
    assert.equal(partHud('guitar').classList.contains('bab-od-active'), false);
    hud.setReady('guitar', true);
    assert.ok(partHud('guitar').classList.contains('bab-od-ready'));
    hud.setOverdrive('guitar', 0.4, true);
    assert.ok(partHud('guitar').classList.contains('bab-od-active'));
    hud.setReady('guitar', false);
    assert.equal(partHud('guitar').classList.contains('bab-od-ready'), false);
    assert.equal(partHud('drums').classList.contains('bab-od-ready'), false);
    hud.destroy();
});

test('noodle zone only on guitar', () => {
    const { hud, partHud } = setup();
    assert.equal(partHud('guitar').querySelectorAll('.bab-noodle-zone').length, 1);
    assert.equal(partHud('guitar').querySelector('.bab-noodle-zone').getAttribute('aria-hidden'), 'true');
    assert.equal(partHud('drums').querySelectorAll('.bab-noodle-zone').length, 0);
    hud.setNoodle(true);
    assert.ok(partHud('guitar').classList.contains('bab-noodle'));
    assert.equal(partHud('drums').classList.contains('bab-noodle'), false);
    hud.setNoodle(false);
    assert.equal(partHud('guitar').classList.contains('bab-noodle'), false);
    hud.destroy();
});

test('dropped out greys the lane and the HUD; destroy clears it', () => {
    const { slots, hud, partHud } = setup();
    hud.setFailed('drums', true);
    assert.ok(partHud('drums').classList.contains('bab-failed'));
    assert.ok(slots.drums.classList.contains('bab-failed'));
    assert.equal(slots.guitar.classList.contains('bab-failed'), false);
    hud.setFailed('drums', false);
    assert.equal(slots.drums.classList.contains('bab-failed'), false);
    hud.setFailed('drums', true);
    hud.setFailed('guitar', true);
    hud.destroy();
    assert.equal(slots.drums.classList.contains('bab-failed'), false);
    assert.equal(slots.guitar.classList.contains('bab-failed'), false);
});

test('unknown parts and a destroyed HUD are ignored', () => {
    const { hud } = setup();
    hud.setFailed('bass', true);
    hud.setReady('bass', true);
    hud.setNoodle(true);
    hud.destroy();
    hud.setFailed('drums', true);
    hud.setReady('guitar', true);
    hud.setNoodle(true);
    hud.setOverdrive('guitar', 1, true);
});

test('guitar-less band: setNoodle is a no-op', () => {
    const { hud } = setup({ parts: ['drums'] });
    hud.setNoodle(true);
    hud.destroy();
});

test('CSS: overdrive blue, noodle zone, dropped-out grey and reduced motion', () => {
    const css = readFileSync(new URL('../assets/build-a-band.css', import.meta.url), 'utf8');
    assert.match(css, /\.bab-od-ready \.bab-od \{[^}]*#5cc8ff/);
    assert.match(css, /\.bab-noodle-zone \{[^}]*display: none/);
    assert.match(css, /\.bab-noodle \.bab-noodle-zone \{[^}]*display: block/);
    assert.match(css, /\.bab-lane\.bab-failed, #player \.bab-strip\.bab-failed \{[^}]*filter: grayscale\(1\) brightness\(0\.6\)/);
    assert.match(css, /\.bab-part-hud\.bab-failed \.bab-tag::after \{[^}]*content: ' · OUT'/);
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n    #player .bab-callout'));
    assert.match(rm.slice(0, rm.indexOf('@keyframes bab-fade')), /bab-od-ready[^}]*animation: none/);
});

test('the vocals HUD lives in the strip slot', () => {
    const { stripSlot, hud, partHud } = setup({ parts: ['guitar', 'vocals'], strip: true });
    assert.equal(partHud('vocals').parentNode, stripSlot);
    assert.equal(partHud('vocals').style.props['--bab-c'], '#a678ff');
    assert.equal(partHud('vocals').querySelector('.bab-tag').textContent, 'Vocals · Medium');
    hud.update(snap({}, { vocals: { streak: 4 } }));
    hud.update(snap({}, { vocals: { streak: 5 } }));
    assert.equal(partHud('vocals').querySelector('.bab-callout').textContent, '5 PHRASE STREAK!');
    hud.destroy();
});

test('parts without a host element are skipped', () => {
    const { player, hud } = setup({ parts: ['guitar', 'drums', 'vocals'], lanes: ['guitar'] });
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 1);
    hud.update(snap({}, { drums: { streak: 50 } }));
    hud.callout('drums', 'x');
    hud.setOverdrive('vocals', 1, true);
    hud.destroy();
});

test('the crowd marker starts at R6\'s 0.66 before any update', () => {
    const { hud, partHud } = setup();
    const marker = partHud('drums').querySelector('.bab-crowd').querySelector('i');
    assert.equal(marker.style.bottom, '66%');
    assert.ok(marker.classList.contains('bab-crowd-green'));
    hud.destroy();
});

test('a silent update writes values but pops no callout and no miss flash', () => {
    const { player, hud, partHud } = setup();
    const co = partHud('guitar').querySelector('.bab-callout');
    const glow = partHud('drums').querySelector('.bab-glow');
    hud.update(snap({}, { guitar: { streak: 49 }, drums: { streak: 12 } }));
    hud.update(snap({ score: 900 }, { guitar: { streak: 50 }, drums: { streak: 0 } }), { silent: true });
    assert.equal(player.querySelector('.bab-hud-score').textContent, '900');
    assert.equal(glow.style.props['--bab-glow'], '0.15');
    assert.equal(co.textContent, '');
    assert.equal(co.classList.contains('bab-show'), false);
    assert.equal(glow.classList.contains('bab-glow-miss'), false);
    // The next live update compares against the silent snapshot.
    hud.update(snap({}, { guitar: { streak: 51 }, drums: { streak: 0 } }));
    assert.equal(co.textContent, '');
    assert.equal(glow.classList.contains('bab-glow-miss'), false);
    hud.destroy();
});

test('CSS: the bar sits at z-index 20 and core\'s section map is hidden on the stage', () => {
    const css = readFileSync(new URL('../assets/build-a-band.css', import.meta.url), 'utf8');
    assert.match(css, /#player\.bab-stage #section-map \{ display: none; \}/);
    const bar = css.match(/#player \.bab-hud \{[^}]*\}/);
    assert.ok(bar && /z-index: 20;/.test(bar[0]), 'bar z-index 20');
});

test('destroy removes everything', () => {
    const { player, slots, hud } = setup();
    const before = player.querySelectorAll('*').length;
    assert.ok(before > 2);
    hud.destroy();
    assert.equal(player.querySelector('.bab-hud'), null);
    assert.equal(player.querySelectorAll('.bab-part-hud').length, 0);
    assert.equal(slots.guitar.children.length, 0);
    assert.equal(slots.drums.children.length, 0);
    hud.destroy();
    hud.update(snap({ score: 5 }));
});
