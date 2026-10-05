import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const L = await loadLogic();

test('every Code 128 pattern is 11 modules (stop 13) and starts with a bar', () => {
  assert.equal(L.CODE128_PATTERNS.length, 107);
  L.CODE128_PATTERNS.forEach((p, i) => {
    assert.equal(p.length, i === 106 ? 13 : 11, 'pattern ' + i);
    assert.equal(p[0], '1');
  });
  assert.equal(L.CODE128_PATTERNS[0], '11011001100');
  assert.equal(L.CODE128_PATTERNS[103], '11010000100');
  assert.equal(L.CODE128_PATTERNS[104], '11010010000');
  assert.equal(L.CODE128_PATTERNS[105], '11010011100');
  assert.equal(L.CODE128_PATTERNS[106], '1100011101011');
});

test('Code 128 vectors: PJJ123C, Hello, 123456, 12345678', () => {
  const a = L.encodeCode128('PJJ123C');
  assert.deepEqual(a.values.slice(0, 8), [104, 48, 42, 42, 17, 18, 19, 35]);
  assert.equal(a.checkDigit, '55');
  assert.equal(a.modules.length, 112);
  assert.equal(L.encodeCode128('Hello').checkDigit, '76');
  const c = L.encodeCode128('123456');
  assert.deepEqual(c.values.slice(0, 4), [105, 12, 34, 56]);
  assert.equal(c.checkDigit, '44');
  const d = L.encodeCode128('12345678');
  assert.deepEqual(d.values.slice(0, 5), [105, 12, 34, 56, 78]);
  assert.equal(d.checkDigit, '47');
  assert.equal(d.modules, '1101001110010110011100100010110001110001011011000010100100011101101100011101011');
});

test('EAN-13 vectors', () => {
  const e = L.encodeEan13('590123412345');
  assert.equal(e.checkDigit, '7');
  assert.equal(e.text, '5901234123457');
  assert.equal(e.modules, '10100010111011000100110000100110111101110001001010110011011011001000010101110010011101000100101');
  assert.equal(e.modules.length, 95);
  assert.equal(L.encodeEan13('400638133393').checkDigit, '1');
  assert.equal(L.encodeEan13('5901234123457').error, '');
});

test('UPC-A vectors and EAN-13 equivalence', () => {
  const u = L.encodeUpcA('036000291452');
  assert.equal(u.error, '');
  assert.equal(u.modules, '10100011010111101010111100011010001101000110101010110110011101001100110101110010011101101100101');
  assert.equal(u.modules, L.encodeEan13('0036000291452').modules);
  assert.equal(L.encodeUpcA('03600029145').checkDigit, '2');
  assert.equal(L.encodeUpcA('04210000526').checkDigit, '4');
  assert.equal(L.eanCheckDigit('03600029145'), 2);
  assert.equal(L.eanCheckDigit('590123412345'), 7);
});

test('Code 39 structure, vectors and mod-43 check', () => {
  const a = L.encodeCode39('A');
  assert.equal(a.modules.length, 47);
  const p = (ch) => L.code39Modules(ch);
  assert.equal(a.modules, p('*') + '0' + p('A') + '0' + p('*'));
  for (const s of ['A', 'HELLO', 'A-B.C $/+%', 'CODE39']) {
    const n = s.length;
    assert.equal(L.encodeCode39(s).modules.length, 15 * (n + 2) + (n + 1), s);
  }
  assert.equal(L.encodeCode39('code39').text, 'CODE39');
  const c = L.encodeCode39('CODE39', { check: true });
  assert.equal(c.checkDigit, 'W');
  assert.equal(c.text, 'CODE39W');
  assert.equal(L.encodeCode39('A', { star: true }).text, '*A*');
});

test('Code 128 auto mode: decode-and-reverify round trips', () => {
  const inputs = ['ABC12345678', '12345', '1234a', 'a1234', '1234', '12', '123', 'ab12cd', 'a12345b', 'a1234567b', 'x123456y789', '\tTab\u0001abc', 'ABC\u0001def', 'Hello, World! ~ DEL', '99', '00001234abc5678'];
  for (const s of inputs) {
    const e = L.encodeCode128(s);
    assert.equal(e.error, '', s);
    const data = e.values.slice(0, -1);
    assert.equal(L.decodeCode128Values(data), s, 'round trip ' + JSON.stringify(s));
    assert.equal(L.code128Checksum(data), Number(e.checkDigit), 'checksum ' + s);
    assert.equal(e.values[e.values.length - 1], Number(e.checkDigit));
    assert.equal(e.modules.length, 11 * (data.length + 1) + 13);
  }
});

