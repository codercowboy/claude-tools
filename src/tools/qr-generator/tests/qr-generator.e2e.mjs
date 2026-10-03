// @playwright/test spec for tools/qr-generator/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package, @playwright/test, jsqr, qrcode, or pngjs in
// any way — this spec drives the finished page from the outside via
// data-testid hooks and the window.__qr test API described in DESIGN.md
// (Testability) and PLAN.md (§11).
//
// THE AUTHORITATIVE CORRECTNESS GATE is the round-trip decode: render a QR
// with the tool's hand-rolled encoder, extract the rendered canvas as a real
// PNG, and decode it with an INDEPENDENT decoder (jsQR) — asserting the
// decoded text equals the original input. Everything else here is secondary.
//
// A note on jsQR's own limitations: jsQR (like some other real-world
// scanners) is known to fail to decode certain reference-correct QR codes at
// specific exact-capacity (version, EC level) combinations — e.g. version
// 23-L — independent of which encoder produced them. So when our own decode
// fails, `roundTrip()` below cross-checks an independently-generated
// reference QR (npm `qrcode` package, forced to the SAME text/version/EC,
// byte mode only) through the SAME jsQR decoder before concluding anything.
// If the reference ALSO fails, it's a documented jsQR decoder limitation,
// not an encoder bug, and the test does not fail on it (the limitation is
// still recorded as a test annotation, and console-logged, so it's visible
// in the run output). If the reference decodes fine but ours doesn't, that's
// a real encoder bug and the test fails loudly with the details a fixer
// needs (text length, version, EC level, mask, our raw decode result).
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/qr-generator/)

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_URL = toolUrl(import.meta.url);
const INDEX_HTML_SOURCE = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const HELP_SEEN_KEY = helpSeenKey('qr-generator');

