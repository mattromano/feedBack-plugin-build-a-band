import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE_ID, isBandReady, bandIsSetUp } from '../src/main-mode.js';
import { normalizePrefs } from '../src/prefs.js';

test('MODE_ID is the plugin id', () => {
    assert.equal(MODE_ID, 'rockherosmith');
});

test('isBandReady: a real guitar part plus a five-fret chart or a drum chart', () => {
    assert.equal(isBandReady({ arrangements: [{ name: 'Lead' }], has_drum_tab: 1 }), true);
    assert.equal(isBandReady({ arrangements: [{ name: 'Rhythm' }, { name: 'Drums', type: 'drums' }] }), true);
    assert.equal(isBandReady({ arrangements: [{ name: 'Bass' }], five_fret_parts: ['bass:chart'] }), true);
});

test('isBandReady: guitar only, lyrics only, auto charts, five-fret-only packs and Combo do not qualify', () => {
    assert.equal(isBandReady({ arrangements: [{ name: 'Lead' }] }), false, 'guitar only');
    assert.equal(isBandReady({ arrangements: [{ name: 'Lead' }], has_vocal_pitch: true }), false, 'lyrics only');
    assert.equal(isBandReady({ arrangements: [{ name: 'Lead' }], five_fret_parts: ['guitar:auto'] }), false, 'auto chart only');
    assert.equal(isBandReady({ five_fret_only: true, arrangements: [{ name: 'Lead' }], five_fret_parts: ['guitar:chart'] }), false,
        'five-fret-only pack');
    assert.equal(isBandReady({ arrangements: [{ name: 'Combo' }], has_drum_tab: 1 }), false, 'Combo only');
    assert.equal(isBandReady(null), false);
});

test('bandIsSetUp: defaults are not a band', () => {
    assert.equal(bandIsSetUp(normalizePrefs({})), false);
});

test('bandIsSetUp: a fixed part that is on with a saved device', () => {
    assert.equal(bandIsSetUp(normalizePrefs({ parts: { guitar: { deviceKey: 'g' } } })), true);
    assert.equal(bandIsSetUp(normalizePrefs({ parts: { guitar: { on: false, deviceKey: 'g' } } })), false, 'guitar off');
    assert.equal(bandIsSetUp(normalizePrefs({ parts: { drums: { deviceKey: 'k' } } })), true, 'drums');
    assert.equal(bandIsSetUp(normalizePrefs({ parts: { vocals: { deviceId: 'm' } } })), true, 'vocals');
});

test('bandIsSetUp: a joined controller that is on', () => {
    const ctl = (on) => normalizePrefs({ controllers: [{ key: 'Xbox#1', id: 'ctl1', playsAs: 'five_fret', on }] });
    assert.equal(bandIsSetUp(ctl(true)), true);
    assert.equal(bandIsSetUp(ctl(false)), false);
});

test('bandIsSetUp: missing or partial prefs do not throw', () => {
    assert.equal(bandIsSetUp(null), false);
    assert.equal(bandIsSetUp({}), false);
    assert.equal(bandIsSetUp({ controllers: [{ key: 'a' }] }), true, 'on !== false');
});
