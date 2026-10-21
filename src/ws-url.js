// Highway WebSocket URL for a lane. Mirrors splitscreen's getWsUrl (and core
// highway.js reconnect): `filename` is the percent-encoded form carried by
// feedBack.currentSong, so decode it before building the path, because the
// server route does not decode %2F. `loc` defaults lazily to globalThis.location
// so this imports and tests under node.
export function getWsUrl(filename, arrangement, loc = globalThis.location) {
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const decoded = decodeURIComponent(filename);
    const arrParam = arrangement !== undefined ? `?arrangement=${arrangement}` : '';
    return `${proto}//${loc.host}/ws/highway/${decoded}${arrParam}`;
}
