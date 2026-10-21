// Library query builder, song chips and the debounced search controller.
import { songFacts, getPart, hasChart } from './parts.js';

export const DEFAULT_FILTERS = Object.freeze({
    guitar: false, drums: false, vocals: false, drumStem: false, playable: true,
});

// The router's page-size param is `size` (a `page_size` would be ignored).
export function buildLibraryQuery({ q = '', filters = DEFAULT_FILTERS, parts = {}, size = 30 } = {}) {
    const playable = !!filters.playable;
    const params = new URLSearchParams();
    params.set('q', String(q).trim());
    params.set('size', String(size));
    if (filters.guitar || (playable && parts.guitar && parts.guitar.on)) params.set('arrangements_has', 'Lead,Rhythm,Bass');
    if (filters.drums || (playable && parts.drums && parts.drums.on)) params.set('has_drums', '1');
    if (filters.vocals || (playable && parts.vocals && parts.vocals.on)) params.set('has_lyrics', 'pitch');
    if (filters.drumStem) params.set('stems_has', 'drums');
    return params.toString();
}

export function songChips(item) {
    const facts = songFacts(item);
    const names = facts.arrangements.map((a) => (a && (a.smart_name || a.name)) || '').filter(Boolean);
    return [
        { id: 'drumChart', label: 'Drum chart', good: hasChart(getPart('drums'), item) },
        { id: 'drumStem', label: 'Drum stem', good: facts.stemIds.includes('drums') },
        { id: 'vocalPitch', label: 'Vocal pitch', good: facts.hasVocalPitch },
        { id: 'arrangements', label: names.length ? names.join(' · ') : 'No arrangements', good: names.length > 0 },
    ];
}

export function createSearchController({
    fetchJson, onResults, onError, delay = 250, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
    let timer = null;
    let latest = 0;
    let disposed = false;

    function cancelTimer() {
        if (timer !== null) { clearTimer(timer); timer = null; }
    }

    return {
        search(queryString) {
            if (disposed) return;
            cancelTimer();
            timer = setTimer(async () => {
                timer = null;
                const id = ++latest;
                try {
                    const json = await fetchJson('/api/library?' + queryString);
                    if (disposed || id !== latest) return;
                    onResults((json && json.songs) || []);
                } catch (err) {
                    if (disposed || id !== latest) return;
                    if (onError) onError(err);
                }
            }, delay);
        },
        // Drops a pending search and ignores one already in flight.
        cancel() {
            cancelTimer();
            latest++;
        },
        dispose() {
            disposed = true;
            cancelTimer();
        },
    };
}

export async function resolveRecent(entry, fetchJson) {
    try {
        const json = await fetchJson(`/api/library?q=${encodeURIComponent(entry.title)}&size=30`);
        const songs = (json && json.songs) || [];
        return songs.find((s) => s && s.filename === entry.filename) || null;
    } catch (_) {
        return null;
    }
}
