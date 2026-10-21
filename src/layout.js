// Build-a-Band stage layout: pure functions, no DOM access.
const MIN_SPLIT = 35;
const MAX_SPLIT = 80;
const DEFAULT_SPLIT = 62;

export function clampSplit(pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) return DEFAULT_SPLIT;
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct));
}

export function computeStageLayout({ lanes, split }) {
    if (lanes.length > 2) throw new Error('computeStageLayout supports at most two lanes');
    if (lanes.length === 0) return [];
    if (lanes.length === 1) return [{ part: lanes[0], leftPct: 0, widthPct: 100 }];
    const first = clampSplit(split);
    return [
        { part: lanes[0], leftPct: 0, widthPct: first },
        { part: lanes[1], leftPct: first, widthPct: 100 - first },
    ];
}

// Vertical rows: the band HUD bar holds the top HUD_HEIGHT_PX of #player. The
// vocal strip sits under it, full width; lanes start below the strip (or right
// under the HUD without one), or the strip fills the stage when there are no lanes.
export const HUD_HEIGHT_PX = 48;
export const STRIP_HEIGHT_PX = 90;

export function computeStageRows({ strip, lanes }) {
    if (!strip) return { strip: null, lanesTopPx: HUD_HEIGHT_PX };
    if (lanes.length === 0) return { strip: { topPx: HUD_HEIGHT_PX, heightPx: null, fill: true }, lanesTopPx: null };
    return {
        strip: { topPx: HUD_HEIGHT_PX, heightPx: STRIP_HEIGHT_PX, fill: false },
        lanesTopPx: HUD_HEIGHT_PX + STRIP_HEIGHT_PX,
    };
}
