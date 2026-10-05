// Unit tests for the serializers: rgbToAnsi256, cellsToText, cellsToHtml
// (coalesced color spans), cellsToAnsi (ESC sequences + per-line reset), and
// htmlDocument. Dev/test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic, ESC, ANSI_RESET } from './_helpers.mjs';

const {
  rgbToAnsi256, cellsToText, cellsToHtml, cellsToAnsi, htmlDocument,
} = await loadLogic();

// Helper: a cell.
const c = (ch, fg = null, bg = null) => ({ ch, fg, bg });

test('rgbToAnsi256 maps black -> 16 and white -> 231 (grayscale endpoints)', () => {
  assert.equal(rgbToAnsi256(0, 0, 0), 16);
  assert.equal(rgbToAnsi256(255, 255, 255), 231);
});

test('rgbToAnsi256 maps neutral grays into the 232..255 ramp', () => {
  const mid = rgbToAnsi256(128, 128, 128);
  assert.ok(mid >= 232 && mid <= 255, `expected grayscale ramp, got ${mid}`);
});

test('rgbToAnsi256 maps a saturated color into the 16..231 color cube', () => {
  const red = rgbToAnsi256(255, 0, 0);
  assert.ok(red >= 16 && red <= 231);
  assert.equal(red, 16 + 36 * 5 + 6 * 0 + 0); // q(255)=5, q(0)=0 -> 196
  assert.equal(red, 196);
});

test('cellsToText joins chars per row and newlines between rows', () => {
  const rows = [[c('a'), c('b')], [c('c'), c('d')]];
  assert.equal(cellsToText(rows), 'ab\ncd');
});

test('cellsToHtml coalesces consecutive cells that share fg+bg into one span', () => {
  const fg = { r: 1, g: 2, b: 3 };
  const rows = [[c('a', fg), c('b', fg), c('c', { r: 9, g: 9, b: 9 })]];
  const html = cellsToHtml(rows);
  // Two spans: {a,b} share fg -> "ab"; c differs -> its own span.
  const spans = html.match(/<span /g) || [];
  assert.equal(spans.length, 2);
  assert.match(html, /<span style="color:#010203">ab<\/span>/);
  assert.match(html, /<span style="color:#090909">c<\/span>/);
});

test('cellsToHtml emits bg color and escapes HTML metacharacters', () => {
  const rows = [[c('<', { r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 })]];
  const html = cellsToHtml(rows);
  assert.match(html, /color:#ff0000/);
  assert.match(html, /background:#0000ff/);
  // The '<' cell char is escaped to &lt; inside the span (not left raw).
  assert.match(html, /<span [^>]*>&lt;<\/span>/);
});

test('cellsToHtml with no colors emits plain text (no spans) inside the <pre>', () => {
  const rows = [[c('x'), c('y')]];
  const html = cellsToHtml(rows);
  assert.doesNotMatch(html, /<span/);
  assert.match(html, /xy<\/pre>/);
});

test('cellsToAnsi wraps colored cells in ESC sequences and resets each line', () => {
  const rows = [[c('X', { r: 0, g: 0, b: 0 })]];
  const out = cellsToAnsi(rows, { ansiDepth: '256' });
  assert.ok(out.includes(ESC), 'output should contain the ESC byte');
  assert.equal(out, `${ESC}[38;5;16mX${ANSI_RESET}`);
  assert.ok(out.endsWith(ANSI_RESET), 'each line ends with a reset');
});

test('cellsToAnsi truecolor emits 24-bit fg/bg sequences', () => {
  const rows = [[c('▀', { r: 10, g: 20, b: 30 }, { r: 40, g: 50, b: 60 })]];
  const out = cellsToAnsi(rows, { ansiDepth: 'truecolor' });
  assert.match(out, /\[38;2;10;20;30m/);
  assert.match(out, /\[48;2;40;50;60m/);
  assert.ok(out.endsWith(ANSI_RESET));
});

test('cellsToAnsi coalesces a run of same-color cells (one fg sequence)', () => {
  const fg = { r: 0, g: 0, b: 0 };
  const rows = [[c('a', fg), c('b', fg), c('c', fg)]];
  const out = cellsToAnsi(rows, { ansiDepth: '256' });
  const fgSeqs = out.match(/\[38;5;\d+m/g) || [];
  assert.equal(fgSeqs.length, 1, 'a same-color run emits one fg escape');
  assert.match(out, /abc/);
});

test('cellsToAnsi emits bare chars for uncolored cells and still resets', () => {
  const rows = [[c('a'), c('b')]];
  const out = cellsToAnsi(rows, {});
  assert.equal(out, `ab${ANSI_RESET}`);
});

test('htmlDocument wraps the pre in a full standalone document', () => {
  const rows = [[c('#', { r: 255, g: 255, b: 255 })]];
  const doc = htmlDocument(rows, { background: '#123456' });
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /<html lang="en">/);
  assert.match(doc, /<pre /);
  assert.match(doc, /background:#123456/);
  assert.match(doc, /<\/html>/);
});
