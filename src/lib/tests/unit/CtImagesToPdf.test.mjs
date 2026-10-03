// Unit tests for CtImagesToPdf.mjs (pure helpers + hand-rolled PDF-1.4 writer).
// Zero-dep (node:test + node:assert/strict). Run: node --test src/lib/tests/
//
// Strategy: helpers asserted against hand-computed constants; the PDF is asserted against a
// HAND-WRITTEN expected byte layout (literal object text, xref offsets summed from the literal
// lengths) -- not against the lib's own output. No canvas/DOM is involved: the writer takes
// pre-encoded "JPEG" bytes (opaque to it) + pixel dimensions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MM_TO_PT, PT_PER_PX, PAGE_SIZES_PT, DEFAULT_QUALITY,
  mmToPt, ptToMm, pdfNumber, pdfEscapeString, pad10, strToBytes,
  clampQuality, percentToQuality, qualityToPercent, formatBytes,
  applyOrientation, orientedPageSize, computePlacement, buildContentStream,
  planPages, assemblePdf, buildPdf,
} from '../../utils/image/CtImagesToPdf.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' !~ ' + b);
const latin1 = (u8) => Array.from(u8, (c) => String.fromCharCode(c)).join('');

// ------------------------------------------------------------ constants
test('constants: MM_TO_PT, PT_PER_PX, PAGE_SIZES_PT, DEFAULT_QUALITY', () => {
  near(MM_TO_PT, 2.834645669291339);   // 72 / 25.4
  assert.equal(PT_PER_PX, 1);
  assert.deepEqual(PAGE_SIZES_PT, {
    a4: { w: 595.276, h: 841.890 },
    a3: { w: 841.890, h: 1190.551 },
    letter: { w: 612, h: 792 },
    legal: { w: 612, h: 1008 },
  });
  assert.equal(DEFAULT_QUALITY, 0.85);
});

// ------------------------------------------------------------ units
test('mmToPt / ptToMm: 25.4 mm = 72 pt; invalid -> 0; round-trip', () => {
  near(mmToPt(25.4), 72);
  near(mmToPt(10), 28.34645669291339);
  assert.equal(mmToPt('abc'), 0);
  assert.equal(mmToPt(undefined), 0);
  near(ptToMm(72), 25.4);
  assert.equal(ptToMm(null), 0);
  near(ptToMm(mmToPt(210)), 210);
});

// ------------------------------------------------------------ pdfNumber
test('pdfNumber: trims trailing zeros, max 4 decimals, no exponent', () => {
  assert.equal(pdfNumber(1), '1');
  assert.equal(pdfNumber(100), '100');
  assert.equal(pdfNumber(10), '10');
  assert.equal(pdfNumber(1.5), '1.5');
  assert.equal(pdfNumber(0.1234567), '0.1235');
  assert.equal(pdfNumber(595.276), '595.276');
  assert.equal(pdfNumber(-2.25), '-2.25');
  assert.equal(pdfNumber(0), '0');
});

test('pdfNumber: -0 / tiny negatives -> "0"; NaN/Infinity/non-numeric -> "0"', () => {
  assert.equal(pdfNumber(-0), '0');
  assert.equal(pdfNumber(-0.00001), '0');
  assert.equal(pdfNumber(NaN), '0');
  assert.equal(pdfNumber(Infinity), '0');
  assert.equal(pdfNumber('x'), '0');
  assert.equal(pdfNumber('3.5'), '3.5');
});

test('pdfNumber: huge magnitudes emit a plain integer (never an exponent)', () => {
  assert.equal(pdfNumber(1e21), '1000000000000000000000');
  assert.ok(!/e/i.test(pdfNumber(1e25)));
});

// ------------------------------------------------------------ pdfEscapeString
test('pdfEscapeString: escapes \\ ( ) and control chars', () => {
  assert.equal(pdfEscapeString('a(b)c'), 'a\\(b\\)c');
  assert.equal(pdfEscapeString('x\\y'), 'x\\\\y');
  assert.equal(pdfEscapeString('l1\nl2\rl3\tl4'), 'l1\\nl2\\rl3\\tl4');
  assert.equal(pdfEscapeString('\b\f'), '\\b\\f');
  assert.equal(pdfEscapeString('plain'), 'plain');
});

