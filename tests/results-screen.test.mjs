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
    const win = new EventTarget();
    const calls = { again: 0, next: 0 };
    const screen = showResultsScreen({
        doc, win, host, model, onAgain: () => { calls.again++; }, onNext: () => { calls.next++; },
    });
    const key = (key, target = doc.body, mods = {}) => {
        const e = new Event('keydown', { cancelable: true });
        Object.assign(e, { key, ...mods });
        Object.defineProperty(e, 'target', { value: target });
        win.dispatchEvent(e);
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
    assert.deepEqual(calls, { again: 1, next: 0 });
    host.querySelector('button.bab-next').click();
    assert.deepEqual(calls, { again: 1, next: 1 });
});

test('Enter is Next song, R is Play again, typing is ignored', () => {
    const { doc, calls, key } = setup();
    assert.equal(key('Enter').defaultPrevented, true);
    assert.deepEqual(calls, { again: 0, next: 1 });
    assert.equal(key('r').defaultPrevented, true);
    assert.equal(key('R').defaultPrevented, true);
    assert.deepEqual(calls, { again: 2, next: 1 });
    assert.equal(key('x').defaultPrevented, false);
    for (const tag of ['input', 'textarea', 'select']) {
        const e = key('Enter', makeEl(tag, doc));
        assert.equal(e.defaultPrevented, false, tag);
        key('r', makeEl(tag, doc));
    }
    const editable = makeEl('div', doc);
    editable.isContentEditable = true;
    key('r', editable);
    assert.deepEqual(calls, { again: 2, next: 1 });
});

test('Ctrl/Cmd/Alt+R and +Enter are left to the browser (reload is not Play again)', () => {
    const { doc, calls, key } = setup();
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        assert.equal(key('r', doc.body, mods).defaultPrevented, false);
        assert.equal(key('Enter', doc.body, mods).defaultPrevented, false);
    }
    assert.deepEqual(calls, { again: 0, next: 0 });
});

test('hide removes the screen and the key listener', () => {
    const { host, calls, screen, key } = setup();
    screen.hide();
    assert.equal(host.querySelector('.bab-results'), null);
    assert.equal(key('Enter').defaultPrevented, false);
    key('r');
    assert.deepEqual(calls, { again: 0, next: 0 });
    assert.doesNotThrow(() => screen.hide());
});