test.beforeEach(async ({ page }) => {
  // Pre-seed the Help-modal "seen" flag so the auto-show-on-first-load
  // behavior (docs/conventions.md "First-load help popup") doesn't steal
  // focus/interfere with every other test in this file. The dedicated
  // "First-load Help popup" describe block below tests the fresh-visit
  // auto-show path itself, using its own from-scratch browser.newContext()
  // (so this pre-seed init script is never registered on it).
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// Shared decode helpers.
// ---------------------------------------------------------------------------

function decodePngBuffer(buf) {
  const png = PNG.sync.read(buf);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
}

// Independent (test-side, not index.html's) CRC-32 implementation, used only
// to verify the PNG tEXt chunks the tool injects have a spec-correct CRC —
// a from-scratch reference to cross-check index.html's own hand-rolled
// implementation against, not a copy of it.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Reads the tool's own rendered <canvas data-testid="qr-canvas"> as a real
// PNG (round-tripping through actual PNG encode/decode, exactly like a
// downloaded file would) and decodes it with jsQR.
async function decodeOwnCanvas(page) {
  const base64 = await page.getByTestId('qr-canvas').evaluate((c) => c.toDataURL('image/png').split(',')[1]);
  return decodePngBuffer(Buffer.from(base64, 'base64'));
}

// Generates an INDEPENDENT reference QR for the same text/version/EC level
// (byte mode forced, to match this tool's byte-mode-only encoder) using the
// npm `qrcode` package, and decodes it with the SAME jsQR decoder. Used only
// to triage a jsQR decode failure: is it a decoder limitation (reference
// also fails) or a real encoder bug (reference decodes fine)?
async function decodeReference(text, ecLevel, version) {
  const dataUrl = await QRCode.toDataURL([{ data: text, mode: 'byte' }], {
    errorCorrectionLevel: ecLevel,
    version,
    margin: 4,
    scale: 4,
  });
  const base64 = dataUrl.split(',')[1];
  return decodePngBuffer(Buffer.from(base64, 'base64'));
}

// Drives the real UI (types the input, picks the EC level), waits for a real
// render, extracts the tool's own canvas as a PNG, decodes it with jsQR, and
// triages any decode failure against an independent reference encoder. See
// file header for the full rationale.
async function roundTrip(page, testInfo, text, ecLevel) {
  await page.getByTestId('qr-input').fill(text);
  await page.getByTestId('ec-level-select').selectOption(ecLevel);
  await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);

  const matrix = await page.evaluate(() => window.__qr.currentMatrix);
  expect(matrix, 'window.__qr.currentMatrix should be populated after a successful render').not.toBeNull();
  expect(matrix.size, 'matrix size must equal 17 + 4*version').toBe(17 + 4 * matrix.version);

  // Version auto-selection sanity: the version the UI actually rendered must
  // match what selectVersion() independently computes for this exact byte
  // length/EC level (self-consistency of the "smallest version that fits"
  // contract).
  const selfCheck = await page.evaluate(
    ({ text, ecLevel }) => {
      const byteLength = window.__qr.utf8Bytes(text).length;
      return { byteLength, expectedVersion: window.__qr.selectVersion(byteLength, ecLevel) };
    },
    { text, ecLevel },
  );
  expect(matrix.version, 'rendered version must match selectVersion()\'s independent computation').toBe(
    selfCheck.expectedVersion,
  );

  const ownResult = await decodeOwnCanvas(page);
  if (ownResult && ownResult.data === text) {
    return { matrix, decoded: true, limitation: false };
  }

  // Our decode failed or mismatched. Cross-check against an independently
  // generated reference QR of the SAME text/version/EC level through the
  // SAME jsQR decoder.
  let refResult = null;
  let refError = null;
  try {
    refResult = await decodeReference(text, ecLevel, matrix.version);
  } catch (err) {
    refError = err;
  }

  if (!refResult || refResult.data !== text) {
    const note =
      `jsQR decoder limitation (not an encoder bug): text length=${text.length} bytes=${selfCheck.byteLength} ` +
      `ecLevel=${ecLevel} version=${matrix.version} mask=${matrix.mask}. Our decode ${ownResult ? 'mismatched' : 'found no code'}` +
      `, AND an independently-generated reference QR (npm 'qrcode' package, byte mode, same text/version/EC) ` +
      `ALSO fails to decode via jsQR (${refError ? 'reference generation threw: ' + refError.message : 'reference decode did not match either'}).`;
    testInfo.annotations.push({ type: 'jsQR-decoder-limitation', description: note });
    // eslint-disable-next-line no-console
    console.warn('[jsQR limitation]', note);
    return { matrix, decoded: false, limitation: true };
  }

  // Reference decodes fine on the SAME jsQR decoder but ours doesn't -> real
  // encoder bug. Fail loudly with everything a fixer needs.
  throw new Error(
    `REAL ENCODER BUG (not a jsQR limitation): round-trip decode failed for our encoder, but an independently-` +
      `generated reference QR (npm 'qrcode' package, byte mode) for the SAME text (length=${text.length}, ` +
      `${selfCheck.byteLength} bytes) at version ${matrix.version}, EC level ${ecLevel} decodes correctly via the ` +
      `SAME jsQR decoder. Our decoded result: ${ownResult ? JSON.stringify(ownResult.data) : 'null (no QR code found in our render)'}. ` +
      `mask=${matrix.mask}. Input (first 200 chars): ${JSON.stringify(text.slice(0, 200))}`,
  );
}

async function setColorInput(page, testId, hex) {
  await page.getByTestId(testId).evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
}

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et ' +
  'dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ' +
  'ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu ' +
  'fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt ' +
  'mollit anim id est laborum.';

const UNICODE_TEXT = 'Héllo Wörld — 世界 🎉🚀 café ☕ naïve résumé';
const URL_TEXT = 'https://github.com/codercowboy/claude-tools/tools/qr-generator';
const SHORT_TEXT = 'HELLO WORLD';

// ===========================================================================
// 1. encodeToMatrix — pure API shape + known vectors.
// ===========================================================================
test.describe('encodeToMatrix — shape & known vectors', () => {
  test('returns {version, mask, size, modules} with size = 17 + 4*version', async ({ page }) => {
    const result = await page.evaluate(() => window.__qr.encodeToMatrix('HELLO WORLD', 'M'));
    expect(result.size).toBe(17 + 4 * result.version);
    expect(Number.isInteger(result.mask)).toBe(true);
    expect(result.mask).toBeGreaterThanOrEqual(0);
    expect(result.mask).toBeLessThanOrEqual(7);
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.modules.length).toBe(result.size);
    expect(result.modules.every((row) => row.length === result.size)).toBe(true);
  });

  // Published ISO/IEC 18004 byte-mode capacity boundaries (independent of
  // this tool's own tables — well-known spec values, also referenced in
  // index.html's own derivation comments as verified spot-checks).
  test('known capacity boundaries: V1-L=17 bytes, V1-M=14 bytes', async ({ page }) => {
    const out = await page.evaluate(() => {
      const v = (n, ec) => window.__qr.encodeToMatrix('A'.repeat(n), ec).version;
      return { v1L17: v(17, 'L'), v1L18: v(18, 'L'), v1M14: v(14, 'M'), v1M15: v(15, 'M') };
    });
    expect(out.v1L17).toBe(1);
    expect(out.v1L18).toBe(2);
    expect(out.v1M14).toBe(1);
    expect(out.v1M15).toBe(2);
  });

  test('known capacity boundaries: V40-H max=1273 bytes, V40-L max=2953 bytes', async ({ page }) => {
    const out = await page.evaluate(() => {
      const v = (n, ec) => window.__qr.encodeToMatrix('A'.repeat(n), ec).version;
      return { v40H: v(1273, 'H'), v40L: v(2953, 'L') };
    });
    expect(out.v40H).toBe(40);
    expect(out.v40L).toBe(40);
  });

  test('capacity-overflow past V40 throws a clear Error, not a crash', async ({ page }) => {
    const out = await page.evaluate(() => {
      const attempts = {};
      try {
        window.__qr.encodeToMatrix('A'.repeat(1274), 'H'); // 1 byte past V40-H max
        attempts.h1274 = { threw: false };
      } catch (e) {
        attempts.h1274 = { threw: true, message: e.message };
      }
      try {
        window.__qr.encodeToMatrix('A'.repeat(2954), 'L'); // 1 byte past V40-L max
        attempts.l2954 = { threw: false };
      } catch (e) {
        attempts.l2954 = { threw: true, message: e.message };
      }
      try {
        window.__qr.encodeToMatrix('x'.repeat(5000), 'H'); // grossly oversized
        attempts.grossly = { threw: false };
      } catch (e) {
        attempts.grossly = { threw: true, message: e.message };
      }
      return attempts;
    });
    expect(out.h1274.threw).toBe(true);
    expect(out.h1274.message.length).toBeGreaterThan(0);
    expect(out.l2954.threw).toBe(true);
    expect(out.grossly.threw).toBe(true);
    expect(out.grossly.message).toMatch(/too large|exceeds|capacity/i);
  });

  test('empty input throws a clear error', async ({ page }) => {
    const out = await page.evaluate(() => {
      try {
        window.__qr.encodeToMatrix('', 'M');
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    });
    expect(out.threw).toBe(true);
    expect(out.message.length).toBeGreaterThan(0);
  });

  test('invalid EC level throws a clear error', async ({ page }) => {
    const out = await page.evaluate(() => {
      try {
        window.__qr.encodeToMatrix('hello', 'Z');
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    });
    expect(out.threw).toBe(true);
  });
});

// ===========================================================================
// 2. ROUND-TRIP DECODE — the authoritative correctness gate.
// ===========================================================================
test.describe('round-trip decode (authoritative correctness gate)', () => {
  for (const ec of ['L', 'M', 'Q', 'H']) {
    test(`short string round-trips at EC ${ec}`, async ({ page }, testInfo) => {
      const res = await roundTrip(page, testInfo, SHORT_TEXT, ec);
      expect(res.limitation, 'unexpected jsQR limitation on a short realistic string').toBe(false);
      expect(res.decoded).toBe(true);
    });
  }

  for (const ec of ['L', 'M', 'Q', 'H']) {
    test(`URL round-trips at EC ${ec}`, async ({ page }, testInfo) => {
      const res = await roundTrip(page, testInfo, URL_TEXT, ec);
      expect(res.limitation, 'unexpected jsQR limitation on a realistic URL').toBe(false);
      expect(res.decoded).toBe(true);
    });
  }

  for (const ec of ['M', 'Q']) {
    test(`Unicode/emoji string round-trips at EC ${ec}`, async ({ page }, testInfo) => {
      const res = await roundTrip(page, testInfo, UNICODE_TEXT, ec);
      expect(res.limitation, 'unexpected jsQR limitation on a Unicode/emoji string').toBe(false);
      expect(res.decoded).toBe(true);
    });
  }

  for (const ec of ['M', 'H']) {
    test(`medium/long text round-trips at EC ${ec}`, async ({ page }, testInfo) => {
      const res = await roundTrip(page, testInfo, LOREM, ec);
      expect(res.limitation, 'unexpected jsQR limitation on a medium/long realistic text').toBe(false);
      expect(res.decoded).toBe(true);
    });
  }

  // Exact-capacity boundaries stress padding/placement edge cases the most.
  // These are exactly the shape of input where a real-world jsQR decoder
  // limitation (e.g. the documented v23-L case) is most likely to surface,
  // so — unlike the realistic-input tests above — a limitation here is
  // tolerated (annotated, not failed) rather than asserted against.
  test('exact V1-L capacity boundary (17 bytes) round-trips or is a documented jsQR limitation', async ({
    page,
  }, testInfo) => {
    const res = await roundTrip(page, testInfo, 'A'.repeat(17), 'L');
    expect(res.matrix.version).toBe(1);
    if (!res.limitation) expect(res.decoded).toBe(true);
  });

  test('exact V40-H capacity boundary (1273 bytes) round-trips or is a documented jsQR limitation', async ({
    page,
  }, testInfo) => {
    const res = await roundTrip(page, testInfo, 'B'.repeat(1273), 'H');
    expect(res.matrix.version).toBe(40);
    if (!res.limitation) expect(res.decoded).toBe(true);
  });
});

// ===========================================================================
// 3. Canvas rendering: non-blank for valid input.
// ===========================================================================
test.describe('canvas rendering', () => {
  test('renders non-blank pixels (both dark and light present) for valid input', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Non-blank render check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const { hasDark, hasLight } = await page.getByTestId('qr-canvas').evaluate((c) => {
      const ctx = c.getContext('2d');
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let hasDark = false;
      let hasLight = false;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) hasDark = true;
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) hasLight = true;
        if (hasDark && hasLight) break;
      }
      return { hasDark, hasLight };
    });
    expect(hasDark).toBe(true);
    expect(hasLight).toBe(true);
  });
});

