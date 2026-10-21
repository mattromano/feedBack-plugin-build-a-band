// Song picker: search box, band filters and a result list (recent songs while
// the box is empty). Thin DOM layer over query.js.
import { buildLibraryQuery, DEFAULT_FILTERS, songChips, createSearchController, resolveRecent } from './query.js';

const FILTERS = [
    ['guitar', 'Guitar part'],
    ['drums', 'Drum chart'],
    ['vocals', 'Vocal pitch'],
    ['drumStem', 'Drum stem'],
    ['playable', 'Playable by this band'],
];

// mountSongPicker({ host, doc, fetchJson?, getParts, getRecent, onPick, timers? })
//   -> { dispose(), refresh() }
// timers: { setTimer, clearTimer } (defaults to setTimeout / clearTimeout).
export function mountSongPicker({ host, doc, fetchJson, getParts, getRecent, onPick, timers }) {
    const win = doc.defaultView || globalThis;
    const getJson = fetchJson || ((url) => win.fetch(url).then((r) => r.json()));
    const filters = { ...DEFAULT_FILTERS };
    let disposed = false;

    const el = (tag, className, text) => {
        const e = doc.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    const root = el('div', 'bab-picker-body');
    const search = el('input', 'bab-search');
    search.type = 'search';
    search.placeholder = 'Search songs';
    search.setAttribute('aria-label', 'Search songs');
    const filterBar = el('div', 'bab-filters');
    const filterBtns = FILTERS.map(([id, label]) => {
        const b = el('button', 'bab-filter', label);
        b.type = 'button';
        b.setAttribute('data-filter', id);
        filterBar.appendChild(b);
        return b;
    });
    const label = el('div', 'bab-results-label');
    const list = el('ul', 'bab-results');
    root.append(search, filterBar, label, list);
    host.appendChild(root);

    const query = () => String(search.value || '').trim();

    function rowFor(title, artist) {
        const li = el('li', 'bab-row');
        const text = el('div', 'bab-row-text');
        text.append(el('span', 'bab-row-title', title), el('span', 'bab-row-artist', artist));
        li.appendChild(text);
        return li;
    }

    function showMessage(text) {
        label.textContent = '';
        list.replaceChildren(el('li', 'bab-results-msg', text));
    }

    function showResults(songs) {
        if (disposed || !query()) return; // the box was cleared meanwhile
        label.textContent = '';
        if (!songs.length) { showMessage('No songs match'); return; }
        list.replaceChildren(...songs.map((item) => {
            const li = rowFor(item.title || item.filename || '', item.artist || '');
            const chips = el('div', 'bab-chips');
            for (const c of songChips(item)) chips.appendChild(el('span', c.good ? 'bab-chip bab-good' : 'bab-chip', c.label));
            li.appendChild(chips);
            li.addEventListener('click', () => { if (!disposed) onPick(item); });
            return li;
        }));
    }

    function showRecent() {
        const recent = getRecent() || [];
        label.textContent = recent.length ? 'Recent' : '';
        list.replaceChildren(...recent.map((entry) => {
            const li = rowFor(entry.title || entry.filename, entry.artist || '');
            li.classList.add('bab-recent');
            li.addEventListener('click', async () => {
                const item = await resolveRecent(entry, getJson);
                if (disposed) return;
                if (item) { onPick(item); return; }
                if (!li.querySelector('.bab-row-missing')) li.appendChild(el('span', 'bab-row-missing', 'Not in the library any more'));
            });
            return li;
        }));
    }

    const controller = createSearchController({
        fetchJson: getJson,
        onResults: showResults,
        onError: () => { if (!disposed && query()) showMessage('Could not load songs'); },
        ...(timers ? { setTimer: timers.setTimer, clearTimer: timers.clearTimer } : {}),
    });

    function refresh() {
        if (disposed) return;
        const q = query();
        if (!q) { showRecent(); return; }
        controller.search(buildLibraryQuery({ q, filters, parts: getParts() || {} }));
    }

    function renderFilters() {
        filterBtns.forEach((b) => b.setAttribute('aria-pressed', filters[b.getAttribute('data-filter')] ? 'true' : 'false'));
    }

    const onInput = () => refresh();
    search.addEventListener('input', onInput);
    const filterHandlers = filterBtns.map((b) => {
        const fn = () => {
            const id = b.getAttribute('data-filter');
            filters[id] = !filters[id];
            renderFilters();
            refresh();
        };
        b.addEventListener('click', fn);
        return [b, fn];
    });

    renderFilters();
    refresh();

    return {
        refresh,
        dispose() {
            if (disposed) return;
            disposed = true;
            controller.dispose();
            search.removeEventListener('input', onInput);
            for (const [b, fn] of filterHandlers) b.removeEventListener('click', fn);
            root.remove();
        },
    };
}