test('pdfEscapeString: null/undefined -> ""; non-strings stringified', () => {
  assert.equal(pdfEscapeString(null), '');
  assert.equal(pdfEscapeString(undefined), '');
  assert.equal(pdfEscapeString(42), '42');
});

// ------------------------------------------------------------ pad10 / strToBytes
test('pad10: zero-pads to 10, rounds, clamps negatives and junk to 0', () => {
  assert.equal(pad10(42), '0000000042');
  assert.equal(pad10(0), '0000000000');
  assert.equal(pad10(3.6), '0000000004');
  assert.equal(pad10(-5), '0000000000');
  assert.equal(pad10('x'), '0000000000');
  assert.equal(pad10(1234567890), '1234567890');
});

test('strToBytes: Latin-1 bytes, high chars masked to 0xff', () => {
  assert.deepEqual(Array.from(strToBytes('AB')), [65, 66]);
  assert.deepEqual(Array.from(strToBytes('')), []);
  assert.deepEqual(Array.from(strToBytes('éŁ')), [0xe9, 0x41]); // 0x141 & 0xff = 0x41
  assert.ok(strToBytes('hi') instanceof Uint8Array);
});

// ------------------------------------------------------------ quality
test('clampQuality: clamps to [0,1]; non-finite -> DEFAULT_QUALITY', () => {
  assert.equal(clampQuality(-1), 0);
  assert.equal(clampQuality(2), 1);
  assert.equal(clampQuality(0.5), 0.5);
  assert.equal(clampQuality(0), 0);
  assert.equal(clampQuality(1), 1);
  assert.equal(clampQuality(NaN), 0.85);
  assert.equal(clampQuality('x'), 0.85);
  assert.equal(clampQuality(Infinity), 0.85);
});

test('percentToQuality / qualityToPercent', () => {
  assert.equal(percentToQuality(50), 0.5);
  assert.equal(percentToQuality(100), 1);
  assert.equal(percentToQuality(150), 1);
  assert.equal(percentToQuality(-10), 0);
  assert.equal(percentToQuality('x'), 0.85);
  assert.equal(qualityToPercent(0.85), 85);
  assert.equal(qualityToPercent(1), 100);
  assert.equal(qualityToPercent(2), 100);
  assert.equal(qualityToPercent(-1), 0);
  assert.equal(qualityToPercent(NaN), 85);
});

// ------------------------------------------------------------ formatBytes (re-export)
test('formatBytes (re-exported): B / KB / MB / GB', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
});

// ------------------------------------------------------------ applyOrientation
test('applyOrientation: portrait / landscape swap to the requested aspect', () => {
  assert.deepEqual(applyOrientation({ w: 100, h: 200 }, 'landscape'), { w: 200, h: 100 });
  assert.deepEqual(applyOrientation({ w: 200, h: 100 }, 'portrait'), { w: 100, h: 200 });
  assert.deepEqual(applyOrientation({ w: 100, h: 200 }, 'portrait'), { w: 100, h: 200 });
  assert.deepEqual(applyOrientation({ w: 200, h: 100 }, 'landscape'), { w: 200, h: 100 });
});

test('applyOrientation: auto follows the image aspect (square / taller -> portrait)', () => {
  assert.deepEqual(applyOrientation({ w: 100, h: 200 }, 'auto', 30, 10), { w: 200, h: 100 });
  assert.deepEqual(applyOrientation({ w: 100, h: 200 }, 'auto', 10, 30), { w: 100, h: 200 });
  assert.deepEqual(applyOrientation({ w: 200, h: 100 }, 'auto', 10, 10), { w: 100, h: 200 });
});

test('applyOrientation: unknown orientation -> portrait; non-positive base falls back to A4', () => {
  assert.deepEqual(applyOrientation({ w: 200, h: 100 }, 'sideways'), { w: 100, h: 200 });
  assert.deepEqual(applyOrientation({ w: 0, h: 0 }, 'portrait'), { w: 595.276, h: 841.890 });
  assert.deepEqual(applyOrientation({ w: 0, h: 0 }, 'landscape'), { w: 841.890, h: 595.276 });
});

