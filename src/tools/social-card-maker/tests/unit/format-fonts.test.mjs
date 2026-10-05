// Unit tests for export-format / quality helpers and the system-font stacks
// (source/logic.mjs). Pure, DOM-free — imported directly, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMATS,
  mimeForFormat,
  formatSupportsQuality,
  clampQuality,
  percentToQuality,
  qualityToPercent,
  DEFAULT_QUALITY,
  clamp,
  num,
  formatBytes,
  CURATED_FONTS,
  CURATED_BY_NAME,
  resolveFontFamily,
  canvasFontString,
} from '../../source/logic.mjs';

// ---- Formats -----------------------------------------------------------------
test('FORMATS declares png/jpeg/webp with the right mime, ext and lossy flags', () => {
  assert.deepEqual(Object.keys(FORMATS).sort(), ['jpeg', 'png', 'webp']);
  assert.equal(FORMATS.png.mime, 'image/png');
  assert.equal(FORMATS.png.ext, 'png');
  assert.equal(FORMATS.png.lossy, false);
  assert.equal(FORMATS.jpeg.mime, 'image/jpeg');
  assert.equal(FORMATS.jpeg.ext, 'jpg');
  assert.equal(FORMATS.jpeg.lossy, true);
  assert.equal(FORMATS.webp.mime, 'image/webp');
  assert.equal(FORMATS.webp.ext, 'webp');
  assert.equal(FORMATS.webp.lossy, true);
  // No AVIF — no cross-browser canvas encoder.
  assert.equal(FORMATS.avif, undefined);
});

test('mimeForFormat maps names case-insensitively and defaults to PNG', () => {
  assert.equal(mimeForFormat('png'), 'image/png');
  assert.equal(mimeForFormat('jpeg'), 'image/jpeg');
  assert.equal(mimeForFormat('webp'), 'image/webp');
  assert.equal(mimeForFormat('JPEG'), 'image/jpeg');
  assert.equal(mimeForFormat('WebP'), 'image/webp');
  assert.equal(mimeForFormat('nope'), 'image/png');
  assert.equal(mimeForFormat(undefined), 'image/png');
});

test('formatSupportsQuality is true only for the lossy formats', () => {
  assert.equal(formatSupportsQuality('png'), false);
  assert.equal(formatSupportsQuality('jpeg'), true);
  assert.equal(formatSupportsQuality('webp'), true);
  assert.equal(formatSupportsQuality('JPEG'), true);
  assert.equal(formatSupportsQuality('nope'), false);
});

// ---- Quality -----------------------------------------------------------------
test('clampQuality clamps to [0,1] and falls back to the default on garbage', () => {
  assert.equal(clampQuality(0.5), 0.5);
  assert.equal(clampQuality(0), 0);
  assert.equal(clampQuality(1), 1);
  assert.equal(clampQuality(-0.2), 0);
  assert.equal(clampQuality(2), 1);
  assert.equal(clampQuality('nope'), DEFAULT_QUALITY);
  assert.equal(clampQuality(NaN), DEFAULT_QUALITY);
  assert.equal(DEFAULT_QUALITY, 0.92);
});

test('percentToQuality / qualityToPercent convert and round-trip', () => {
  assert.equal(percentToQuality(92), 0.92);
  assert.equal(percentToQuality(0), 0);
  assert.equal(percentToQuality(100), 1);
  assert.equal(percentToQuality('bad'), DEFAULT_QUALITY);
  assert.equal(qualityToPercent(0.92), 92);
  assert.equal(qualityToPercent(0), 0);
  assert.equal(qualityToPercent(1), 100);
  // round-trips at integer percents
  for (const p of [1, 25, 50, 75, 92, 100]) {
    assert.equal(qualityToPercent(percentToQuality(p)), p, `round-trip ${p}`);
  }
});

// ---- Small guards ------------------------------------------------------------
test('clamp keeps within [lo,hi] and returns lo on non-finite', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(20, 0, 10), 10);
  assert.equal(clamp('x', 2, 8), 2);
  assert.equal(clamp(NaN, 2, 8), 2);
  assert.equal(clamp('7', 0, 10), 7); // numeric string coerces
});

test('num coerces finite numbers and uses the fallback otherwise', () => {
  assert.equal(num('5'), 5);
  assert.equal(num('x', 7), 7);
  assert.equal(num(undefined, 3), 3);
  assert.equal(num(Infinity, 2), 2);
  assert.equal(num(NaN, 9), 9);
  assert.equal(num(0), 0);
  assert.equal(num(-4.5), -4.5);
});

test('formatBytes renders B / KB / MB / GB with one decimal above 1K', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
  assert.equal(formatBytes('nope'), '0 B');
});

// ---- System fonts ------------------------------------------------------------
test('CURATED_FONTS is a non-empty list of {name, stack}; the map indexes it', () => {
  assert.ok(Array.isArray(CURATED_FONTS) && CURATED_FONTS.length >= 8);
  for (const f of CURATED_FONTS) {
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.stack, 'string');
    assert.ok(f.stack.length > 0);
    assert.equal(CURATED_BY_NAME.get(f.name), f);
  }
  // System UI is the first pick and the universal fallback.
  assert.equal(CURATED_FONTS[0].name, 'System UI');
});

test('resolveFontFamily returns the curated stack, the system fallback, or a custom family', () => {
  assert.equal(resolveFontFamily({ family: 'Helvetica' }), 'Helvetica, Arial, sans-serif');
  assert.equal(resolveFontFamily({ family: 'Georgia' }), 'Georgia, "Times New Roman", serif');
  // Unknown family → the System UI fallback stack.
  assert.equal(resolveFontFamily({ family: 'Nope' }), CURATED_FONTS[0].stack);
  assert.equal(resolveFontFamily({}), CURATED_FONTS[0].stack);
  assert.equal(resolveFontFamily(null), CURATED_FONTS[0].stack);
});

test('resolveFontFamily quotes a custom family only when it needs it, and appends a fallback', () => {
  // Single token — no quoting needed.
  assert.equal(resolveFontFamily({ customFont: 'Futura' }), `Futura, ${CURATED_FONTS[0].stack}`);
  // Space in the name — quoted.
  assert.equal(resolveFontFamily({ customFont: 'My Font' }), `"My Font", ${CURATED_FONTS[0].stack}`);
  // A custom family overrides the curated pick.
  assert.equal(
    resolveFontFamily({ family: 'Helvetica', customFont: 'Futura' }),
    `Futura, ${CURATED_FONTS[0].stack}`,
  );
  // Stray quotes in the custom name are stripped before re-quoting.
  assert.equal(resolveFontFamily({ customFont: 'Some "Weird" Face' }), `"Some Weird Face", ${CURATED_FONTS[0].stack}`);
});

test('canvasFontString builds "<weight> <size>px <stack>" and clamps its parts', () => {
  assert.equal(
    canvasFontString({ fontSize: 72, fontWeight: 700, family: 'Helvetica' }),
    '700 72px Helvetica, Arial, sans-serif',
  );
  // Weight clamps into [100, 900].
  assert.equal(
    canvasFontString({ fontSize: 40, fontWeight: 5000, family: 'Helvetica' }),
    '900 40px Helvetica, Arial, sans-serif',
  );
  assert.equal(
    canvasFontString({ fontSize: 40, fontWeight: 10, family: 'Helvetica' }),
    '100 40px Helvetica, Arial, sans-serif',
  );
  // Size floored at 1px.
  assert.equal(
    canvasFontString({ fontSize: 0, fontWeight: 400, family: 'Helvetica' }),
    '400 1px Helvetica, Arial, sans-serif',
  );
});
