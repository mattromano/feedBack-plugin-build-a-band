// The results screen against the fake DOM: cards, buttons, keys, hide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showResultsScreen } from '../src/results-screen.js';
import { makeDoc, makeEl } from './fake-dom.mjs';

const MODEL = {
    stars: 4.5, starDisplay: { full: 4, partial: 0.5, gold: false }, score: 412880,
    title: 'Everlong', subtitle: 'Everlong · Foo Fighters',
    cards: [
        { part: 'guitar', name: 'Guitar · Lead', difficulty: 'Hard', color: '#f5c542', icon: 'guitar', accuracyPct: 91,
            score: 168420, bestStreak: 214, stats: [['Score', '168,420'], ['Best streak', '214']], award: 'Best streak in the band' },
        { part: 'drums', name: 'Drums', difficulty: 'Expert', color: '#e0533d', icon: 'drum', accuracyPct: null,
            score: 0, bestStreak: 0, stats: [['Overhits', '11']], award: 'Held it down' },
        { part: 'vocals', name: 'Vocals', difficulty: 'Medium', color: '#a678ff', icon: 'mic', accuracyPct: 79,
            score: 93160, bestStreak: 7, stats: [['Best run', '7 phrases']], award: 'Big voice' },
    ],
};

function setup(model = MODEL) {
    const doc = makeDoc();
    const host = makeEl('div', doc);
    host.setAttribute('id', 'player');
    doc.body.appendChild(host);
    // A keydown's path, as the browser runs it: window capture, then core's
    // document listeners (its player shortcuts, e.g. Space = togglePlay), then
    // window bubble. stopPropagation ends the path.
    const calls = { again: 0, next: 0, player: [] };
    const listeners = { capture: new Set(), bubble: new Set() };
    const phase = (opts) => (opts === true || (opts && opts.capture) ? 'capture' : 'bubble');
    const win = {
        addEventListener: (t, f, opts) => { if (t === 'keydown') listeners[phase(opts)].add(f); },
        removeEventListener: (t, f, opts) => { if (t === 'keydown') listeners[phase(opts)].delete(f); },
        listenerCount: () => listeners.capture.size + listeners.bubble.size,
    };
    const screen = showResultsScreen({
        doc, win, host, model, onAgain: () => { calls.again++; }, onNext: () => { calls.next++; },
    });
    const key = (key, target = doc.body, mods = {}) => {
        let stopped = false;
        const e = {
            type: 'keydown', key, code: key === ' ' ? 'Space' : key, target, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { stopped = true; },
            stopImmediatePropagation() { stopped = true; },
            ...mods,
        };
        for (const f of [...listeners.capture]) { f(e); if (stopped) return e; }
        calls.player.push(key);
        for (const f of [...listeners.bubble]) { f(e); if (stopped) return e; }
        return e;
    };
    return { doc, host, win, calls, screen, key };
}

test('renders cards and both buttons', () => {
    const { host } = setup();
    const root = host.querySelector('div.bab-results');
    assert.ok(root);
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
    assert.equal(root.querySelectorAll('.bab-card').length, 3);
    assert.equal(root.querySelector('.bab-results-score').textContent, '412,880');
    assert.equal(root.querySelector('.bab-results-sub').textContent, 'Everlong · Foo Fighters');
    const stars = root.querySelector('.bab-results-stars');
    assert.equal(stars.querySelectorAll('.bab-star').length, 5);
    assert.equal(stars.classList.contains('bab-gold'), false);
    const g = root.querySelector('.bab-card[data-part="guitar"]');
    assert.equal(g.style.props['--bab-c'], '#f5c542');
    assert.match(g.querySelector('.bab-card-icon').innerHTML, /<svg/);
    assert.equal(g.querySelector('.bab-card-name').textContent, 'Guitar · Lead');
    assert.equal(g.querySelector('.bab-card-diff').textContent, 'Hard');
    assert.equal(g.querySelector('.bab-card-pct').textContent, '91%');
    assert.deepEqual(g.querySelectorAll('.bab-stat').map((r) => r.children.map((c) => c.textContent)),
        [['Score', '168,420'], ['Best streak', '214']]);
    assert.equal(g.querySelector('.bab-award').textContent, 'Best streak in the band');
    assert.match(g.querySelector('.bab-award').querySelector('.bab-award-icon').innerHTML, /M6 9H4\.5/, 'the trophy icon');
    assert.equal(root.querySelector('.bab-card[data-part="drums"]').querySelector('.bab-card-pct').textContent, '—');
    const again = root.querySelector('button.bab-again');
    const next = root.querySelector('button.bab-next');
    assert.ok(again.textContent.includes('Play again'));
    assert.ok(next.textContent.includes('Next song'));
    assert.match(again.querySelector('.bab-btn-icon').innerHTML, /<svg/);
    assert.match(next.querySelector('.bab-btn-icon').innerHTML, /<svg/);
    assert.equal(next.type, 'button');
});

