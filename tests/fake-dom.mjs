// A small fake DOM for the band screen and song picker tests, in the style of
// stage-mount.test.mjs: elements with attributes, classList, listeners and
// simple compound selectors (tag, #id, .class, [attr] / [attr="v"]; no
// combinators). parseHtml() reads the plugin's own static screen.html.

function makeListeners() {
    const map = new Map();
    return {
        addEventListener(t, f) { (map.get(t) || map.set(t, new Set()).get(t)).add(f); },
        removeEventListener(t, f) { map.get(t)?.delete(f); },
        listenerCount() { let n = 0; for (const s of map.values()) n += s.size; return n; },
        fire(t, e = {}) {
            const ev = { type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...e };
            for (const f of [...(map.get(t) || [])]) f(ev);
            return ev;
        },
    };
}

function parseSelector(sel) {
    const m = { tag: null, id: null, classes: [], attrs: [] };
    const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g;
    let r;
    while ((r = re.exec(sel))) {
        if (r[1]) m.tag = r[1].toUpperCase();
        else if (r[2]) m.id = r[2];
        else if (r[3]) m.classes.push(r[3]);
        else m.attrs.push([r[4], r[5]]);
    }
    return m;
}

function matches(el, sel) {
    const m = parseSelector(sel);
    if (m.tag && el.tagName !== m.tag) return false;
    if (m.id && el.getAttribute('id') !== m.id) return false;
    if (!m.classes.every((c) => el.classList.contains(c))) return false;
    return m.attrs.every(([k, v]) => el.hasAttribute(k) && (v === undefined || el.getAttribute(k) === v));
}

function walk(el, out) {
    for (const c of el.children) { out.push(c); walk(c, out); }
    return out;
}

export function makeEl(tag, doc) {
    const attrs = new Map();
    const classSet = () => new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean));
    const writeClasses = (s) => attrs.set('class', [...s].join(' '));
    let text = '';
    const el = {
        tagName: tag.toUpperCase(), ownerDocument: doc, parentNode: null, children: [],
        value: '', checked: false, disabled: false, isContentEditable: false,
        style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
        get id() { return attrs.get('id') || ''; },
        set id(v) { attrs.set('id', v); },
        get className() { return attrs.get('class') || ''; },
        set className(v) { attrs.set('class', v); },
        get type() { return attrs.get('type') || ''; },
        set type(v) { attrs.set('type', v); },
        get placeholder() { return attrs.get('placeholder') || ''; },
        set placeholder(v) { attrs.set('placeholder', v); },
        get dataset() {
            const d = {};
            for (const [k, v] of attrs) if (k.startsWith('data-')) d[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
            return d;
        },
        classList: {
            add: (...cs) => { const s = classSet(); cs.forEach((c) => s.add(c)); writeClasses(s); },
            remove: (...cs) => { const s = classSet(); cs.forEach((c) => s.delete(c)); writeClasses(s); },
            contains: (c) => classSet().has(c),
            toggle: (c, on) => {
                const s = classSet();
                const want = on === undefined ? !s.has(c) : !!on;
                if (want) s.add(c); else s.delete(c);
                writeClasses(s);
                return want;
            },
        },
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        setAttribute: (k, v) => { attrs.set(k, String(v)); },
        hasAttribute: (k) => attrs.has(k),
        removeAttribute: (k) => { attrs.delete(k); },
        get textContent() { return this.children.length ? text + this.children.map((c) => c.textContent).join('') : text; },
        set textContent(v) { for (const c of [...this.children]) c.remove(); text = String(v); },
        appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; },
        append(...cs) {
            for (const c of cs) {
                if (typeof c === 'string') { const t = makeEl('#text', doc); t.textContent = c; this.appendChild(t); } else this.appendChild(c);
            }
        },
        replaceChildren(...cs) { for (const c of [...this.children]) c.remove(); text = ''; this.append(...cs); },
        remove() {
            if (!this.parentNode) return;
            const p = this.parentNode.children;
            p.splice(p.indexOf(this), 1);
            this.parentNode = null;
        },
        querySelectorAll(sel) { return walk(this, []).filter((e) => matches(e, sel)); },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        closest(sel) { for (let e = this; e; e = e.parentNode) if (e.tagName && matches(e, sel)) return e; return null; },
        click() { if (!this.disabled) this.fire('click'); },
        ...makeListeners(),
    };
    return el;
}

export function makeDoc() {
    const doc = { activeElement: null, ...makeListeners() };
    doc.createElement = (t) => makeEl(t, doc);
    doc.body = makeEl('body', doc);
    doc.getElementById = (id) => doc.body.querySelector('#' + id);
    return doc;
}

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);

// Enough HTML for screen.html: elements, quoted/bare attributes, text.
export function parseHtml(html, doc, parent) {
    const stack = [parent];
    const re = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
        const top = stack[stack.length - 1];
        if (m[1]) { stack.pop(); continue; }
        if (m[2]) {
            const el = makeEl(m[2], doc);
            for (const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
                el.setAttribute(a[1], a[2] === undefined ? '' : a[2]);
                if (a[1] === 'disabled') el.disabled = true;
                if (a[1] === 'checked') el.checked = true;
            }
            top.appendChild(el);
            if (!VOID.has(m[2].toLowerCase()) && !m[0].endsWith('/>')) stack.push(el);
            continue;
        }
        if (m[4] && m[4].trim()) top.append(m[4].trim());
    }
    return parent;
}

// Fake timers: run() fires every pending callback.
export function makeTimers() {
    const pending = new Map();
    let next = 1;
    return {
        setTimer: (fn) => { const id = next++; pending.set(id, fn); return id; },
        clearTimer: (id) => { pending.delete(id); },
        pending: () => pending.size,
        run() { const fns = [...pending.values()]; pending.clear(); fns.forEach((f) => f()); },
    };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
