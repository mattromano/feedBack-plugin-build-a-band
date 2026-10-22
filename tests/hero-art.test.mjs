import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroArtHtml, renderHeroArt } from '../src/hero-art.js';

test('heroArtHtml: the wordmark, bolt, copy and four instrument icons', () => {
    const html = heroArtHtml();
    assert.ok(html.startsWith('<div class="rhs-hero">'));
    assert.ok(html.includes('aria-label="RockHeroSmith"'));
    assert.ok(html.includes('class="rhs-bolt"'));
    assert.ok(html.includes('<p class="rhs-hero-tag">Real guitar meets Guitar Hero.</p>'));
    assert.ok(html.includes('<p class="rhs-hero-line">Plug in your guitar, hand a friend a controller, press Start.</p>'));
    assert.equal((html.match(/<svg class="rhs-icon"/g) || []).length, 4);
    for (const stop of ['#ffd23f', '#ff6b1a', '#e0343d']) assert.ok(html.includes(stop), stop);
});

test('renderHeroArt: fills the element; null does not throw', () => {
    const el = { innerHTML: '' };
    renderHeroArt(el);
    assert.equal(el.innerHTML, heroArtHtml());
    assert.doesNotThrow(() => renderHeroArt(null));
});