// ------------------------------------------------------------ orientedPageSize
test('orientedPageSize: named sizes + orientation', () => {
  assert.deepEqual(orientedPageSize({ pageSize: 'letter', orientation: 'portrait' }), { w: 612, h: 792 });
  assert.deepEqual(orientedPageSize({ pageSize: 'letter', orientation: 'landscape' }), { w: 792, h: 612 });
  assert.deepEqual(orientedPageSize({ pageSize: 'a3', orientation: 'portrait' }), { w: 841.890, h: 1190.551 });
  assert.deepEqual(orientedPageSize({ pageSize: 'legal', orientation: 'auto', imgW: 9, imgH: 3 }), { w: 1008, h: 612 });
});

test('orientedPageSize: unknown size -> A4; default orientation is auto', () => {
  assert.deepEqual(orientedPageSize({ pageSize: 'nope', orientation: 'portrait' }), { w: 595.276, h: 841.890 });
  assert.deepEqual(orientedPageSize({ pageSize: 'a4', imgW: 10, imgH: 1 }), { w: 841.890, h: 595.276 });
});

test('orientedPageSize: fit = image px + 2*margin; custom uses customWpt/HPt', () => {
  assert.deepEqual(orientedPageSize({ pageSize: 'fit', imgW: 100, imgH: 50, marginPt: 10 }), { w: 120, h: 70 });
  assert.deepEqual(orientedPageSize({ pageSize: 'custom', orientation: 'portrait', customWpt: 300, customHpt: 200 }), { w: 200, h: 300 });
  assert.deepEqual(orientedPageSize({ pageSize: 'custom', orientation: 'landscape', customWpt: 200, customHpt: 300 }), { w: 300, h: 200 });
});

// ------------------------------------------------------------ computePlacement
test('computePlacement: contain (default) letterboxes and centres', () => {
  // page 200x100, image 100x100 -> scale=min(2,1)=1 -> 100x100, x=(200-100)/2=50, y=0
  const r = computePlacement({ pageW: 200, pageH: 100, imgW: 100, imgH: 100 });
  assert.deepEqual(r, { x: 50, y: 0, w: 100, h: 100, clip: { x: 0, y: 0, w: 200, h: 100 } });
});

test('computePlacement: cover scales to fill and overflows (negative offset), clip = content box', () => {
  // scale=max(2,1)=2 -> 200x200, x=0, y=(100-200)/2=-50
  const r = computePlacement({ pageW: 200, pageH: 100, imgW: 100, imgH: 100, fitMode: 'cover' });
  assert.deepEqual(r, { x: 0, y: -50, w: 200, h: 200, clip: { x: 0, y: 0, w: 200, h: 100 } });
});

test('computePlacement: actual keeps pixel size (1px = 1pt), centred', () => {
  // 50x20 on 200x100 -> x=75, y=40
  const r = computePlacement({ pageW: 200, pageH: 100, imgW: 50, imgH: 20, fitMode: 'actual' });
  assert.deepEqual(r, { x: 75, y: 40, w: 50, h: 20, clip: { x: 0, y: 0, w: 200, h: 100 } });
});

test('computePlacement: margin shrinks the content box (and offsets it)', () => {
  // box 180x80 at (10,10); image 180x80 contain -> scale 1, fills box
  const r = computePlacement({ pageW: 200, pageH: 100, imgW: 180, imgH: 80, margin: 10 });
  assert.deepEqual(r, { x: 10, y: 10, w: 180, h: 80, clip: { x: 10, y: 10, w: 180, h: 80 } });
});

test('computePlacement: degenerate inputs (zero image dims -> 1; huge margin -> 1x1 box)', () => {
  const z = computePlacement({ pageW: 10, pageH: 10, imgW: 0, imgH: 0 });
  assert.deepEqual(z, { x: 0, y: 0, w: 10, h: 10, clip: { x: 0, y: 0, w: 10, h: 10 } });
  const m = computePlacement({ pageW: 10, pageH: 10, imgW: 5, imgH: 5, margin: 20 });
  assert.deepEqual(m.clip, { x: 20, y: 20, w: 1, h: 1 });
});

