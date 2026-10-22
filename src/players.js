// Who is playing and how each player looks, keyed by player id: the fixed guitar /
// drums / vocals ids and the controller ids (ctl1, ...). Pure, no DOM.
import { getPart, FIVE_FRET_PART, DRUMS_CONTROLLER_PART } from './parts.js';
import { isControllerId, FIVE_FRET_PART_LABELS } from './controller-model.js';
import { difficultyLabel } from './hud-model.js';

const FIXED = ['guitar', 'drums', 'vocals'];

// Guitar, drums, vocals when `on`, then joined controllers with `on === true` in join order.
export function playingIds(prefs) {
    const parts = (prefs && prefs.parts) || {};
    const ids = FIXED.filter((id) => parts[id] && parts[id].on);
    for (const c of (prefs && Array.isArray(prefs.controllers) ? prefs.controllers : [])) {
        if (c && c.on === true) ids.push(c.id);
    }
    return ids;
}

// name: the part's label (the results card). tag: the lane's header line. The fixed
// parts reproduce the HUD's labels; a controller reads `Bass (5-Fret) · Expert · <name>`,
// a drums controller `Drums (Controller) · Expert · <name>`.
export function playerStyle(id, prefs, { oneLevel = false, sourceKind = '' } = {}) {
    if (isControllerId(id)) {
        const c = ((prefs && prefs.controllers) || []).find((x) => x && x.id === id) || {};
        if (c.playsAs === 'drums') {
            const d = DRUMS_CONTROLLER_PART;
            const tag = [d.label + ' (Controller)', difficultyLabel(c.difficulty), c.name].filter(Boolean).join(' · ');
            return { name: d.label, tag, color: d.color, icon: d.icon, calloutKind: 'drums' };
        }
        const name = (FIVE_FRET_PART_LABELS[c.part] || FIVE_FRET_PART_LABELS.guitar) + ' (' + FIVE_FRET_PART.label + ')';
        const tag = [name, difficultyLabel(c.difficulty), c.name, sourceKind === 'auto' ? 'AUTO CHART' : '']
            .filter(Boolean).join(' · ');
        return { name, tag, color: FIVE_FRET_PART.color, icon: FIVE_FRET_PART.icon, calloutKind: 'five_fret' };
    }
    const p = (prefs && prefs.parts && prefs.parts[id]) || {};
    const type = getPart(id);
    const name = id === 'guitar'
        ? (typeof p.arrangement === 'string' && p.arrangement ? p.arrangement : 'Lead')
        : (type ? type.label : id);
    const level = id === 'guitar' && oneLevel ? 'One level' : difficultyLabel(p.difficulty);
    return {
        name, tag: [name, level].filter(Boolean).join(' · '),
        color: type ? type.color : '', icon: type ? type.icon : '', calloutKind: id,
    };
}
