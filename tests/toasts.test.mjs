// createToastStack against the fake DOM and manual timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastStack } from '../src/toasts.js';
import { makeDoc, makeEl } from './fake-dom.mjs';

function manualTimers() {
    const pending = new Map();
    let next = 1;
    return {
        setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id; },
        clearTimer: (id) => { pending.delete(id); },
        count: () => pending.size,
        delays: () => [...pending.values()].map((t) => t.ms),
        fire(ms) {
            for (const [id, t] of [...pending]) {
                if (t.ms !== ms) continue;
                pending.delete(id);
                t.fn();
            }
        },
    };
}

function setup() {
    const doc = makeDoc();
    const player = makeEl('div', doc);
    player.setAttribute('id', 'player');
    doc.body.appendChild(player);
    const timers = manualTimers();
    const stack = createToastStack({ doc, getHost: () => player, ...timers });
    return { doc, player, timers, stack };
}

test('stacks different messages', () => {
    const { player, stack } = setup();
    stack.show('A');
    stack.show('B');
    assert.deepEqual(stack.texts(), ['A', 'B']);
    const boxes = player.querySelectorAll('.bab-toasts');
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].getAttribute('role'), 'status');
    assert.equal(boxes[0].getAttribute('aria-live'), 'polite');
    assert.equal(boxes[0].querySelectorAll('div.bab-toast').length, 2);
});

test('the same message is shown once and its timer restarts', () => {
    const { stack, timers } = setup();
    stack.show('A');
    stack.show('A');
    assert.deepEqual(stack.texts(), ['A']);
    assert.equal(timers.count(), 1);
    assert.deepEqual(timers.delays(), [4000]);
});

test('keeps at most three, dropping the oldest', () => {
    const { stack, timers } = setup();
    ['A', 'B', 'C', 'D'].forEach((t) => stack.show(t));
    assert.deepEqual(stack.texts(), ['B', 'C', 'D']);
    assert.equal(timers.count(), 3);
});

test('each toast leaves after 4 s', () => {
    const { player, stack, timers } = setup();
    stack.show('A');
    timers.fire(4000);
    assert.deepEqual(stack.texts(), []);
    assert.equal(player.querySelectorAll('div.bab-toast').length, 0);
    stack.show('B');
    assert.deepEqual(stack.texts(), ['B']);
});

test('no host: show is a no-op', () => {
    const doc = makeDoc();
    const timers = manualTimers();
    const stack = createToastStack({ doc, getHost: () => null, ...timers });
    stack.show('A');
    assert.deepEqual(stack.texts(), []);
    assert.equal(timers.count(), 0);
});

test('clear removes everything and cancels timers', () => {
    const { player, stack, timers } = setup();
    stack.show('A');
    stack.show('B');
    stack.clear();
    assert.deepEqual(stack.texts(), []);
    assert.equal(timers.count(), 0);
    assert.equal(player.querySelectorAll('.bab-toasts').length, 0);
    stack.show('C');
    assert.deepEqual(stack.texts(), ['C']);
    assert.equal(player.querySelectorAll('.bab-toasts').length, 1);
});