test('gold stars', () => {
    const { host } = setup({ ...MODEL, starDisplay: { full: 5, partial: 0, gold: true } });
    assert.ok(host.querySelector('.bab-results-stars').classList.contains('bab-gold'));
});

test('Play again and Next song call back', () => {
    const { host, calls } = setup();
    host.querySelector('button.bab-again').click();
    assert.deepEqual([calls.again, calls.next], [1, 0]);
    host.querySelector('button.bab-next').click();
    assert.deepEqual([calls.again, calls.next], [1, 1]);
});

test('Enter is Next song, R is Play again, typing is ignored', () => {
    const { doc, calls, key } = setup();
    assert.equal(key('Enter').defaultPrevented, true);
    assert.deepEqual([calls.again, calls.next], [0, 1]);
    assert.equal(key('r').defaultPrevented, true);
    assert.equal(key('R').defaultPrevented, true);
    assert.deepEqual([calls.again, calls.next], [2, 1]);
    assert.equal(key('x').defaultPrevented, false);
    for (const tag of ['input', 'textarea', 'select']) {
        const e = key('Enter', makeEl(tag, doc));
        assert.equal(e.defaultPrevented, false, tag);
        key('r', makeEl(tag, doc));
    }
    const editable = makeEl('div', doc);
    editable.isContentEditable = true;
    key('r', editable);
    assert.deepEqual([calls.again, calls.next], [2, 1]);
});

test('Ctrl/Cmd/Alt+R and +Enter are left to the browser (reload is not Play again)', () => {
    const { doc, calls, key } = setup();
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        assert.equal(key('r', doc.body, mods).defaultPrevented, false);
        assert.equal(key('Enter', doc.body, mods).defaultPrevented, false);
    }
    assert.deepEqual([calls.again, calls.next], [0, 0]);
});

test('hide removes the screen and the key listener', () => {
    const { host, win, calls, screen, key } = setup();
    screen.hide();
    assert.equal(host.querySelector('.bab-results'), null);
    assert.equal(win.listenerCount(), 0);
    assert.equal(key(' ').defaultPrevented, false, 'Space reaches the player again');
    assert.equal(key('Enter').defaultPrevented, false);
    key('r');
    assert.deepEqual([calls.again, calls.next], [0, 0]);
    assert.doesNotThrow(() => screen.hide());
});

test('the dialog takes focus: Next song, else the dialog root (tabindex -1)', () => {
    const { doc, host } = setup();
    const root = host.querySelector('.bab-results');
    assert.equal(root.getAttribute('tabindex'), '-1');
    assert.equal(doc.activeElement, host.querySelector('button.bab-next'));
});

test("Space, arrows and [ ] + - = never reach the player behind the results", () => {
    const { doc, host, calls, key } = setup();
    const card = host.querySelector('.bab-card');
    for (const k of [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '[', ']', '+', '-', '=']) {
        for (const target of [doc.body, card, host.querySelector('button.bab-again')]) {
            const e = key(k, target);
            assert.equal(e.defaultPrevented, true, k);
        }
    }
    assert.deepEqual(calls.player, []);
    assert.deepEqual([calls.again, calls.next], [0, 0]);
});