// ===========================================================================
// 3b. Default options.
// ===========================================================================
test.describe('default options', () => {
  test('EC level defaults to H (~30% recovery) on load, before any user input', async ({ page }) => {
    await expect(page.getByTestId('ec-level-select')).toHaveValue('H');
    // The select's own markup carries the default via the `selected` option,
    // independent of any live re-render.
    const selectedOptionText = await page.getByTestId('ec-level-select').evaluate(
      (el) => el.selectedOptions[0].textContent,
    );
    expect(selectedOptionText).toMatch(/^H\s.*30% recovery/);
    // And it's actually used to render: caption reports "Level H" with no
    // other option chosen.
    await page.getByTestId('qr-input').fill('Default EC level check');
    await expect(page.getByTestId('qr-caption')).toContainText('Level H');
  });
});

// ===========================================================================
// 4. Downloads: PNG + SVG produce valid, non-trivial data.
// ===========================================================================
test.describe('downloads', () => {
  test('Download PNG produces a real PNG file (magic bytes, non-trivial size)', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Download PNG test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-png-btn').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^qr-code-v\d+-H\.png$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG magic bytes
    // The downloaded PNG itself must decode back to the input text.
    const decoded = decodePngBuffer(buf);
    expect(decoded?.data).toBe('Download PNG test');
  });

  // Verifies the hand-rolled PNG tEXt-chunk injector (index.html's
  // injectPngTextChunks/addPngMetadata): the downloaded PNG byte stream
  // itself must contain a real tEXt chunk (correct chunk framing + CRC-32),
  // carrying Author + the repo URL, and the QR must still decode correctly
  // (proving the injected chunks did not touch the pixel data).
  test('Download PNG embeds Author/Source tEXt metadata and still decodes', async ({ page }) => {
    await page.getByTestId('qr-input').fill('PNG metadata test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-png-btn').click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    // Walk the raw chunk stream (independent of index.html's own parser) and
    // collect every tEXt chunk's keyword/text, verifying each chunk's CRC-32
    // along the way so we know the framing is spec-correct, not just present.
    const textChunks = [];
    let offset = 8;
    while (offset < buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      const data = buf.subarray(offset + 8, offset + 8 + length);
      const storedCrc = buf.readUInt32BE(offset + 8 + length);
      const crcInput = buf.subarray(offset + 4, offset + 8 + length);
      expect(crc32(crcInput), `CRC-32 for chunk ${type}`).toBe(storedCrc);
      if (type === 'tEXt') {
        const nul = data.indexOf(0x00);
        textChunks.push({ keyword: data.toString('latin1', 0, nul), text: data.toString('latin1', nul + 1) });
      }
      offset += 12 + length;
      if (type === 'IEND') break;
    }
    expect(textChunks).toContainEqual({ keyword: 'Author', text: 'claude tools' });
    expect(textChunks).toContainEqual({
      keyword: 'Source',
      text: 'https://github.com/codercowboy/claude-tools',
    });

    // Injecting metadata must not corrupt the pixel data: the same PNG bytes
    // still decode back to the exact original input via the dev decoder.
    const decoded = decodePngBuffer(buf);
    expect(decoded?.data).toBe('PNG metadata test');
  });

  test('Download SVG produces valid markup with a matching dark-module count', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Download SVG test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const matrix = await page.evaluate(() => window.__qr.currentMatrix);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-svg-btn').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^qr-code-v\d+-H\.svg$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    const darkCount = matrix.modules.flat().filter(Boolean).length;
    const mCount = (svg.match(/M\d/g) || []).length;
    expect(mCount).toBe(darkCount);
  });

  // Verifies the SVG export's Dublin Core <metadata> block / XML comment
  // (index.html's toSVGString): the downloaded SVG text must carry the
  // author and repo URL, and must still be valid, well-formed, scannable
  // SVG (crisp geometry unaffected by the added markup).
  test('Download SVG embeds claude tools + repo URL metadata', async ({ page }) => {
    await page.getByTestId('qr-input').fill('SVG metadata test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-svg-btn').click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString('utf8');
    expect(svg).toContain('claude tools');
    expect(svg).toContain('https://github.com/codercowboy/claude-tools');
    expect(svg).toMatch(/<metadata>[\s\S]*claude tools[\s\S]*<\/metadata>/);
    expect(svg).toMatch(/<!--[\s\S]*claude-tools[\s\S]*-->/);
    expect(svg).toContain('xmlns:dc=');
    // Still valid/parseable XML with the expected root element.
    expect(svg).toMatch(/<svg[^>]*>/);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  test('downloads are disabled with no input, enabled once a valid render exists', async ({ page }) => {
    await expect(page.getByTestId('download-png-btn')).toBeDisabled();
    await expect(page.getByTestId('download-svg-btn')).toBeDisabled();
    await page.getByTestId('qr-input').fill('Enable downloads check');
    await expect(page.getByTestId('download-png-btn')).toBeEnabled();
    await expect(page.getByTestId('download-svg-btn')).toBeEnabled();
  });
});

