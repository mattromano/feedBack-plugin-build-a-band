// Difficulty mappings shared by every part. Pure, no DOM.
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
export const GUITAR_MASTERY = { easy: 0.25, medium: 0.5, hard: 0.75, expert: 1 };

export function masteryFor(diff) {
    return Object.prototype.hasOwnProperty.call(GUITAR_MASTERY, diff) ? GUITAR_MASTERY[diff] : 0.5;
}

export function drumsDifficultyId(diff) {
    return DIFFICULTIES.includes(diff) ? diff : 'medium';
}

export function vocalsDifficultyId(diff) {
    return DIFFICULTIES.includes(diff) ? diff : 'medium';
}

export function masteryFromPct(pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct)) / 100;
}

export function guitarArrIndex(arrangements, name) {
    const want = String(name).toLowerCase();
    const list = arrangements || [];
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a && String(a.smart_name || a.name || '').toLowerCase() === want) {
            return a.index !== undefined ? a.index : i;
        }
    }
    return undefined;
}
