// createCountInOverlay: draws core's count-in:tick / count-in:hide. Plays nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCountInOverlay } from '../src/count-in-overlay.js';
import { makeDoc, makeEl } from './fake-dom.mjs';

function makeBus() {
    const t = new EventTarget();
    const map = new Map();
    return {
        on(name, fn) { const w = (e) => fn(e); map.set(fn, w); t.addEventListener(name, w); },
        off(name, fn) { const w = map.get(fn); if (w) t.removeEventListener(name, w); },
        emit(name, detail) { t.dispatchEvent(new CustomEvent(name, { detail })); },
    };
}

function setup() {
    const doc = makeDoc();
    const player = makeEl('div', doc);
    player.setAttribute('id', 'player');
    doc.body.appendChild(player);
    const bus = makeBus();
    const pending = new Map();
    let next = 1;
    const timers = {
        setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id; },
        clearTimer: (id) => { pending.delete(id); },
    };
    const fire = (ms) => {
        for (const [id, t] of [...pending]) if (t.ms === ms) { pending.delete(id); t.fn(); }
    };
    const overlay = createCountInOverlay({ doc, bus, getHost: () => player, ...timers });
    const el = () => player.querySelector('.bab-countin');
    return { player, bus, overlay, el, fire, pending };
}

test('counts down 3-2-1 from core\'s ticks', () => {
    const { bus, el, player } = setup();
    bus.emit('count-in:tick', { n: 1, total: 3 });
    assert.equal(el().textContent, '3');
    bus.emit('count-in:tick', { n: 2, total: 3 });
    assert.equal(el().textContent, '2');
    bus.emit('count-in:tick', { n: 3, total: 3 });
    assert.equal(el().textContent, '1');
    assert.equal(player.querySelectorAll('.bab-countin').length, 1);
});

test('a non-finite total shows n', () => {
    const { bus, el } = setup();
    bus.emit('count-in:tick', { n: 2 });
    assert.equal(el().textContent, '2');
});

test('completed shows ROCK! then goes after 600 ms', () => {
    const { bus, el, fire } = setup();
    bus.emit('count-in:tick', { n: 3, total: 3 });
    bus.emit('count-in:hide', { completed: true });
    assert.equal(el().textContent, 'ROCK!');
    fire(600);
    assert.equal(el(), null);
});

test('a cancelled count-in disappears at once', () => {
    const { bus, el, pending } = setup();
    bus.emit('count-in:tick', { n: 1, total: 3 });
    bus.emit('count-in:hide', { completed: false });
    assert.equal(el(), null);
    assert.equal(pending.size, 0);
});

test('a tick during ROCK! cancels its removal timer', () => {
    const { bus, el, fire } = setup();
    bus.emit('count-in:hide', { completed: true });
    bus.emit('count-in:tick', { n: 1, total: 3 });
    fire(600);
    assert.equal(el().textContent, '3');
});

test('destroy unsubscribes', () => {
    const { bus, overlay, el, pending } = setup();
    bus.emit('count-in:tick', { n: 1, total: 3 });
    bus.emit('count-in:hide', { completed: true });
    overlay.destroy();
    assert.equal(el(), null);
    assert.equal(pending.size, 0);
    bus.emit('count-in:tick', { n: 1, total: 3 });
    assert.equal(el(), null);
});
