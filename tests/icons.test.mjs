import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon, ICON_NAMES } from '../src/icons.js';

test('icon returns a Lucide SVG string', () => {
    const s = icon('star');
    assert.ok(s.startsWith('<svg class="bab-icon'), s);
    assert.ok(s.includes('viewBox="0 0 24 24"'));
    assert.ok(s.includes('stroke="currentColor"'));
    assert.ok(s.includes('fill="none"'));
    assert.ok(s.includes('aria-hidden="true"'));
    assert.ok(s.includes('width="18" height="18"'));
    assert.ok(s.endsWith('</svg>'));
});

test('icon size and class options', () => {
    const s = icon('zoom-in', { size: 14, cls: 'bab-x' });
    assert.ok(s.includes('class="bab-icon bab-x"'), s);
    assert.ok(s.includes('width="14" height="14"'));
    assert.ok(s.includes('<line x1="11" x2="11" y1="8" y2="14"/>'));
});

test('unknown icon is empty', () => {
    assert.equal(icon('nope'), '');
});

test('sixteen icons', () => {
    assert.equal(ICON_NAMES.length, 16);
    for (const n of ICON_NAMES) assert.ok(icon(n).includes('</svg>'), n);
});

test('the stage chrome icons (plan 7 R23)', () => {
    for (const n of ['menu', 'maximize', 'minimize', 'repeat', 'log-out']) assert.ok(ICON_NAMES.includes(n), n);
    assert.ok(icon('log-out').includes('<line x1="21" x2="9" y1="12" y2="12"/>'));
});