test('Tab and Shift+Tab wrap inside the dialog', () => {
    const { doc, host, key } = setup();
    const again = host.querySelector('button.bab-again');
    const next = host.querySelector('button.bab-next');
    assert.equal(doc.activeElement, next);
    assert.equal(key('Tab', next).defaultPrevented, true);
    assert.equal(doc.activeElement, again);
    key('Tab', again);
    assert.equal(doc.activeElement, next);
    key('Tab', next, { shiftKey: true });
    assert.equal(doc.activeElement, again);
    assert.equal(key('Tab', again, { shiftKey: true }).defaultPrevented, true);
    assert.equal(doc.activeElement, next);
    // Focus outside the dialog comes back in.
    doc.activeElement = doc.body;
    key('Tab', doc.body);
    assert.equal(doc.activeElement, again);
});

test('Enter on a focused Play again is Play again (native activation), not Next song', () => {
    const { host, calls, key } = setup();
    const again = host.querySelector('button.bab-again');
    const e = key('Enter', again);
    assert.equal(e.defaultPrevented, false, 'the button activates natively');
    assert.equal(calls.next, 0);
    again.click(); // what the browser does next
    assert.deepEqual([calls.again, calls.next], [1, 0]);
    assert.deepEqual(calls.player, [], "core's shortcuts don't see it");
});

test('Enter on the dialog root is Next song', () => {
    const { host, calls, key } = setup();
    assert.equal(key('Enter', host.querySelector('.bab-results')).defaultPrevented, true);
    assert.equal(calls.next, 1);
    key('Enter', host.querySelector('.bab-card'));
    assert.equal(calls.next, 1, 'other targets are left alone');
});

test('Escape is Next song', () => {
    const { calls, key } = setup();
    const e = key('Escape');
    assert.equal(e.defaultPrevented, true);
    assert.deepEqual([calls.again, calls.next], [0, 1]);
    assert.deepEqual(calls.player, [], "core's back shortcut doesn't see it");
});

test('a throw while attaching the dialog leaks no key listener', () => {
    const doc = makeDoc();
    const host = makeEl('div', doc);
    host.appendChild = () => { throw new Error('host gone'); };
    let added = 0;
    const win = { addEventListener: () => { added++; }, removeEventListener: () => { added--; } };
    assert.throws(() => showResultsScreen({ doc, win, host, model: MODEL, onAgain() {}, onNext() {} }), /host gone/);
    assert.equal(added, 0);
});

test('a failed band shows the heading', () => {
    const { host } = setup({ ...MODEL, heading: 'Band failed' });
    const root = host.querySelector('div.bab-results');
    const h = root.querySelector('.bab-results-failed');
    assert.ok(h);
    assert.equal(h.textContent, 'Band failed');
    const head = root.querySelector('.bab-results-head');
    assert.equal(head.children[0], h, 'above the stars');
    assert.ok(root.getAttribute('aria-label').startsWith('Band failed'));
    const plain = setup({ ...MODEL, heading: '' }).host.querySelector('div.bab-results');
    assert.equal(plain.querySelector('.bab-results-failed'), null);
    assert.equal(plain.getAttribute('aria-label'), 'Results: Everlong');
});

test('the results hold the media keys while shown', () => {
    const doc = makeDoc();
    const host = makeEl('div', doc);
    doc.body.appendChild(host);
    const handlers = {};
    const fake = { setActionHandler: (a, f) => { handlers[a] = f; } };
    const win = { navigator: { mediaSession: fake }, addEventListener() {}, removeEventListener() {} };
    const screen = showResultsScreen({ doc, win, host, model: MODEL, onAgain() {}, onNext() {} });
    assert.equal(typeof handlers.play, 'function');
    screen.hide();
    assert.equal(handlers.play, null);
    screen.hide();
});
