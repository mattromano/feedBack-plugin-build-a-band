// Highway WebSocket URL for a lane. `filename` is the DECODED name, i.e.
// feedBack.currentSong.filename, which core already decodes from its own WS
// URL (static/highway.js song_info handler). It is interpolated raw, exactly
// as core builds its own highway URL (session.js playSong and highway.js
// reconnect both put `decodeURIComponent(filename)` into the path unencoded),
// so the server sees the same path for a lane as for the main highway.
// Never decode here: a literal '%' in a name would throw.
// `loc` defaults lazily to globalThis.location so this imports under node.
export function getWsUrl(filename, arrangement, loc = globalThis.location) {
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const arrParam = arrangement !== undefined ? `?arrangement=${arrangement}` : '';
    return `${proto}//${loc.host}/ws/highway/${filename}${arrParam}`;
}