// ===========================================================================
// 5. Live re-render on option changes (debounced).
// ===========================================================================
test.describe('live re-render on option changes (debounced)', () => {
  test('changing scale changes canvas pixel dimensions', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Scale change test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const before = await page.getByTestId('qr-canvas').evaluate((c) => c.width);
    await page.getByTestId('scale-input').fill('12');
    await expect
      .poll(() => page.getByTestId('qr-canvas').evaluate((c) => c.width))
      .not.toBe(before);
  });

  test('changing quiet zone changes canvas pixel dimensions', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Quiet zone change test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const before = await page.getByTestId('qr-canvas').evaluate((c) => c.width);
    await page.getByTestId('quiet-zone-input').fill('10');
    await expect
      .poll(() => page.getByTestId('qr-canvas').evaluate((c) => c.width))
      .not.toBe(before);
  });

  test('changing EC level updates the caption/version and re-renders', async ({ page }) => {
    await page.getByTestId('qr-input').fill('EC level change test string, made a bit longer to be interesting');
    await page.getByTestId('ec-level-select').selectOption('L');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await expect(page.getByTestId('qr-caption')).toContainText('Level L');
    await page.getByTestId('ec-level-select').selectOption('H');
    await expect(page.getByTestId('qr-caption')).toContainText('Level H');
  });

  test('changing fg/bg colors re-renders with the new colors', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Color change test');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await setColorInput(page, 'fg-color-input', '#ff0000');
    await setColorInput(page, 'bg-color-input', '#00ff00');
    await expect
      .poll(() =>
        page.getByTestId('qr-canvas').evaluate((c) => {
          const ctx = c.getContext('2d');
          const d = ctx.getImageData(0, 0, 1, 1).data; // corner pixel = quiet zone = background color
          return [d[0], d[1], d[2]].join(',');
        }),
      )
      .toBe('0,255,0');
  });
});

// ===========================================================================
// 6. Low-contrast warning.
// ===========================================================================
test.describe('low-contrast warning', () => {
  test('default black/white shows no warning', async ({ page }) => {
    await expect(page.getByTestId('contrast-warning')).not.toHaveClass(/visible/);
  });

  test('low-contrast fg/bg pair triggers the warning', async ({ page }) => {
    await setColorInput(page, 'fg-color-input', '#cccccc');
    await setColorInput(page, 'bg-color-input', '#dddddd');
    await expect(page.getByTestId('contrast-warning')).toHaveClass(/visible/);
    await expect(page.getByTestId('contrast-warning')).toContainText(/low contrast/i);
  });

  test('reverting to good contrast clears the warning', async ({ page }) => {
    await setColorInput(page, 'fg-color-input', '#cccccc');
    await setColorInput(page, 'bg-color-input', '#dddddd');
    await expect(page.getByTestId('contrast-warning')).toHaveClass(/visible/);
    await setColorInput(page, 'fg-color-input', '#000000');
    await setColorInput(page, 'bg-color-input', '#ffffff');
    await expect(page.getByTestId('contrast-warning')).not.toHaveClass(/visible/);
  });
});

// ===========================================================================
// 7. Empty / oversized input handling.
// ===========================================================================
test.describe('empty and oversized input', () => {
  test('empty textarea: canvas hidden, downloads disabled, hint shown, no error', async ({ page }) => {
    await expect(page.getByTestId('qr-canvas')).toHaveClass(/hidden/);
    await expect(page.getByTestId('download-png-btn')).toBeDisabled();
    await expect(page.getByTestId('download-svg-btn')).toBeDisabled();
    await expect(page.getByTestId('error-message')).not.toHaveClass(/visible/);
    await expect(page.getByTestId('capacity-hint')).toContainText(/enter text or a url/i);
  });

  test('typing then clearing returns to the empty state', async ({ page }) => {
    await page.getByTestId('qr-input').fill('temporary content');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await page.getByTestId('qr-input').fill('');
    await expect(page.getByTestId('qr-canvas')).toHaveClass(/hidden/);
    await expect(page.getByTestId('download-png-btn')).toBeDisabled();
    await expect(page.getByTestId('download-svg-btn')).toBeDisabled();
  });

  test('oversized input (exceeds V40-H capacity) shows a clear error, no broken render', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Z'.repeat(5000));
    await page.getByTestId('ec-level-select').selectOption('H');
    await expect(page.getByTestId('error-message')).toHaveClass(/visible/);
    await expect(page.getByTestId('error-message')).not.toBeEmpty();
    await expect(page.getByTestId('qr-canvas')).toHaveClass(/hidden/);
    await expect(page.getByTestId('download-png-btn')).toBeDisabled();
    await expect(page.getByTestId('download-svg-btn')).toBeDisabled();
  });

  test('recovering from an oversized error by shortening the input renders normally again', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Z'.repeat(5000));
    await page.getByTestId('ec-level-select').selectOption('H');
    await expect(page.getByTestId('error-message')).toHaveClass(/visible/);
    await page.getByTestId('qr-input').fill('short again');
    await expect(page.getByTestId('error-message')).not.toHaveClass(/visible/);
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await expect(page.getByTestId('download-png-btn')).toBeEnabled();
  });
});

