/*
 * yarg-rules.js: star score and star power (overdrive) rules from YARG for the feedBack Build-a-Band plugin.
 *
 * Re-implemented from the numbers and rules in:
 *   YARG.Core (https://github.com/YARC-Official/YARG.Core):
 *     YARG.Core/Engine/BaseEngine.Generic.cs (UpdateStars: whole stars while score > threshold,
 *     then the inverse-lerp progress towards the next threshold)
 *     YARG.Core/Engine/BaseEngine.cs (star power: GainStarPower and AwardStarPower, a quarter bar per
 *     completed phrase; ActivateStarPower, deploy from half a bar; a full bar lasting 8 measures;
 *     the doubled multiplier while active)
 *   YARG (https://github.com/YARC-Official/YARG, also LGPL-3.0):
 *     Assets/Script/Gameplay/Player/FiveFretGuitarPlayer.cs (guitar star score multipliers)
 *     Assets/Script/Gameplay/Player/BasePlayer.cs (thresholds are multiples of the
 *     full-combo score without star power)
 *
 * Copyright (c) YARC (YARG) contributors
 * Licensed under the GNU Lesser General Public License v3.0
 * (see https://github.com/YARC-Official/YARG.Core/blob/master/LICENSE, and LICENSE.LGPL-3.0 at the plugin
 * root; LGPL-3.0 builds on the GPL-3.0 in LICENSE.GPL-3.0).
 *
 * Written in JavaScript for the feedBack Build-a-Band plugin. This file is a derivative work of the
 * above files and stays under LGPL-3.0. The rest of the plugin is MIT (see NOTICE.md) and only uses
 * this file through its exports.
 * Modifications: a dependency-free ES module working on plain numbers; thresholds take any base score
 * (the plugin passes note_detect's full-combo score) in place of YARG's chart-derived base; star power
 * is reduced to its numbers (fractions of a bar, measures and the multiplier).
 */

// BaseEngine.cs star power: a completed phrase gains a quarter bar (GainStarPower / AwardStarPower),
// deploying needs half a bar (ActivateStarPower), a full bar lasts 8 measures and the score multiplier
// doubles while it is active.
export const OVERDRIVE = Object.freeze({ phraseGain: 0.25, deployMin: 0.5, barMeasures: 8, multiplier: 2 });

// FiveFretGuitarPlayer.cs star score multipliers (1 to 6 stars).
export const GUITAR_STAR_MULTIPLIERS = Object.freeze([0.06, 0.12, 0.2, 0.47, 0.78, 1.15]);

export function starScoreThresholds(baseScore, multipliers) {
    return multipliers.map((m) => Math.floor(baseScore * m));
}

// BaseEngine.Generic.cs UpdateStars: count whole stars while score > threshold, then add the
// progress from the previous threshold (0 before the first star) to the next one.
export function starsFromScore(score, thresholds) {
    const th = Array.isArray(thresholds) ? thresholds : [];
    let idx = 0;
    while (idx < th.length && score > th[idx]) idx++;
    if (idx >= th.length) return idx;
    const prev = idx > 0 ? th[idx - 1] : 0;
    const next = th[idx];
    const progress = next === prev ? 0 : Math.min(1, Math.max(0, (score - prev) / (next - prev)));
    return idx + progress;
}
