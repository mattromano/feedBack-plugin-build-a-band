// The stage's hover chrome (plan 7 R5, R7, R20): a row of band buttons (Menu, A-B
// loop, Full screen, End) that core's own chrome-active reveal shows above the
// transport, and a 10 px left edge that opens the sidebar in full mode. Draws only:
// the caller decides what each button does.
import { icon } from './icons.js';

const ICON_PX = 18;
const LOOP = {
    none: { text: 'Loop A', title: 'Set loop start' },
    a: { text: 'Loop B', title: 'Set loop end' },
    ab: { text: 'Clear loop', title: 'Clear loop' },
};

// createStageChrome({ doc, player, full, onMenu, onLoop, onFullScreen, onEnd, onEdge })
//   -> { setFull(on), setLoop(state), destroy() }
export function createStageChrome({ doc, player, full, onMenu, onLoop, onFullScreen, onEnd, onEdge }) {
    const row = doc.createElement('div');
    row.className = 'rhs-chrome';

    const setTitle = (btn, title) => {
        btn.setAttribute('title', title);
        btn.setAttribute('aria-label', title);
    };
    const setIcon = (btn, name) => { btn.querySelector('.rhs-chrome-icon').innerHTML = icon(name, { size: ICON_PX }); };
    function button(cls, name, title, cb) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = cls;
        const glyph = doc.createElement('span');
        glyph.className = 'rhs-chrome-icon';
        btn.appendChild(glyph);
        setIcon(btn, name);
        if (title) setTitle(btn, title);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof cb === 'function') cb();
        });
        row.appendChild(btn);
        return btn;
    }

    button('rhs-chrome-menu', 'menu', 'Menu (M)', onMenu);
    const loopBtn = button('rhs-chrome-loop', 'repeat', '', onLoop);
    const loopLabel = doc.createElement('span');
    loopLabel.className = 'rhs-chrome-label';
    loopBtn.appendChild(loopLabel);
    const fullBtn = button('rhs-chrome-full', 'maximize', '', onFullScreen);
    button('rhs-chrome-end', 'log-out', 'End song', onEnd);

    const edge = doc.createElement('div');
    edge.className = 'rhs-edge';
    edge.addEventListener('pointerenter', () => { if (typeof onEdge === 'function') onEdge(); });

    player.appendChild(row);
    player.appendChild(edge);

    let destroyed = false;

    // Both are no-ops once destroyed, so a late call can't put rhs-full back.
    function setFull(on) {
        if (destroyed) return;
        const isFull = !!on;
        player.classList.toggle('rhs-full', isFull);
        fullBtn.setAttribute('aria-pressed', String(isFull));
        setTitle(fullBtn, isFull ? 'Exit full screen' : 'Full screen');
        setIcon(fullBtn, isFull ? 'minimize' : 'maximize');
    }

    function setLoop(state) {
        if (destroyed) return;
        const s = LOOP[state] || LOOP.none;
        loopLabel.textContent = s.text;
        setTitle(loopBtn, s.title);
    }

    setFull(full);
    setLoop('none');

    return {
        setFull,
        setLoop,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            row.remove();
            edge.remove();
            player.classList.remove('rhs-full');
        },
    };
}