// ------------------------------------------------------------ buildContentStream
test('buildContentStream: clip + cm + Do, exact text', () => {
  const s = buildContentStream({ x: 1, y: 2, w: 3, h: 4, clip: { x: 5, y: 6, w: 7, h: 8 } });
  assert.equal(s, 'q\n5 6 7 8 re W n\n3 0 0 4 1 2 cm\n/Im0 Do\nQ');
});

test('buildContentStream: no clip -> no re/W/n line', () => {
  assert.equal(buildContentStream({ x: 0, y: 0, w: 10, h: 20 }), 'q\n10 0 0 20 0 0 cm\n/Im0 Do\nQ');
});

// ------------------------------------------------------------ planPages
test('planPages: empty/undefined -> []', () => {
  assert.deepEqual(planPages([], {}), []);
  assert.deepEqual(planPages(undefined, {}), []);
});

test('planPages: fit mode -> page = image, placement fills it at the margin', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const [pg] = planPages([{ jpegBytes: bytes, width: 100, height: 50 }], { pageSize: 'fit', marginMm: 0 });
  assert.equal(pg.pageWidth, 100);
  assert.equal(pg.pageHeight, 50);
  assert.equal(pg.image.bytes, bytes);
  assert.deepEqual(
    { w: pg.image.width, h: pg.image.height, x: pg.image.x, y: pg.image.y, pw: pg.image.w, ph: pg.image.h, clip: pg.image.clip },
    { w: 100, h: 50, x: 0, y: 0, pw: 100, ph: 50, clip: { x: 0, y: 0, w: 100, h: 50 } });
});

test('planPages: A4 landscape contain with 10mm margin (hand-computed geometry)', () => {
  // image 100x50 -> auto => landscape A4 841.89 x 595.276 ; margin = 10*72/25.4 = 28.346456...
  // box = 841.89-56.692913.. x 595.276-56.692913.. = 785.197086.. x 538.583086..
  // scale = min(7.85197.., 10.7716..) = 7.851970866 -> w=785.197086, h=392.598543
  const [pg] = planPages([{ jpegBytes: new Uint8Array(1), width: 100, height: 50 }],
    { pageSize: 'a4', orientation: 'auto', marginMm: 10, fitMode: 'contain' });
  near(pg.pageWidth, 841.89);
  near(pg.pageHeight, 595.276);
  const m = 10 * 72 / 25.4;
  const boxW = 841.89 - 2 * m, boxH = 595.276 - 2 * m;
  near(pg.image.w, boxW);
  near(pg.image.h, boxW / 2);
  near(pg.image.x, m);
  near(pg.image.y, m + (boxH - boxW / 2) / 2);
  near(pg.image.clip.w, boxW);
  near(pg.image.clip.h, boxH);
});

test('planPages: multiple images -> one page each, in order', () => {
  const pages = planPages([
    { jpegBytes: new Uint8Array(1), width: 10, height: 20 },
    { jpegBytes: new Uint8Array(2), width: 30, height: 10 },
  ], { pageSize: 'letter', orientation: 'auto', marginMm: 0 });
  assert.equal(pages.length, 2);
  assert.deepEqual([pages[0].pageWidth, pages[0].pageHeight], [612, 792]);
  assert.deepEqual([pages[1].pageWidth, pages[1].pageHeight], [792, 612]);
  assert.equal(pages[1].image.bytes.length, 2);
});

// ------------------------------------------------------------ PDF structure (hand-written layout)
// Fixed input: one image 100x50, bytes FF D8 FF D9, pageSize 'fit', margin 0, title 'T(x)'.
// Page = 100x50 pt. Content stream (hand-built) = "q\n0 0 100 50 re W n\n100 0 0 50 0 0 cm\n/Im0 Do\nQ" (47 bytes).
const IMG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const FIXED_OPTS = { pageSize: 'fit', marginMm: 0, title: 'T(x)' };
const CONTENT = 'q\n0 0 100 50 re W n\n100 0 0 50 0 0 cm\n/Im0 Do\nQ';