// ===========================================================================
// 7b. In-field copy on the editable text/URL input (controls.css conventions:
// docs/conventions.md § "Standard control height & in-field copy"). The QR
// output is an image, so the copyable text value is the input itself. The
// button lives INSIDE the field (.ct-field > .ct-copy-btn), pinned top-right
// for the multiline textarea, and is revealed only when the field is non-empty.
// ===========================================================================
test.describe('in-field copy on the text/URL input', () => {
  test('the copy button is inside a .ct-field, carries .ct-copy-btn + title/aria-label', async ({ page }) => {
    // Reveal it first (hidden while empty).
    await page.getByTestId('qr-input').fill('copy affordance markup check');
    const copyBtn = page.getByTestId('qr-input-copy');
    await expect(copyBtn).toBeVisible();
    const shape = await copyBtn.evaluate((el) => ({
      inField: !!el.closest('.ct-field'),
      multiline: !!el.closest('.ct-field--multiline'),
      hasClass: el.classList.contains('ct-copy-btn'),
      title: el.getAttribute('title'),
      ariaLabel: el.getAttribute('aria-label'),
      type: el.getAttribute('type'),
    }));
    expect(shape.inField).toBe(true);
    expect(shape.multiline).toBe(true); // textarea → top-right pinned variant
    expect(shape.hasClass).toBe(true);
    expect(shape.title).toBeTruthy();
    expect(shape.ariaLabel).toBeTruthy();
    expect(shape.type).toBe('button');
  });

  test('hidden while empty, revealed when non-empty, hidden again when cleared', async ({ page }) => {
    const copyBtn = page.getByTestId('qr-input-copy');
    await expect(copyBtn).toBeHidden(); // fresh load: input empty
    await page.getByTestId('qr-input').fill('now non-empty');
    await expect(copyBtn).toBeVisible();
    await page.getByTestId('qr-input').fill('');
    await expect(copyBtn).toBeHidden();
    // Whitespace-only counts as empty (trim()), so it stays hidden.
    await page.getByTestId('qr-input').fill('   ');
    await expect(copyBtn).toBeHidden();
  });

  test('the in-field copy button stays visible after a reload that restores a non-empty input', async ({ page }) => {
    await page.getByTestId('qr-input').fill('restored via localStorage');
    await expect(page.getByTestId('qr-input-copy')).toBeVisible();
    await page.reload();
    // applyStoredState() sets .value directly (no input event) — syncCopyBtn()
    // must still reflect the restored non-empty value on load.
    await expect(page.getByTestId('qr-input')).toHaveValue('restored via localStorage');
    await expect(page.getByTestId('qr-input-copy')).toBeVisible();
  });

  test('clicking copies the input text to the clipboard and flashes ✅', async ({ page }) => {
    const TEXT = 'https://example.com/copy-me?x=1';
    await page.getByTestId('qr-input').fill(TEXT);
    const copyBtn = page.getByTestId('qr-input-copy');
    await expect(copyBtn).toBeVisible();

    // Capture whatever gets written to the clipboard (works regardless of the
    // permission grant / origin), mirroring dev-converter's copy tests.
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    });

    await copyBtn.click();
    await expect(copyBtn).toHaveText('✅'); // ctFlash swapped the label
    expect(await page.evaluate(() => window.__copied)).toBe(TEXT);
    // Reverts back to the clipboard glyph after the flash.
    await expect(copyBtn).toHaveText('📋');
  });

  test('the copy button is excluded from the accent brightness hover (its own subtle hover instead)', async ({ page }) => {
    await page.getByTestId('qr-input').fill('hover exclusion check');
    const copyBtn = page.getByTestId('qr-input-copy');
    await expect(copyBtn).toBeVisible();
    // The generic `button:hover:not(.ct-copy-btn)` brightness rule must not
    // apply here: transparent background + no accent fill, per controls.css.
    const bg = await copyBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)'); // transparent
  });
});

// ===========================================================================
// 7c. Standard control height (controls.css --control-h: 44px). Single-line
// controls — the number inputs, the EC-level select, and the buttons — all
// share the one height. The multiline textarea is intentionally excluded.
// ===========================================================================
test.describe('standard control height (controls.css --control-h)', () => {
  test('--control-h resolves to 44px on :root', async ({ page }) => {
    const h = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--control-h').trim(),
    );
    expect(h).toBe('44px');
  });

  test('single-line inputs, the select, and buttons are all exactly one control-height (44px)', async ({ page }) => {
    // Need a valid render so the download buttons are enabled/laid out.
    await page.getByTestId('qr-input').fill('control height check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const ids = [
      'ec-level-select',
      'scale-input',
      'quiet-zone-input',
      'download-png-btn',
      'download-svg-btn',
    ];
    for (const id of ids) {
      const h = await page.getByTestId(id).evaluate((el) => Math.round(el.getBoundingClientRect().height));
      expect(h, `${id} height should equal the 44px control height`).toBe(44);
    }
  });

  test('the multiline textarea keeps its own taller intrinsic height (excluded from --control-h)', async ({ page }) => {
    const h = await page.getByTestId('qr-input').evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThan(44);
  });
});

// ===========================================================================
// 8. data-testid hooks present.
// ===========================================================================
test.describe('data-testid hooks present', () => {
  test('all expected testids exist exactly once', async ({ page }) => {
    const ids = [
      'input-section',
      'qr-input',
      'qr-input-copy',
      'capacity-hint',
      'options-section',
      'ec-level-select',
      'scale-input',
      'quiet-zone-input',
      'fg-color-input',
      'bg-color-input',
      'contrast-warning',
      'output-section',
      'error-message',
      'qr-canvas',
      'qr-caption',
      'download-png-btn',
      'download-svg-btn',
    ];
    for (const id of ids) {
      await expect(page.getByTestId(id), `testid "${id}"`).toHaveCount(1);
    }
  });
});

