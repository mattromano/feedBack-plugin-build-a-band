// Controller players on the band screen: one Setup column and one Confirm row per joined
// controller, built once per key and kept in a Map. Thin DOM layer; the rows come from
// bandScreenModel().controllers and every control writes back through onChange.
import { icon } from './icons.js';
import { FIVE_FRET_PART } from './parts.js';
import { FIVE_FRET_PART_LABELS } from './controller-model.js';
import { DIFFICULTIES } from './mappings.js';

const FRETS = ['green', 'red', 'yellow', 'blue', 'orange'];
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const PART_ORDER = ['guitar', 'rhythm', 'bass'];
const KIND_TAG = { chart: 'real', auto: 'auto' };
const LEFTY = [['off', 'Off'], ['on', 'On']];
const PART_AUDIO = [['rockband', 'Rock Band'], ['always', 'Always play']];

// createControllerColumns({ doc, setupHost, confirmHost, onChange(key, patch), onLeave(key), onControls(key) })
//   -> { render(rows), light(key, lit), destroy() }
// light(key, lit) takes the join manager's reused { green, red, yellow, blue, orange } flags
// and writes only the classes that changed.
export function createControllerColumns({ doc, setupHost, confirmHost, onChange, onLeave, onControls }) {
    const cards = new Map(); // key -> { col, row, name[], note[], frets, lit, segs }
    let order = [];

    function el(tag, cls, text) {
        const e = doc.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function top(nameEls) {
        const t = el('div', 'bab-top');
        const ico = el('span', 'bab-ico');
        ico.innerHTML = icon(FIVE_FRET_PART.icon, { size: 30 });
        const name = el('h2', 'bab-part-name');
        nameEls.push(name);
        t.append(ico, name);
        return t;
    }

    // A labelled segment; each button sends { field: toPref(value) }.
    function seg(key, label, field, options, toPref = (v) => v) {
        const wrap = el('div', 'bab-field');
        const box = el('div', 'bab-seg');
        box.setAttribute('data-field', field);
        const buttons = {};
        for (const [value, text] of options) {
            const b = el('button');
            b.type = 'button';
            b.setAttribute('data-value', value);
            if (typeof text === 'string') b.textContent = text;
            else b.append(...text);
            b.addEventListener('click', () => onChange(key, { [field]: toPref(value) }));
            buttons[value] = b;
            box.appendChild(b);
        }
        wrap.append(el('span', 'bab-label', label), box);
        return { field: wrap, buttons };
    }

    function build(key) {
        const names = [];
        const notes = [];
        const color = FIVE_FRET_PART.color;

        const col = el('div', 'bab-col bab-ctl');
        col.setAttribute('data-ctl', key);
        col.style.setProperty('--bab-c', color);
        const fretBox = el('div', 'bab-frets');
        const frets = {};
        const lit = {};
        for (const f of FRETS) {
            const s = el('span', 'bab-fret');
            s.setAttribute('data-fret', f);
            frets[f] = s;
            lit[f] = false;
            fretBox.appendChild(s);
        }
        const colNote = el('div', 'bab-note');
        notes.push(colNote);
        const actions = el('div', 'bab-ctl-actions');
        const controls = el('button', 'bab-ctl-controls', 'Controls');
        controls.type = 'button';
        controls.addEventListener('click', () => onControls(key));
        const leave = el('button', 'bab-ctl-leave');
        leave.type = 'button';
        const leaveIco = el('span', 'bab-btn-ico');
        leaveIco.innerHTML = icon('log-out', { size: 14 });
        leave.append(leaveIco, 'Leave');
        leave.addEventListener('click', () => onLeave(key));
        actions.append(controls, leave);
        col.append(top(names), fretBox, colNote, actions);

        const row = el('div', 'bab-part bab-ctl');
        row.setAttribute('data-ctl', key);
        row.style.setProperty('--bab-c', color);
        const partTags = {};
        const partAlso = {};
        const part = seg(key, 'Part', 'part', PART_ORDER.map((p) => {
            partTags[p] = el('span', 'bab-tag', '');
            partAlso[p] = el('span', 'bab-also', '');
            return [p, [el('span', 'bab-seg-text', FIVE_FRET_PART_LABELS[p]), partTags[p], partAlso[p]]];
        }));
        const difficulty = seg(key, 'Difficulty', 'difficulty', DIFFICULTIES.map((d) => [d, DIFFICULTY_LABELS[d] || d]));
        const lefty = seg(key, 'Lefty', 'lefty', LEFTY, (v) => v === 'on');
        const partAudio = seg(key, 'Part audio', 'partAudio', PART_AUDIO);
        const rowNote = el('div', 'bab-note');
        notes.push(rowNote);
        row.append(top(names), part.field, difficulty.field, lefty.field, partAudio.field, rowNote);

        return {
            col, row, names, notes, frets, lit, partTags, partAlso,
            segs: { part: part.buttons, difficulty: difficulty.buttons, lefty: lefty.buttons, partAudio: partAudio.buttons },
        };
    }

    function press(buttons, value, disabled = () => false) {
        for (const v of Object.keys(buttons)) {
            buttons[v].setAttribute('aria-pressed', v === value ? 'true' : 'false');
            buttons[v].disabled = disabled(v);
        }
    }

    function update(c, r) {
        for (const n of c.names) n.textContent = r.name || r.key;
        for (const n of c.notes) n.textContent = r.note || '';
        for (const e of [c.col, c.row]) {
            e.classList.toggle('bab-off', !r.on);
            e.classList.toggle('bab-unavailable', !!r.unavailable);
        }
        const parts = r.parts || {};
        press(c.segs.part, r.part, (p) => !(parts[p] && parts[p].has));
        for (const p of PART_ORDER) {
            const info = parts[p] || {};
            c.partTags[p].textContent = KIND_TAG[info.kind] || '';
            const others = Array.isArray(info.takenBy) ? info.takenBy.filter(Boolean) : [];
            c.partAlso[p].textContent = others.length ? 'also: ' + others.join(', ') : '';
        }
        press(c.segs.difficulty, r.difficulty);
        press(c.segs.lefty, r.lefty ? 'on' : 'off');
        press(c.segs.partAudio, r.partAudio, () => !!r.partAudioDisabled);
    }

    return {
        render(rows) {
            const list = Array.isArray(rows) ? rows.filter((r) => r && r.key) : [];
            const keys = list.map((r) => r.key);
            for (const [key, c] of cards) {
                if (keys.includes(key)) continue;
                c.col.remove();
                c.row.remove();
                cards.delete(key);
            }
            for (const r of list) if (!cards.has(r.key)) cards.set(r.key, build(r.key));
            // Re-append only when the join order changed (or a card was added).
            if (keys.length !== order.length || keys.some((k, i) => k !== order[i])) {
                for (const k of keys) {
                    setupHost.appendChild(cards.get(k).col);
                    confirmHost.appendChild(cards.get(k).row);
                }
                order = keys;
            }
            for (const r of list) update(cards.get(r.key), r);
        },
        light(key, lit) {
            const c = cards.get(key);
            if (!c) return;
            for (let i = 0; i < FRETS.length; i++) {
                const f = FRETS[i];
                const on = !!(lit && lit[f]);
                if (c.lit[f] === on) continue;
                c.lit[f] = on;
                c.frets[f].classList.toggle('bab-lit', on);
            }
        },
        destroy() {
            for (const c of cards.values()) { c.col.remove(); c.row.remove(); }
            cards.clear();
            order = [];
        },
    };
}
