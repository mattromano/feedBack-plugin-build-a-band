// The stage's hover chrome row and full-mode edge (plan 7 R5, R7, R20) on the
// fake DOM, plus source checks on the stage CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStageChrome } from '../src/stage-chrome.js';
import { makeDoc } from './fake-dom.mjs';

const svg = (b) => b.querySelector('.bab-chrome-icon').innerHTML;
const CLASSES = ['bab-chrome-menu', 'bab-chrome-loop', 'bab-chrome-full', 'bab-chrome-end'];

function setup({ full = false } = {}) {
    const doc = makeDoc();
    const player = doc.createElement('div');
    player.id = 'player';
    doc.body.appendChild(player);
    const calls = [];
    const cb = (name) => () => calls.push(name);
    const chrome = createStageChrome({
        doc, player, full,
        onMenu: cb('menu'), onLoop: cb('loop'), onFullScreen: cb('full'), onEnd: cb('end'), onEdge: cb('edge'),
    });
    const row = player.querySelector('.bab-chrome');
    const btn = (cls) => row.querySelector('.' + cls);
    return { doc, player, calls, chrome, row, btn };
}

test('the chrome row holds Menu, loop, full screen and End', () => {
    const { player, row, btn } = setup();
    assert.ok(row);
    assert.deepEqual(row.children.map((b) => CLASSES.find((c) => b.classList.contains(c))), CLASSES);
    for (const b of row.children) {
        assert.equal(b.tagName, 'BUTTON');
        assert.equal(b.getAttribute('type'), 'button');
        assert.equal(b.getAttribute('aria-label'), b.getAttribute('title'));
    }
    assert.equal(btn('bab-chrome-menu').getAttribute('title'), 'Menu (M)');
    assert.equal(btn('bab-chrome-loop').getAttribute('title'), 'Set loop start');
    assert.equal(btn('bab-chrome-full').getAttribute('title'), 'Full screen');
    assert.equal(btn('bab-chrome-end').getAttribute('title'), 'End song');
    assert.ok(svg(btn('bab-chrome-menu')).includes('<line x1="4" x2="20" y1="12" y2="12"/>'));
    assert.ok(svg(btn('bab-chrome-loop')).includes('<path d="m17 2 4 4-4 4"/>'));
    assert.ok(svg(btn('bab-chrome-full')).includes('<path d="M8 3H5a2 2 0 0 0-2 2v3"/>'));
    assert.ok(svg(btn('bab-chrome-end')).includes('<polyline points="16 17 21 12 16 7"/>'));
    // The edge comes after the row.
    assert.equal(player.children.indexOf(row), 0);
    assert.ok(player.children[1].classList.contains('bab-edge'));
    assert.ok(!player.classList.contains('bab-full'));
});

test('clicks call back', () => {
    const { player, calls, btn } = setup();
    let stopped = 0;
    for (const cls of CLASSES) btn(cls).fire('click', { stopPropagation() { stopped++; } });
    assert.deepEqual(calls, ['menu', 'loop', 'full', 'end']);
    assert.equal(stopped, 4);
    player.querySelector('.bab-edge').fire('pointerenter');
    assert.deepEqual(calls, ['menu', 'loop', 'full', 'end', 'edge']);
});

test('setFull', () => {
    const { player, chrome, btn } = setup({ full: true });
    const full = btn('bab-chrome-full');
    assert.ok(player.classList.contains('bab-full'));
    assert.equal(full.getAttribute('aria-pressed'), 'true');
    assert.equal(full.getAttribute('title'), 'Exit full screen');
    assert.equal(full.getAttribute('aria-label'), 'Exit full screen');
    assert.ok(svg(full).includes('<path d="M8 3v3a2 2 0 0 1-2 2H3"/>'), 'minimize icon');
    chrome.setFull(false);
    assert.ok(!player.classList.contains('bab-full'));
    assert.equal(full.getAttribute('aria-pressed'), 'false');
    assert.equal(full.getAttribute('title'), 'Full screen');
    assert.equal(full.getAttribute('aria-label'), 'Full screen');
    assert.ok(svg(full).includes('<path d="M8 3H5a2 2 0 0 0-2 2v3"/>'), 'maximize icon');
});

test('setLoop', () => {
    const { chrome, btn } = setup();
    const loop = btn('bab-chrome-loop');
    assert.ok(loop.textContent.includes('Loop A'));
    chrome.setLoop('a');
    assert.ok(loop.textContent.includes('Loop B'));
    assert.equal(loop.getAttribute('title'), 'Set loop end');
    assert.equal(loop.getAttribute('aria-label'), 'Set loop end');
    chrome.setLoop('ab');
    assert.ok(loop.textContent.includes('Clear loop'));
    assert.equal(loop.getAttribute('title'), 'Clear loop');
    chrome.setLoop('none');
    assert.ok(loop.textContent.includes('Loop A'));
    assert.equal(loop.getAttribute('title'), 'Set loop start');
});

test('destroy', () => {
    const { player, chrome } = setup({ full: true });
    chrome.destroy();
    assert.equal(player.querySelector('.bab-chrome'), null);
    assert.equal(player.querySelector('.bab-edge'), null);
    assert.ok(!player.classList.contains('bab-full'));
    assert.doesNotThrow(() => chrome.destroy());
});

test('stage CSS: hover chrome and full mode replace the stage hides', () => {
    const css = readFileSync(new URL('../assets/build-a-band.css', import.meta.url), 'utf8');
    assert.ok(!css.includes('#player.bab-stage #player-hud { display: none; }'));
    assert.ok(!css.includes('#player.bab-stage #section-map { display: none; }'));
    assert.ok(css.includes('#player.bab-full #v3-railzone { display: none; }'));
    assert.ok(css.includes('#player.bab-full .bab-lanes { bottom: 0 !important; }'));
});
