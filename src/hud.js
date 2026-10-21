// The band HUD: a bar across the top of #player (band score, stars, song, BAND ×N and
// the band bonus) and one overlay per playing part in its lane or the vocal strip
// (tag, overdrive bar, multiplier, crowd meter, edge glow, callouts).
// Every element is built once and cached; update() runs on ledger changes only and
// writes a value to the DOM only when it changed. No DOM queries after build.
import { icon } from './icons.js';
import { getPart } from './parts.js';
import { starDisplay } from './stars.js';
import {
    formatScore, difficultyLabel, crowdZone, glowLevel, GLOW_MIN, streakCallout, bandMultiplierText,
} from './hud-model.js';

const STAR_COUNT = 5;
const ZONES = ['red', 'yellow', 'green'];

function partLabel(part, prefs, oneLevel) {
    const p = (prefs && prefs.parts && prefs.parts[part]) || {};
    if (part === 'guitar') {
        const name = typeof p.arrangement === 'string' && p.arrangement ? p.arrangement : 'Lead';
        return [name, oneLevel ? 'One level' : difficultyLabel(p.difficulty)].filter(Boolean).join(' · ');
    }
    const type = getPart(part);
    return [type ? type.label : part, difficultyLabel(p.difficulty)].filter(Boolean).join(' · ');
}

// Restarts a CSS animation class. The forced reflow only happens on a callout or a
// broken streak, never per frame.
function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
}

const pct = (v) => Math.round(v * 100) + '%';

export function createBandHud({ doc, player, stage, parts, prefs, song, oneLevel }) {
    const el = (tag, cls, parent) => {
        const e = doc.createElement(tag);
        if (cls) e.className = cls;
        if (parent) parent.appendChild(e);
        return e;
    };
    // Last value written per element+key, so unchanged values never touch the DOM.
    const written = new Map();
    function put(node, key, value, write) {
        let seen = written.get(node);
        if (!seen) { seen = {}; written.set(node, seen); }
        if (seen[key] === value) return;
        seen[key] = value;
        write(value);
    }
    const text = (node, value) => put(node, 'text', value, (v) => { node.textContent = v; });
    const flag = (node, cls, on) => put(node, cls, on, (v) => { node.classList.toggle(cls, v); });

    // ── The bar ──
    const bar = el('div', 'bab-hud');
    const scoreEl = el('span', 'bab-hud-score', bar);
    scoreEl.textContent = '0';
    const starsEl = el('span', 'bab-hud-stars', bar);
    starsEl.setAttribute('aria-hidden', 'true');
    const fills = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        const star = el('span', 'bab-star', starsEl);
        star.innerHTML = icon('star', { size: 18 });
        const fill = el('span', 'bab-star-fill', star);
        fill.innerHTML = icon('star', { size: 18 });
        fill.style.width = '0%';
        fills.push(fill);
    }
    const songEl = el('span', 'bab-hud-song', bar);
    const s = song || {};
    songEl.textContent = [s.title, s.artist].filter((v) => typeof v === 'string' && v).join(' · ');
    const band = el('div', 'bab-hud-band', bar);
    const multEl = el('span', 'bab-hud-mult', band);
    multEl.textContent = bandMultiplierText(1);
    const bonusEl = el('span', 'bab-hud-bonus', band);
    player.appendChild(bar);

    // ── Each part ──
    const huds = new Map();
    for (const part of Array.isArray(parts) ? parts : []) {
        const host = part === 'vocals' ? stage && stage.stripSlot : stage && stage.laneSlot && stage.laneSlot(part);
        if (!host || huds.has(part)) continue;
        const type = getPart(part);
        const root = el('div', 'bab-part-hud');
        root.setAttribute('data-part', part);
        if (type) root.style.setProperty('--bab-c', type.color);
        const glow = el('div', 'bab-glow', root);
        glow.style.setProperty('--bab-glow', String(GLOW_MIN));
        const lane = el('div', 'bab-lanehud', root);
        const tag = el('span', 'bab-tag', lane);
        tag.innerHTML = icon(type ? type.icon : '', { size: 14 });
        el('span', 'bab-tag-text', tag).textContent = partLabel(part, prefs, oneLevel);
        const od = el('span', 'bab-od', lane);
        const odFill = el('i', '', od);
        odFill.style.width = '0%';
        const mult = el('span', 'bab-mult', lane);
        mult.textContent = '×1';
        const crowd = el('div', 'bab-crowd', root);
        const marker = el('i', '', crowd);
        const callout = el('div', 'bab-callout', root);
        callout.setAttribute('role', 'status');
        host.appendChild(root);
        huds.set(part, { root, glow, odFill, mult, marker, callout });
    }

    let prev = null;
    let alive = true;

    function update(snapshot) {
        if (!alive || !snapshot) return;
        text(scoreEl, formatScore(snapshot.score));
        const { full, partial, gold } = starDisplay(snapshot.stars);
        fills.forEach((fill, i) => {
            const share = i < full ? 1 : i === full ? partial : 0;
            put(fill, 'width', pct(share), (v) => { fill.style.width = v; });
        });
        flag(starsEl, 'bab-gold', gold);
        const n = Number.isFinite(snapshot.bandMultiplier) ? snapshot.bandMultiplier : 1;
        text(multEl, bandMultiplierText(n));
        flag(multEl, 'bab-hot', n >= 2);
        text(bonusEl, snapshot.bonus > 0 ? '+' + formatScore(snapshot.bonus) + ' bonus' : '');

        const sp = snapshot.parts || {};
        for (const [part, h] of huds) {
            const p = sp[part];
            if (!p) continue;
            text(h.mult, '×' + (Number.isFinite(p.multiplier) ? p.multiplier : 1));
            const c = Number.isFinite(p.crowd) ? Math.min(1, Math.max(0, p.crowd)) : 0;
            put(h.marker, 'bottom', pct(c), (v) => { h.marker.style.bottom = v; });
            const zone = crowdZone(c);
            for (const z of ZONES) flag(h.marker, 'bab-crowd-' + z, z === zone);
            const streak = Number.isFinite(p.streak) ? p.streak : 0;
            put(h.glow, 'level', glowLevel(streak), (v) => { h.glow.style.setProperty('--bab-glow', String(v)); });
            const before = prev && prev[part];
            if (!before) continue;
            const was = Number.isFinite(before.streak) ? before.streak : 0;
            if (was > 0 && streak === 0) restart(h.glow, 'bab-glow-miss');
            const line = streakCallout(part, was, streak);
            if (line) show(h, line);
        }
        prev = {};
        for (const part of huds.keys()) {
            if (sp[part]) prev[part] = { streak: sp[part].streak };
        }
    }

    function show(h, line) {
        h.callout.textContent = line;
        restart(h.callout, 'bab-show');
    }

    return {
        update,
        callout(part, line) {
            const h = alive && huds.get(part);
            if (h) show(h, String(line));
        },
        // Plan 5 drives this (R22); plan 4 never calls it, so the bars stay empty.
        setOverdrive(part, fraction, active) {
            const h = alive && huds.get(part);
            if (!h) return;
            const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
            h.odFill.style.width = pct(f);
            h.root.classList.toggle('bab-od-active', !!active);
        },
        destroy() {
            if (!alive) return;
            alive = false;
            bar.remove();
            for (const h of huds.values()) h.root.remove();
            huds.clear();
            written.clear();
        },
    };
}