// ===========================================================================
// 9. window.__qr API shape (PLAN.md §11.2).
// ===========================================================================
test.describe('window.__qr API shape', () => {
  test('exposes every documented member with the expected type', async ({ page }) => {
    await page.getByTestId('qr-input').fill('shape check');
    const shape = await page.evaluate(() => ({
      encodeToMatrix: typeof window.__qr.encodeToMatrix,
      utf8Bytes: typeof window.__qr.utf8Bytes,
      charCountBits: typeof window.__qr.charCountBits,
      selectVersion: typeof window.__qr.selectVersion,
      getDataCodewordCount: typeof window.__qr.getDataCodewordCount,
      getBlockPlan: typeof window.__qr.getBlockPlan,
      getAlignmentPatternPositions: typeof window.__qr.getAlignmentPatternPositions,
      gfMul: typeof window.__qr.gfMul,
      rsGeneratorPoly: typeof window.__qr.rsGeneratorPoly,
      rsComputeRemainder: typeof window.__qr.rsComputeRemainder,
      computeFormatBits: typeof window.__qr.computeFormatBits,
      computeVersionBits: typeof window.__qr.computeVersionBits,
      MASK_FNS: Array.isArray(window.__qr.MASK_FNS) ? 'array' : typeof window.__qr.MASK_FNS,
      scorePenalty: typeof window.__qr.scorePenalty,
      renderToCanvas: typeof window.__qr.renderToCanvas,
      toSVGString: typeof window.__qr.toSVGString,
      STORAGE_KEY: typeof window.__qr.STORAGE_KEY,
      currentMatrix: typeof window.__qr.currentMatrix,
    }));
    expect(shape).toEqual({
      encodeToMatrix: 'function',
      utf8Bytes: 'function',
      charCountBits: 'function',
      selectVersion: 'function',
      getDataCodewordCount: 'function',
      getBlockPlan: 'function',
      getAlignmentPatternPositions: 'function',
      gfMul: 'function',
      rsGeneratorPoly: 'function',
      rsComputeRemainder: 'function',
      computeFormatBits: 'function',
      computeVersionBits: 'function',
      MASK_FNS: 'array',
      scorePenalty: 'function',
      renderToCanvas: 'function',
      toSVGString: 'function',
      STORAGE_KEY: 'string',
      currentMatrix: 'object',
    });
    expect(await page.evaluate(() => window.__qr.MASK_FNS.length)).toBe(8);
  });

  test('currentMatrix is null with no input, populated after a render', async ({ page }) => {
    expect(await page.evaluate(() => window.__qr.currentMatrix)).toBeNull();
    await page.getByTestId('qr-input').fill('populate currentMatrix');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const matrix = await page.evaluate(() => window.__qr.currentMatrix);
    expect(matrix).not.toBeNull();
    expect(typeof matrix.version).toBe('number');
  });
});

// ===========================================================================
// 10. Persist UI state (localStorage) — per docs/conventions.md.
// ===========================================================================
test.describe('persist UI state (localStorage)', () => {
  const PERSIST_TEXT = 'Persisted state round-trip https://example.com/persist';

  test('setting input + changing every option writes the versioned key', async ({ page }) => {
    // Nothing stored yet on a fresh page.
    expect(await page.evaluate((key) => localStorage.getItem(key), 'qr-generator:v1')).toBeNull();

    await page.getByTestId('qr-input').fill(PERSIST_TEXT);
    await page.getByTestId('ec-level-select').selectOption('Q');
    await page.getByTestId('scale-input').fill('11');
    await page.getByTestId('quiet-zone-input').fill('6');
    await setColorInput(page, 'fg-color-input', '#123456');
    await setColorInput(page, 'bg-color-input', '#fedcba');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, 'qr-generator:v1');
    expect(stored).not.toBeNull();
    expect(stored.input).toBe(PERSIST_TEXT);
    expect(stored.ecLevel).toBe('Q');
    expect(String(stored.scale)).toBe('11');
    expect(String(stored.quietZone)).toBe('6');
    expect(stored.fg).toBe('#123456');
    expect(stored.bg).toBe('#fedcba');
  });

  test('reloading restores input + options and re-renders the QR from them', async ({ page }) => {
    await page.getByTestId('qr-input').fill(PERSIST_TEXT);
    await page.getByTestId('ec-level-select').selectOption('H');
    await page.getByTestId('scale-input').fill('14');
    await page.getByTestId('quiet-zone-input').fill('2');
    await setColorInput(page, 'fg-color-input', '#0a0b0c');
    await setColorInput(page, 'bg-color-input', '#f0f1f2');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const matrixBefore = await page.evaluate(() => window.__qr.currentMatrix);

    await page.reload();

    await expect(page.getByTestId('qr-input')).toHaveValue(PERSIST_TEXT);
    await expect(page.getByTestId('ec-level-select')).toHaveValue('H');
    await expect(page.getByTestId('scale-input')).toHaveValue('14');
    await expect(page.getByTestId('quiet-zone-input')).toHaveValue('2');
    await expect(page.getByTestId('fg-color-input')).toHaveValue('#0a0b0c');
    await expect(page.getByTestId('bg-color-input')).toHaveValue('#f0f1f2');

    // The QR re-renders (derived from the restored input+options — never
    // itself persisted) as soon as the page loads, with no further input.
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const matrixAfter = await page.evaluate(() => window.__qr.currentMatrix);
    expect(matrixAfter).not.toBeNull();
    expect(matrixAfter.version).toBe(matrixBefore.version);
    expect(matrixAfter.size).toBe(matrixBefore.size);
    expect(matrixAfter.modules).toEqual(matrixBefore.modules);

    // The restored input+EC still independently encode to the exact same
    // matrix via the pure encodeToMatrix() API (confirms restore round-trips
    // through the real encoder, not just that the DOM values look right).
    const recomputed = await page.evaluate(
      ({ text, ec }) => window.__qr.encodeToMatrix(text, ec),
      { text: PERSIST_TEXT, ec: 'H' },
    );
    expect(recomputed.modules).toEqual(matrixBefore.modules);
  });

  test('degrades silently with no crash and starts with defaults when localStorage throws', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const throwing = () => {
        throw new Error('simulated localStorage failure');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          return {
            getItem: throwing,
            setItem: throwing,
            removeItem: throwing,
            clear: throwing,
          };
        },
      });
    });
    await page.goto(TOOL_URL);

    // Loads with markup defaults, no crash, empty-state UI intact.
    await expect(page.getByTestId('qr-input')).toHaveValue('');
    await expect(page.getByTestId('ec-level-select')).toHaveValue('H');
    await expect(page.getByTestId('scale-input')).toHaveValue('8');
    await expect(page.getByTestId('quiet-zone-input')).toHaveValue('4');
    await expect(page.getByTestId('fg-color-input')).toHaveValue('#000000');
    await expect(page.getByTestId('bg-color-input')).toHaveValue('#ffffff');
    await expect(page.getByTestId('qr-canvas')).toHaveClass(/hidden/);

    // The tool still works fully in-memory: typing, changing options, and
    // downloading all function normally even though every localStorage call
    // throws.
    await page.getByTestId('qr-input').fill('Works with throwing localStorage');
    await page.getByTestId('ec-level-select').selectOption('L');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await expect(page.getByTestId('qr-caption')).toContainText('Level L');

    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err));
    await page.getByTestId('scale-input').fill('9');
    await page.getByTestId('quiet-zone-input').fill('5');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    expect(consoleErrors).toEqual([]);

    await context.close();
  });
});

