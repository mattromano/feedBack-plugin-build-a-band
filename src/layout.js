// RockHeroSmith stage layout: pure functions, no DOM access.
import { isControllerId } from './controller-model.js';

const MIN_SPLIT = 35;
const MAX_SPLIT = 80;
const DEFAULT_SPLIT = 62;

export function clampSplit(pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) return DEFAULT_SPLIT;
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct));
}

// Controller lanes (ctl<N>) sit right of the real lanes, in join order, each
// min(CONTROLLER_LANE_PCT, CONTROLLER_SHARE_MAX / n) of the row; with no real
// lane they share the row. The real lanes (guitar | drums) split what is left
// by `split`, a percentage of that real region.
export const CONTROLLER_LANE_PCT = 22;
export const CONTROLLER_SHARE_MAX = 60;

function realRegionPct(lanes) {
    const n = lanes.filter(isControllerId).length;
    if (n === 0) return 100;
    if (n === lanes.length) return 0;
    return 100 - n * Math.min(CONTROLLER_LANE_PCT, CONTROLLER_SHARE_MAX / n);
}

// lanes: real ids first, then controller ids. -> [{ part, leftPct, widthPct }]
export function computeStageLayout({ lanes, split }) {
    const real = lanes.filter((id) => !isControllerId(id));
    const ctls = lanes.filter(isControllerId);
    if (real.length > 2) throw new Error('computeStageLayout supports at most two real lanes');
    const realPct = realRegionPct(lanes);
    const out = [];
    if (real.length === 1) out.push({ part: real[0], leftPct: 0, widthPct: realPct });
    if (real.length === 2) {
        const s = clampSplit(split);
        const first = realPct === 100 ? s : (s * realPct) / 100;
        out.push({ part: real[0], leftPct: 0, widthPct: first },
            { part: real[1], leftPct: first, widthPct: realPct - first });
    }
    const w = ctls.length ? (100 - realPct) / ctls.length : 0;
    ctls.forEach((id, i) => out.push({ part: id, leftPct: realPct + i * w, widthPct: w }));
    return out;
}

// The divider's pointer position (a percentage of the whole row) as a split:
// a percentage of the real region, clamped.
export function splitFromPointer(pointerPct, lanes) {
    const realPct = realRegionPct(lanes);
    if (!(realPct > 0)) return clampSplit(NaN);
    return clampSplit(realPct === 100 ? pointerPct : (pointerPct / realPct) * 100);
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
