// The band results screen (plan 4 R16, R17): a dialog over #player with the band's
// stars, score and song, one card per part, and Play again / Next song. Enter is
// Next song, R is Play again. Draws only: the caller decides what the buttons do.
import { icon } from './icons.js';
import { formatScore } from './hud-model.js';

const STAR_COUNT = 5;
const STAR_PX = 40;
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    return TYPING_TAGS.has(String(target.tagName || '').toUpperCase());
}

// showResultsScreen({ doc, win, host, model, onAgain, onNext }) -> { hide() }
export function showResultsScreen({ doc, win, host, model, onAgain, onNext }) {
    const el = (tag, cls, parent) => {
        const e = doc.createElement(tag);
        if (cls) e.className = cls;
        if (parent) parent.appendChild(e);
        return e;
    };
    const iconIn = (parent, cls, name, size) => {
        const span = el('span', cls, parent);
        span.innerHTML = icon(name, { size });
        return span;
    };
    const m = model || {};

    const root = el('div', 'bab-results');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', m.title ? 'Results: ' + m.title : 'Results');
    const inner = el('div', 'bab-results-inner', root);

    // Header: band stars (the HUD's five-star display), band score, song.
    const head = el('div', 'bab-results-head', inner);
    const stars = el('div', 'bab-results-stars', head);
    stars.setAttribute('aria-hidden', 'true');
    const sd = m.starDisplay || { full: 0, partial: 0, gold: false };
    for (let i = 0; i < STAR_COUNT; i++) {
        const star = el('span', 'bab-star', stars);
        star.innerHTML = icon('star', { size: STAR_PX });
        const fill = el('span', 'bab-star-fill', star);
        fill.innerHTML = icon('star', { size: STAR_PX });
        const share = i < sd.full ? 1 : i === sd.full ? sd.partial || 0 : 0;
        fill.style.width = Math.round(share * 100) + '%';
    }
    stars.classList.toggle('bab-gold', !!sd.gold);
    el('div', 'bab-results-score', head).textContent = formatScore(m.score);
    el('div', 'bab-results-sub', head).textContent = m.subtitle || '';

    // One card per part.
    const grid = el('div', 'bab-cards', inner);
    for (const c of Array.isArray(m.cards) ? m.cards : []) {
        const card = el('div', 'bab-card', grid);
        card.setAttribute('data-part', c.part);
        if (c.color) card.style.setProperty('--bab-c', c.color);
        const top = el('div', 'bab-card-top', card);
        iconIn(top, 'bab-card-icon', c.icon, 28);
        el('h3', 'bab-card-name', top).textContent = c.name || '';
        el('span', 'bab-card-diff', top).textContent = c.difficulty || '';
        el('div', 'bab-card-pct', card).textContent = Number.isFinite(c.accuracyPct) ? c.accuracyPct + '%' : '—';
        for (const [label, value] of Array.isArray(c.stats) ? c.stats : []) {
            const row = el('div', 'bab-stat', card);
            el('span', 'bab-stat-label', row).textContent = label;
            el('span', 'bab-stat-value', row).textContent = value;
        }
        if (c.award) {
            const award = el('span', 'bab-award', card);
            iconIn(award, 'bab-award-icon', 'trophy', 14);
            el('span', 'bab-award-text', award).textContent = c.award;
        }
    }

    const btns = el('div', 'bab-results-btns', inner);
    const again = el('button', 'bab-again', btns);
    again.type = 'button';
    iconIn(again, 'bab-btn-icon', 'rotate-ccw', 18);
    el('span', 'bab-btn-text', again).textContent = 'Play again';
    const next = el('button', 'bab-next', btns);
    next.type = 'button';
    el('span', 'bab-btn-text', next).textContent = 'Next song';
    iconIn(next, 'bab-btn-icon', 'arrow-right', 20);

    again.addEventListener('click', () => onAgain());
    next.addEventListener('click', () => onNext());

    // Enter: Next song. R: Play again. Typing and browser shortcuts (Ctrl/Cmd/Alt) are left alone.
    function onKey(e) {
        if (!e || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
        let action = null;
        if (e.key === 'Enter') action = onNext;
        else if (e.key === 'r' || e.key === 'R') action = onAgain;
        if (!action) return;
        e.preventDefault();
        action();
    }
    win.addEventListener('keydown', onKey);

    host.appendChild(root);
    if (typeof next.focus === 'function') {
        try { next.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ }
    }

    let shown = true;
    return {
        hide() {
            if (!shown) return;
            shown = false;
            win.removeEventListener('keydown', onKey);
            root.remove();
        },
    };
}
