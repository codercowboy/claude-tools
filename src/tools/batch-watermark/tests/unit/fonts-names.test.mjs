// Unit tests: font stacks, text block metrics, format mapping, output-name dedupe, shared storeZip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS } from '../../../../lib/utils/image/CtImageUtil.mjs';
import { loadLogic, readStoreZip, ascii } from './_helpers.mjs';

test('resolveFontFamily: Arial default, curated stacks, custom family quoted and first', async () => {
  const L = await loadLogic();
  assert.equal(L.CURATED_FONTS[0].name, 'Arial');
  assert.equal(L.resolveFontFamily({}), 'Arial, Helvetica, sans-serif');
  assert.equal(L.resolveFontFamily(), 'Arial, Helvetica, sans-serif');
  assert.equal(L.resolveFontFamily({ fontFamily: 'Georgia' }), 'Georgia, "Times New Roman", serif');
  assert.equal(L.resolveFontFamily({ fontFamily: 'Nope' }), 'Arial, Helvetica, sans-serif');
  assert.equal(L.resolveFontFamily({ customFont: 'My Font' }), '"My Font", Arial, sans-serif');
  assert.equal(L.resolveFontFamily({ customFont: 'Foo"Bar baz' }), '"FooBar baz", Arial, sans-serif');
  assert.equal(L.resolveFontFamily({ customFont: 'Lobster', fontFamily: 'Georgia' }), 'Lobster, Arial, sans-serif');
});

test('canvasFontString / strokeForSize / strokeWidthFor / shadowFor scale with size', async () => {
  const L = await loadLogic();
  assert.equal(L.canvasFontString({ fontSize: 40, fontFamily: 'Verdana' }), '40px Verdana, Geneva, sans-serif');
  assert.equal(L.canvasFontString({ fontSize: 0 }), '1px Arial, Helvetica, sans-serif');
  assert.equal(L.strokeForSize(48), 4);
  assert.equal(L.strokeForSize(1), 1);
  assert.equal(L.strokeWidthFor(120, 0), 0);
  assert.equal(L.strokeWidthFor(120, 5), 10);
  assert.equal(L.strokeWidthFor(240, 5), 20);
  const s = L.shadowFor(48, true);
  assert.equal(s.blur, 4); assert.equal(s.offset, 2);
  assert.equal(L.shadowFor(48, false).blur, 0);
});

test('textBlockMetrics: multi-line split, injected measure, padding for stroke/shadow, proportional to size', async () => {
  const { textBlockMetrics } = await loadLogic();
  const measure = (s, size) => s.length * size * 0.5;
  const m = textBlockMetrics('Hello\nHi\n', 100, measure, {});
  assert.deepEqual(m.lines, ['Hello', 'Hi']);
  assert.equal(m.textW, 250);
  assert.ok(Math.abs(m.lineH - 115) < 1e-9);
  assert.equal(m.pad, 1);
  const s = textBlockMetrics('Hello', 100, measure, { strokeLevel: 5, shadow: true });
  assert.ok(s.pad > m.pad && s.width > m.width - 2 + 20);
  const half = textBlockMetrics('Hello', 50, measure, { strokeLevel: 5, shadow: true });
  assert.ok(Math.abs(half.width / s.width - 0.5) < 0.05);
  assert.deepEqual(textBlockMetrics('', 10, measure).lines, ['']);
});

test('format mapping: source mime -> key (fallback PNG); explicit choice wins; alpha loss flagged', async () => {
  const L = await loadLogic();
  assert.equal(L.formatForSource('image/jpeg'), 'jpeg');
  assert.equal(L.formatForSource('image/webp'), 'webp');
  for (const m of ['image/png', 'image/gif', 'image/bmp', 'image/svg+xml', '', undefined]) assert.equal(L.formatForSource(m), 'png');
  assert.equal(L.outputFormat('source', 'image/jpeg'), 'jpeg');
  assert.equal(L.outputFormat('png', 'image/jpeg'), 'png');
  assert.equal(L.outputFormat('webp', 'image/png'), 'webp');
  assert.equal(L.outputFormat('bogus', 'image/webp'), 'webp');
  assert.equal(FORMATS.jpeg.ext, 'jpg');
  assert.equal(L.losesAlpha('image/png', 'jpeg'), true);
  assert.equal(L.losesAlpha('image/jpeg', 'jpeg'), false);
  assert.equal(L.losesAlpha('image/png', 'webp'), false);
});

test('uniqueName: -watermarked suffix, extension, case-insensitive collision dedupe', async () => {
  const { uniqueName, baseName } = await loadLogic();
  assert.equal(baseName('My Photo.JPG'), 'my-photo');
  assert.equal(baseName('///'), 'image');
  const used = new Set();
  assert.equal(uniqueName('My Photo.jpg', 'jpg', used), 'my-photo-watermarked.jpg');
  assert.equal(uniqueName('my photo.jpeg', 'jpg', used), 'my-photo-watermarked-1.jpg');
  assert.equal(uniqueName('MY-PHOTO.png', 'jpg', used), 'my-photo-watermarked-2.jpg');
  assert.equal(uniqueName('my-photo.png', 'png', used), 'my-photo-watermarked.png');
  assert.equal(used.size, 4);
});

test('buildZip is the shared storeZip: round-trips through the independent srcset-builder reader', async () => {
  const { buildZip, zipName } = await loadLogic();
  const files = [{ name: 'a-watermarked.png', bytes: ascii('AAAA') }, { name: 'b-watermarked.jpg', bytes: new Uint8Array([1, 2, 3, 255]) }, { name: 'empty.webp', bytes: new Uint8Array(0) }];
  const z = readStoreZip(buildZip(files));
  const entries = z.entries;
  assert.equal(z.totalRecords, 3);
  assert.ok(entries.every((e) => e.method === 0 && e.crcStored === e.recomputedCrc && e.lCrc === e.crcStored));
  assert.deepEqual(entries.map((e) => e.name), files.map((f) => f.name));
  entries.forEach((e, i) => assert.deepEqual(Array.from(e.data), Array.from(files[i].bytes)));
  assert.equal(zipName(), 'watermarked.zip');
});

test('logic.mjs imports storeZip from the shared module and defines no zip writer of its own', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../source/logic.mjs', import.meta.url)), 'utf8');
  assert.match(src, /import \{[^}]*\bstoreZip\b[^}]*\} from '(?:\.\.\/){3}lib\/utils\/CtZipUtil\.mjs'/);
  assert.doesNotMatch(src, /function storeZip|0x04034b50|0x06054b50/);
});

test('app.mjs imports only component modules (no jbc util module)', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../source/app.mjs', import.meta.url)), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 3);
  assert.ok(imports.every((p) => p.includes('/components/')), imports.join(','));
});