// Expected file as an ordered list of [objNum | null, bytes-as-latin1-string] pieces.
function expectedPdf() {
  const parts = [];
  const push = (s) => parts.push(s);
  const offs = {};
  let len = 0;
  const add = (s, objNum) => { if (objNum) offs[objNum] = len; push(s); len += s.length; };
  add('%PDF-1.4\n');
  add('%âãÏÓ\n');
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 1);
  add('2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n', 2);
  add('3 0 obj\n<< /Producer (images-to-pdf) /Title (T\\(x\\)) >>\nendobj\n', 3);
  add('4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 50] /Resources << /XObject << /Im0 6 0 R >> >> /Contents 5 0 R >>\nendobj\n', 4);
  add('5 0 obj\n<< /Length 47 >>\nstream\n' + CONTENT + '\nendstream\nendobj\n', 5);
  add('6 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 50 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\n' +
      latin1(IMG) + '\nendstream\nendobj\n', 6);
  const xrefAt = len;
  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (let n = 1; n <= 6; n++) xref += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
  add(xref);
  add('trailer\n<< /Size 7 /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');
  return { text: parts.join(''), offs, xrefAt, len };
}

test('buildPdf(fit, 1 image): matches the hand-written byte layout exactly', () => {
  assert.equal(CONTENT.length, 47); // sanity-check the hand count
  const exp = expectedPdf();
  const out = buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }], FIXED_OPTS);
  assert.ok(out instanceof Uint8Array);
  assert.equal(out.length, exp.len);
  assert.equal(latin1(out), exp.text);
});

test('buildPdf: structural markers (header, binary comment, EOF, xref, object count, MediaBox, image stream)', () => {
  const out = buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }], FIXED_OPTS);
  const txt = latin1(out);
  assert.ok(txt.startsWith('%PDF-1.4\n'));
  assert.deepEqual(Array.from(out.slice(9, 15)), [0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]); // binary marker comment
  assert.ok(txt.endsWith('%%EOF\n'));
  assert.equal((txt.match(/ 0 obj\n/g) || []).length, 6);   // 3 + 3*N objects
  assert.equal((txt.match(/endobj\n/g) || []).length, 6);
  assert.equal((txt.match(/\nxref\n/g) || []).length, 1);
  assert.ok(txt.includes('xref\n0 7\n0000000000 65535 f \n'));
  assert.ok(txt.includes('/Size 7 /Root 1 0 R /Info 3 0 R'));
  assert.ok(txt.includes('/MediaBox [0 0 100 50]'));
  assert.ok(txt.includes('/Filter /DCTDecode'));
  assert.ok(txt.includes('/Type /Catalog /Pages 2 0 R'));
  assert.ok(txt.includes('/Kids [4 0 R] /Count 1'));
  // the embedded image stream: raw JPEG bytes bracketed by stream/endstream
  const marker = strToBytes('/Length 4 >>\nstream\n');
  const at = latin1(out).indexOf('/Length 4 >>\nstream\n') + marker.length;
  assert.deepEqual(Array.from(out.slice(at, at + 4)), [0xff, 0xd8, 0xff, 0xd9]);
  assert.equal(txt.slice(at + 4, at + 4 + 18), '\nendstream\nendobj\n');
});

test('buildPdf: xref entries are 20 bytes and each offset points at "N 0 obj"', () => {
  const out = buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }], FIXED_OPTS);
  const txt = latin1(out);
  const xrefAt = Number(txt.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(txt.slice(xrefAt, xrefAt + 5), 'xref\n');
  const entries = txt.slice(xrefAt + 'xref\n0 7\n'.length, txt.indexOf('trailer'));
  assert.equal(entries.length, 7 * 20);
  for (let n = 0; n < 7; n++) {
    const e = entries.slice(n * 20, n * 20 + 20);
    assert.match(e, /^\d{10} \d{5} [nf] \n$/);
    if (n === 0) { assert.equal(e, '0000000000 65535 f \n'); continue; }
    const off = Number(e.slice(0, 10));
    assert.ok(txt.startsWith(n + ' 0 obj\n', off), 'obj ' + n + ' at ' + off);
  }
});

