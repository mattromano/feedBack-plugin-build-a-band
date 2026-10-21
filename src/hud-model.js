// What the band HUD shows: pure formatting and thresholds, no DOM (plan 4 R6-R8).
import { DIFFICULTIES } from './mappings.js';

const SCORE_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatScore(n) {
    if (!Number.isFinite(n)) return '0';
    return SCORE_FORMAT.format(Math.round(n) || 0);
}

export function difficultyLabel(id) {
    return DIFFICULTIES.includes(id) ? id[0].toUpperCase() + id.slice(1) : '';
}

// R6 zones (the draft's gradient): red below 0.25, yellow below 0.55, green otherwise.
export function crowdZone(c) {
    if (!(c >= 0.25)) return 'red';
    return c < 0.55 ? 'yellow' : 'green';
}

// R8: 0.15 at no streak, full at a 50 streak.
export const GLOW_MIN = 0.15;
const GLOW_STREAK = 50;
export function glowLevel(streak) {
    const s = Number.isFinite(streak) ? Math.max(0, streak) : 0;
    return Math.round((GLOW_MIN + (1 - GLOW_MIN) * Math.min(1, s / GLOW_STREAK)) * 1000) / 1000;
}

// R7: guitar and drums call out every 50 notes, vocals every 5 phrases. Fires when
// the streak rises into a new multiple (so a jump past one still calls it out).
const CALLOUTS = {
    guitar: { every: 50, unit: 'NOTE' },
    drums: { every: 50, unit: 'NOTE' },
    vocals: { every: 5, unit: 'PHRASE' },
};
export function streakCallout(part, prev, next) {
    const rule = Object.prototype.hasOwnProperty.call(CALLOUTS, part) ? CALLOUTS[part] : null;
    if (!rule || !Number.isFinite(next) || !(next > 0)) return null;
    const before = Number.isFinite(prev) ? Math.max(0, prev) : 0;
    if (!(next > before)) return null;
    const milestone = Math.floor(next / rule.every);
    if (milestone < 1 || milestone === Math.floor(before / rule.every)) return null;
    return milestone * rule.every + ' ' + rule.unit + ' STREAK!';
}

export function bandMultiplierText(n) {
    return 'BAND ×' + n;
}