// ===========================================================================
// 10b. First-load Help popup (docs/conventions.md § "First-load help popup
// (all tools)"). Reference pattern: tools/hat-picker, tools/color-designer.
// Auto-shows once on a genuinely fresh visit (own browser.newContext() — the
// shared beforeEach above pre-seeds the "seen" flag for every other test in
// this file so the modal doesn't interfere with unrelated assertions);
// otherwise reachable only via the ? button. Accessible modal: role=dialog,
// aria-modal, initial focus on Close, Esc/backdrop/Close all dismiss + return
// focus, a focus trap keeps Tab inside, and the overlay is display:none when
// closed.
// ===========================================================================
test.describe('First-load Help popup: auto-show', () => {
  test('auto-shows on a genuine first visit (fresh context, no pre-seeded flag)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);

    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();
    const modal = page.getByTestId('help-modal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'help-title');
    await expect(modal.getByTestId('modal-close-x')).toBeFocused();

    // Marked seen immediately (not just on close) — see index.html's init().
    const seen = await page.evaluate((key) => localStorage.getItem(key), HELP_SEEN_KEY);
    expect(seen).toBe('1');

    await context.close();
  });

  test('does not auto-show again on a later visit in the same (now-seen) context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('help-overlay')).toBeVisible(); // first visit: auto-shows

    await page.reload();
    await expect(page.getByTestId('help-overlay')).toBeHidden(); // second visit: does not

    await context.close();
  });

  test('does not auto-show when the seen flag is pre-seeded (the shared beforeEach context)', async ({ page }) => {
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });
});

test.describe('Help modal: open/close behavior + focus handling', () => {
  test('opens via the ? button, and the overlay is display:none while closed', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');

    await page.getByTestId('help-button').click();

    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await expect(page.getByTestId('help-modal').getByTestId('modal-close-x')).toBeFocused();
    await expect(page.getByTestId('help-modal')).toContainText('How QR Code Generator works');
  });

  test('Esc closes the modal and returns focus to the ? button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('backdrop click closes the modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    // Click the overlay itself, well outside the centered dialog box.
    await overlay.click({ position: { x: 5, y: 5 } });

    await expect(overlay).toBeHidden();
  });

  // docs/conventions.md "Every content modal has a close ✕" — a persistent ✕
  // pinned to the dialog's top-right corner is the sole dedicated close
  // control (no redundant bottom "Close" text button); Esc and backdrop-click
  // remain as the other close paths.
  test('the top-right ✕ is present, wired to the same close path as Esc/backdrop', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    const dialog = page.getByTestId('help-modal');
    const closeX = dialog.getByTestId('modal-close-x');

    await expect(closeX).toBeVisible();
    await expect(closeX).toHaveAttribute('aria-label', 'Close');

    await closeX.click();

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('focus is trapped inside the dialog while open (the top-right ✕ is the only focusable element, so Tab/Shift+Tab keep it focused)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const closeX = page.getByTestId('help-modal').getByTestId('modal-close-x');
    await expect(closeX).toBeFocused();

    // With the ✕ as the dialog's only focusable element, Tab and Shift+Tab
    // both keep focus on it — proof the trap doesn't let focus escape to the
    // page behind the overlay (e.g. the ? button or a download button).
    await page.keyboard.press('Tab');
    await expect(closeX).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeX).toBeFocused();

    const activeIsOutsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="help-modal"]');
      return !dialog.contains(document.activeElement);
    });
    expect(activeIsOutsideDialog).toBe(false);
  });
});