test('buildPdf: content-stream /Length matches its actual byte length', () => {
  const txt = latin1(buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }], FIXED_OPTS));
  const m = txt.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
  assert.equal(Number(m[1]), m[2].length);
  assert.equal(m[2], CONTENT);
});

test('buildPdf: byte-for-byte deterministic (two calls identical) + exact length', () => {
  const imgs = [{ jpegBytes: IMG, width: 100, height: 50 }];
  const a = buildPdf(imgs, FIXED_OPTS);
  const b = buildPdf(imgs, FIXED_OPTS);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.equal(a.length, expectedPdf().len);
});

test('buildPdf: no title -> Info has only /Producer; empty image list -> valid 0-page PDF', () => {
  const t = latin1(buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }], { pageSize: 'fit', marginMm: 0 }));
  assert.ok(t.includes('3 0 obj\n<< /Producer (images-to-pdf) >>\nendobj\n'));
  const e = latin1(buildPdf([], {}));
  assert.ok(e.includes('/Kids [] /Count 0'));
  assert.ok(e.includes('xref\n0 4\n0000000000 65535 f \n'));
  assert.ok(e.includes('/Size 4'));
  assert.equal((e.match(/ 0 obj\n/g) || []).length, 3);
  assert.ok(e.endsWith('%%EOF\n'));
});

test('buildPdf: 2 images -> 9 objects, page objs 4/7, xref count 10, Kids [4 0 R 7 0 R]', () => {
  const t = latin1(buildPdf([
    { jpegBytes: IMG, width: 100, height: 50 },
    { jpegBytes: new Uint8Array([1, 2, 3, 4, 5]), width: 8, height: 8 },
  ], { pageSize: 'fit', marginMm: 0 }));
  assert.equal((t.match(/ 0 obj\n/g) || []).length, 9);
  assert.ok(t.includes('/Kids [4 0 R 7 0 R] /Count 2'));
  assert.ok(t.includes('xref\n0 10\n'));
  assert.ok(t.includes('/Size 10'));
  assert.ok(t.includes('/MediaBox [0 0 8 8]'));
  assert.ok(t.includes('/Width 8 /Height 8'));
  assert.ok(t.includes('/Length 5 >>\nstream\n\u0001\u0002\u0003\u0004\u0005\nendstream'));
});

test('buildPdf defaults: A4 / auto / 10mm margin / contain (MediaBox + exact content stream)', () => {
  // image 100x50 -> landscape A4: MediaBox [0 0 841.89 595.276]
  // margin m=28.34645669 -> pdfNumber 28.3465 ; boxW=785.19708662, boxH=538.58308662
  // w = boxW (785.1971), h = boxW/2 = 392.59854331 (392.5985); x = m (28.3465);
  // y = m + (boxH - h)/2 = 28.34645669 + 72.99227166 = 101.33872835 (101.3387)
  const t = latin1(buildPdf([{ jpegBytes: IMG, width: 100, height: 50 }]));
  assert.ok(t.includes('/MediaBox [0 0 841.89 595.276]'));
  assert.ok(t.includes('q\n28.3465 28.3465 785.1971 538.5831 re W n\n785.1971 0 0 392.5985 28.3465 101.3387 cm\n/Im0 Do\nQ'));
});

test('assemblePdf: takes planned pages directly; matches buildPdf for the same plan', () => {
  const imgs = [{ jpegBytes: IMG, width: 100, height: 50 }];
  const pages = planPages(imgs, FIXED_OPTS);
  const viaAssemble = assemblePdf(pages, { title: 'T(x)' });
  assert.deepEqual(Array.from(viaAssemble), Array.from(buildPdf(imgs, FIXED_OPTS)));
  assert.equal(latin1(assemblePdf([], undefined)).includes('/Count 0'), true);
});