test('Code 128 mode selection', () => {
  assert.equal(L.encodeCode128('12345678').values[0], 105);
  assert.equal(L.encodeCode128('ABC').values[0], 104);
  assert.equal(L.encodeCode128('\u0001AB').values[0], 103);
  assert.equal(L.encodeCode128('12').values[0], 105);
  assert.equal(L.encodeCode128('1234a').values[0], 105);
  assert.equal(L.encodeCode128('123a').values[0], 104);
  assert.ok(L.encodeCode128('ABC12345678').values.includes(99));
  assert.ok(!L.encodeCode128('ABC123x').values.includes(99));
});

test('validation: messages, never exceptions', () => {
  for (const [fn, bad] of [
    [L.encodeCode128, ''], [L.encodeCode128, 'café'], [L.encodeCode128, 'x'.repeat(500)],
    [L.encodeEan13, ''], [L.encodeEan13, '12345'], [L.encodeEan13, '59012341234a'], [L.encodeEan13, '5901234123458'],
    [L.encodeUpcA, ''], [L.encodeUpcA, '0360002914'], [L.encodeUpcA, '036000291453'],
    [L.encodeCode39, ''], [L.encodeCode39, 'A*B'], [L.encodeCode39, 'a_b'],
  ]) {
    const e = fn(bad);
    assert.ok(e.error.length > 0, JSON.stringify(bad));
    assert.equal(e.modules, '');
  }
  assert.match(L.encodeEan13('5901234123458').error, /expected 7/);
  for (const v of [null, undefined, 5, {}]) { assert.doesNotThrow(() => L.encode('ean13', v)); assert.doesNotThrow(() => L.encode('code128', v)); }
  assert.equal(L.toSvg(L.encodeEan13('1'), {}), '');
});

test('layout and SVG: quiet zones, single path, crispEdges, same geometry', () => {
  const e = L.encodeEan13('590123412345');
  const g = L.layout(e, { scale: 3, height: 50 });
  assert.equal(g.quietL, 11);
  assert.equal(g.quietR, 7);
  assert.equal(g.W, 11 + 95 + 7);
  assert.equal(g.H, 50 + L.TEXT_BAND);
  assert.equal(L.layout(L.encodeCode128('abc'), {}).quietL, 10);
  assert.equal(L.layout(e, { quietLeft: 20, quietRight: 0 }).W, 20 + 95);
  const svg = L.toSvg(e, { scale: 3, height: 50 });
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.equal((svg.match(/<rect /g) || []).length, 1);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, new RegExp('viewBox="0 0 ' + g.W + ' ' + g.H + '"'));
  assert.match(svg, new RegExp('width="' + g.W * 3 + '"'));
  // path bars reconstruct the module string
  const recon = new Array(g.W).fill('0');
  for (const r of g.runs) for (let i = 0; i < r.w; i++) recon[r.x + i] = '1';
  assert.equal(recon.join(''), '0'.repeat(11) + e.modules + '0'.repeat(7));
  assert.equal((L.toSvg(e, { showText: false }).match(/<text/g) || []).length, 0);
  assert.equal((svg.match(/<text/g) || []).length, 3);
});

test('SVG text is escaped and colors are sanitized', () => {
  const svg = L.toSvg(L.encodeCode128('<&>"x'), { fg: 'red"/><script>', bg: '#abc' });
  assert.ok(!svg.includes('<script'));
  assert.match(svg, /&lt;&amp;&gt;/);
  assert.match(svg, /fill="#000000"/);
  assert.match(svg, /fill="#aabbcc"/);
});

test('contrast warning', () => {
  assert.equal(L.contrastWarning('#000000', '#ffffff'), '');
  assert.match(L.contrastWarning('#ffffff', '#000000'), /inverted/);
  assert.match(L.contrastWarning('#888888', '#999999'), /Low contrast/);
  assert.ok(L.contrastRatio('#000000', '#ffffff') > 20.9);
});