test.describe('Help modal + Help button: touch-action manipulation (mobile double-tap-to-zoom guard)', () => {
  test('the ? button and the dialog ✕ both have touch-action: manipulation', async ({ page }) => {
    const helpButtonTouchAction = await page.getByTestId('help-button').evaluate((el) => getComputedStyle(el).touchAction);
    expect(helpButtonTouchAction).toBe('manipulation');

    await page.getByTestId('help-button').click();
    const closeXTouchAction = await page.getByTestId('help-modal').getByTestId('modal-close-x').evaluate((el) => getComputedStyle(el).touchAction);
    expect(closeXTouchAction).toBe('manipulation');
  });

  test('the generic button touch-action rule also covers an ordinary control (a download button)', async ({ page }) => {
    await page.getByTestId('qr-input').fill('touch-action check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const touchAction = await page.getByTestId('download-png-btn').evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  test('the page (html) uses touch-action: manipulation so double-tap does not zoom', async ({ page }) => {
    const touchAction = await page.evaluate(
      () => getComputedStyle(document.documentElement).touchAction
    );
    expect(touchAction).toBe('manipulation');
  });
});

test.describe('Help modal: opens scrolled to the top', () => {
  test('opens scrolled to the top even when its content overflows (initial focus must not scroll the dialog)', async ({ page }) => {
    // Shrink the viewport so the help content overflows the dialog's
    // max-height, then open it — a bug where initial focus scrolled the
    // panel to reveal the focused element would open the modal scrolled away
    // from the top instead of pinned to it.
    await page.setViewportSize({ width: 375, height: 400 });
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await page.getByTestId('help-button').click();
    await expect(overlay).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(dialog.getByTestId('modal-close-x')).toBeFocused();
  });
});

// ===========================================================================
// 10c. License modal (shared src/tools/include/license.js, inlined via the
// footer). Footer trigger [data-testid="footer-license-link"] (self-wired by
// CtLicense; no window.ctLicense global) opens an accessible modal (role=dialog, aria-modal,
// initial focus on the ✕, Esc/backdrop/✕ all dismiss + return focus to the
// footer link). Mirrors the Help-modal block's style above. This tool declares
// no window.ctThirdParty, so the body shows the "100% vanilla" note.
//
// The file-level beforeEach already pre-seeds the HELP_SEEN_KEY localStorage
// flag (via context.addInitScript) before page.goto, so the first-load auto
// Help modal never interferes with opening the License modal here.
// ===========================================================================
test.describe('License modal', () => {
  // Belt-and-braces: re-assert the help-seen pre-seed for this block on a fresh
  // context, exactly like the file-level beforeEach's seedHelpSeen pattern, so
  // the auto Help modal can never intercept the footer click below. (The
  // file-level beforeEach already does this for the default `page`; this
  // dedicated beforeEach documents the dependency at the block level.)
  test.beforeEach(async ({ page }) => {
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
  });

  async function openLicense(page) {
    const link = page.getByTestId('footer-license-link');
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page.getByTestId('license-overlay')).toBeVisible();
    return link;
  }

  test('the footer link opens the modal: MIT text, a ✕ close control, and the 100%-vanilla note', async ({ page }) => {
    // Closed to start: overlay is [hidden].
    const overlay = page.getByTestId('license-overlay');
    await expect(overlay).toBeHidden();

    await openLicense(page);

    const modal = page.getByTestId('license-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toContainText('MIT License');
    await expect(modal).toContainText('License'); // the h2 title

    const closeX = modal.getByTestId('license-close-x');
    await expect(closeX).toBeVisible();
    await expect(closeX).toHaveAttribute('aria-label', 'Close');

    // No window.ctThirdParty declared → the "100% vanilla" note is shown.
    await expect(modal).toContainText(/no runtime dependencies/i);
    await expect(modal).toContainText(/100% vanilla/i);
  });

  // Focus-on-open and Esc / ✕ / backdrop close with focus return are the
  // shared License-modal contract; assert them via the helper.
  test('is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});

// ===========================================================================
// 11. Conventions compliance: no crypto.randomUUID, footer present.
// ===========================================================================
test.describe('conventions compliance (static + simulated checks)', () => {
  test('index.html source does not reference crypto.randomUUID (secure-context-only API)', () => {
    expect(INDEX_HTML_SOURCE).not.toMatch(/crypto\.randomUUID/);
  });

  test('README footer is present with link', () => {
    expect(INDEX_HTML_SOURCE).toContain('end footer');
    expect(INDEX_HTML_SOURCE).toContain('github.com/codercowboy/claude-tools');
  });

  // Per docs/conventions.md: simulate a non-secure context (crypto.randomUUID
  // undefined, via defineProperty — delete is a documented no-op in Chromium)
  // and confirm the tool still renders correctly. This tool doesn't call
  // crypto.randomUUID at all (asserted above), so this is a belt-and-braces
  // regression guard, not expected to catch anything today.
  test('renders correctly when crypto.randomUUID is unavailable (simulated non-secure context)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });
    // Pre-seed the Help-modal "seen" flag (own fresh context, so not covered
    // by the shared beforeEach) — this test isn't about the Help modal, and
    // the auto-shown overlay would otherwise intercept the fill() below.
    await seedHelpSeen(page, HELP_SEEN_KEY);
    await page.goto(TOOL_URL);
    await page.getByTestId('qr-input').fill('works without crypto.randomUUID');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await context.close();
  });
});

// ===========================================================================
// 12. Mobile (375x667 & 360x640, dpr2, touch).
// ===========================================================================
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true });

  test('no horizontal page overflow after rendering a QR code', async ({ page }) => {
    await page.getByTestId('qr-input').tap();
    await page.getByTestId('qr-input').fill('Mobile overflow check https://example.com/some/path?x=1');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('canvas fits within the viewport width (scales down via CSS)', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Mobile canvas fit check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const box = await page.getByTestId('qr-canvas').boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  test('controls and download buttons have ~44px tap targets', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Tap target check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const ids = [
      'ec-level-select',
      'scale-input',
      'quiet-zone-input',
      'fg-color-input',
      'bg-color-input',
      'download-png-btn',
      'download-svg-btn',
    ];
    for (const id of ids) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `${id} should be visible/have a bounding box`).not.toBeNull();
      expect(box.height, `${id} height >= 44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test('real tap interactions: EC level change and a PNG download both work end to end', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Real tap interaction check');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    await page.getByTestId('ec-level-select').selectOption('H');
    await expect(page.getByTestId('qr-caption')).toContainText('Level H');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-png-btn').tap(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^qr-code-v\d+-H\.png$/);
  });

  test('the round-trip decode also holds at a mobile viewport (real render, real decode)', async ({
    page,
  }, testInfo) => {
    const res = await roundTrip(page, testInfo, 'Mobile round-trip https://example.com/qr', 'M');
    expect(res.limitation).toBe(false);
    expect(res.decoded).toBe(true);
  });
});

test.describe('mobile viewport (360x640)', () => {
  test.use({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true });

  test('no horizontal page overflow at 360px', async ({ page }) => {
    await page.getByTestId('qr-input').fill('360px width check https://example.com');
    await expect(page.getByTestId('qr-canvas')).not.toHaveClass(/hidden/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('options grid stacks to a single column at 360px', async ({ page }) => {
    await page.getByTestId('qr-input').fill('Layout stack check');
    const scaleBox = await page.getByTestId('scale-input').boundingBox();
    const quietZoneBox = await page.getByTestId('quiet-zone-input').boundingBox();
    // At <=420px the options-grid CSS switches to a single column, so these
    // two fields should stack vertically (quiet-zone below scale), not sit
    // side by side.
    expect(quietZoneBox.y).toBeGreaterThan(scaleBox.y);
  });
});
