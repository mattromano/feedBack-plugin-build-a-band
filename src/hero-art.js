// RockHeroSmith's Home hero art: the wordmark lockup (lightning bolt plus
// Rock / Hero / Smith, Hero in a flame gradient), the tagline and the
// instrument icons. Inline SVG and rhs- classes only; no raster assets.
import { icon } from './icons.js';

// R15's bolt, drawn at 6x in the 640 x 160 wordmark.
const BOLT = 'M13 2L4 14h7l-1 8 9-12h-7l1-8z';

export function heroArtHtml() {
    const icons = ['guitar', 'drum', 'mic', 'gamepad-2'].map((n) => icon(n, { size: 28 })).join('');
    return '<div class="rhs-hero">'
        + '<svg class="rhs-wordmark" role="img" aria-label="RockHeroSmith" viewBox="0 0 640 160">'
        + '<defs><linearGradient id="rhs-flame" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0" stop-color="#ffd23f"/><stop offset=".55" stop-color="#ff6b1a"/>'
        + '<stop offset="1" stop-color="#e0343d"/></linearGradient></defs>'
        + `<path class="rhs-bolt" d="${BOLT}" transform="translate(4 8) scale(6)"/>`
        + '<text class="rhs-wordmark-text" x="112" y="112" textLength="516" lengthAdjust="spacingAndGlyphs"'
        + ' font-size="96" font-weight="900" font-style="italic" fill="#ffffff">'
        + '<tspan>Rock</tspan><tspan fill="url(#rhs-flame)">Hero</tspan><tspan>Smith</tspan></text>'
        + '</svg>'
        + '<p class="rhs-hero-tag">Real guitar meets Guitar Hero.</p>'
        + `<div class="rhs-hero-icons">${icons}</div>`
        + '<p class="rhs-hero-line">Plug in your guitar, hand a friend a controller, press Start.</p>'
        + '</div>';
}

export function renderHeroArt(el) {
    if (el) el.innerHTML = heroArtHtml();
}
