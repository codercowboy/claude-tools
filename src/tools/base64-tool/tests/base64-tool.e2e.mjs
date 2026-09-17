// @playwright/test spec for tools/base64-tool/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec
// drives the finished page from the outside via data-testid hooks and the
// window.__base64Tool test API described in DESIGN.md § Testability and
// PLAN.md § 13.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/base64-tool/)

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';
import { assertLicenseModal } from '../../test-support/shared-ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');
const TOOL_URL = toolUrl(import.meta.url);

// Text/file input -> output rendering is debounced ~150ms (PLAN.md § 5/§7).
// Give it comfortable headroom in real-typing tests.
const DEBOUNCE_WAIT = 300;

// A minimal, well-known 1x1 transparent PNG, used as the "known file" fixture
// for the file-encode tests (setInputFiles accepts an in-memory buffer, so no
// fixture file needs to live on disk).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA' +
  '60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_BUFFER = Buffer.from(TINY_PNG_BASE64, 'base64');

// First-load Help popup (docs/conventions.md § "First-load help popup (all
// tools)") auto-shows once, keyed off localStorage "base64-tool:help-seen:v1".
// Every test in this file EXCEPT the dedicated "first-load help popup" suite
// below pre-seeds that key (via addInitScript, so it's set before the page's
// own script runs) so the auto-shown modal never interferes with unrelated
// assertions. The dedicated suite below deliberately does NOT rely on this
// shared beforeEach for its "genuine first visit" case — it opens its own
// fresh browser.newContext() so the key is truly absent.
const HELP_SEEN_KEY = helpSeenKey('base64-tool');

test.beforeEach(async ({ page }) => {
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
});

// ---------------------------------------------------------------------------
// 1. Pure functions via window.__base64Tool (DESIGN.md's required set):
//    encodeText/decodeText Unicode round-trip, bytesToBase64/base64ToBytes,
//    toBase64Url/fromBase64Url, parseDataUri, decodeInput/normalizeBase64
//    whitespace + URL-safe tolerance, invalid input handling.
// ---------------------------------------------------------------------------
test.describe('pure functions: encodeText/decodeText Unicode round-trip', () => {
  test('emoji, accents, and CJK all round-trip exactly', async ({ page }) => {
    const samples = [
      'héllo café — ok',
      '😀🎉👍 emoji galore',
      '你好世界 — こんにちは — 안녕하세요',
      'mixed: café 😀 你好 naïve résumé',
      '', // empty string is a valid round-trip too
    ];
    for (const s of samples) {
      const out = await page.evaluate((str) => {
        const b64 = window.__base64Tool.encodeText(str);
        return { b64, decoded: window.__base64Tool.decodeText(b64) };
      }, s);
      expect(out.decoded, `round-trip of ${JSON.stringify(s)}`).toBe(s);
    }
  });

  test('encodeText does not use raw btoa (would throw/mangle on non-Latin1 text)', async ({ page }) => {
    // A sanity check that encodeText goes through UTF-8 bytes rather than
    // btoa(str) directly: btoa() throws a DOMException on any code point
    // outside Latin1 (e.g. emoji), so a naive implementation would throw
    // here instead of returning a value.
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('😀'));
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });
});

test.describe('pure functions: bytesToBase64 / base64ToBytes', () => {
  test('round-trips an arbitrary byte sequence covering the full 0-255 range', async ({ page }) => {
    const out = await page.evaluate(() => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) bytes[i] = i;
      const b64 = window.__base64Tool.bytesToBase64(bytes);
      const back = window.__base64Tool.base64ToBytes(b64);
      return { b64, back: Array.from(back) };
    });
    expect(out.back).toEqual(Array.from({ length: 256 }, (_, i) => i));
    // This byte sequence exercises every 6-bit value multiple times, so the
    // resulting Base64 is expected to contain both '+' and '/' — used below
    // to exercise the URL-safe mapping with both special characters present.
    expect(out.b64).toMatch(/\+/);
    expect(out.b64).toMatch(/\//);
  });

  test('base64ToBytes throws on invalid Base64 input', async ({ page }) => {
    const err = await page.evaluate(() => {
      try {
        window.__base64Tool.base64ToBytes('!!! not base64 !!!');
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(err).toBeTruthy();
  });
});

test.describe('pure functions: toBase64Url / fromBase64Url', () => {
  test('maps +/ to -_ and strips padding; fromBase64Url restores the original', async ({ page }) => {
    const out = await page.evaluate(() => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) bytes[i] = i;
      const b64 = window.__base64Tool.bytesToBase64(bytes);
      const b64url = window.__base64Tool.toBase64Url(b64);
      const restored = window.__base64Tool.fromBase64Url(b64url);
      return { b64, b64url, restored };
    });
    expect(out.b64).toMatch(/\+/);
    expect(out.b64).toMatch(/\//);
    expect(out.b64url).not.toMatch(/[+/=]/);
    expect(out.restored).toBe(out.b64);
  });

  test('fromBase64Url round-trips through base64ToBytes to the identical bytes', async ({ page }) => {
    const out = await page.evaluate(() => {
      const original = 'the quick brown fox jumps over the lazy dog 🦊';
      const b64 = window.__base64Tool.encodeText(original);
      const b64url = window.__base64Tool.toBase64Url(b64);
      const restoredB64 = window.__base64Tool.fromBase64Url(b64url);
      return { decoded: window.__base64Tool.decodeText(restoredB64), original };
    });
    expect(out.decoded).toBe(out.original);
  });
});

test.describe('pure functions: parseDataUri', () => {
  test('a valid base64 data URI parses to {mime, isBase64, payload}', async ({ page }) => {
    const out = await page.evaluate(() =>
      window.__base64Tool.parseDataUri('data:image/png;base64,iVBORw0KGgo=')
    );
    expect(out).toEqual({ mime: 'image/png', isBase64: true, payload: 'iVBORw0KGgo=' });
  });

  test('a non-data-URI string returns null', async ({ page }) => {
    const out = await page.evaluate(() => window.__base64Tool.parseDataUri('not a uri'));
    expect(out).toBeNull();
    const out2 = await page.evaluate(() => window.__base64Tool.parseDataUri(''));
    expect(out2).toBeNull();
  });

  test('a non-base64 data URI (;base64 absent) parses with isBase64:false, and decodeInput rejects it', async ({
    page,
  }) => {
    const parsed = await page.evaluate(() => window.__base64Tool.parseDataUri('data:text/plain,hello'));
    expect(parsed).toEqual({ mime: 'text/plain', isBase64: false, payload: 'hello' });

    const err = await page.evaluate(() => {
      try {
        window.__base64Tool.decodeInput('data:text/plain,hello');
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(err).toMatch(/base64/i);
  });
});

test.describe('pure functions: decodeInput / normalizeBase64 tolerance', () => {
  test('tolerates embedded whitespace/newlines in pasted Base64', async ({ page }) => {
    const out = await page.evaluate(() => {
      const b64 = window.__base64Tool.encodeText('hello world');
      const withWhitespace = b64.slice(0, 4) + '\n  ' + b64.slice(4, 8) + '\t' + b64.slice(8);
      return window.__base64Tool.decodeInput(withWhitespace);
    });
    expect(out.text).toBe('hello world');
    expect(out.isText).toBe(true);
  });

  test('accepts URL-safe Base64 (no +/ , no padding) via decodeInput', async ({ page }) => {
    const out = await page.evaluate(() => {
      const original = 'café 😀 data — url safe test';
      const b64 = window.__base64Tool.encodeText(original);
      const b64url = window.__base64Tool.toBase64Url(b64);
      const result = window.__base64Tool.decodeInput(b64url);
      return { text: result.text, original };
    });
    expect(out.text).toBe(out.original);
  });

  test('rejects a mix of standard and URL-safe alphabets', async ({ page }) => {
    const err = await page.evaluate(() => {
      try {
        // '+' (standard) and '-' (URL-safe) mixed together is ambiguous.
        window.__base64Tool.normalizeBase64('ab+c-d_e/f');
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(err).toMatch(/mixed/i);
  });

  test('invalid input throws a friendly Error via decodeInput (no crash)', async ({ page }) => {
    const results = await page.evaluate(() => {
      const cases = ['!!! not base64 !!!', '', '   ', 'A'];
      return cases.map((c) => {
        try {
          window.__base64Tool.decodeInput(c);
          return { case: c, threw: false };
        } catch (e) {
          return { case: c, threw: true, message: e.message };
        }
      });
    });
    for (const r of results) {
      expect(r.threw, `case ${JSON.stringify(r.case)} should throw`).toBe(true);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Encode UI: typing text live-updates all four outputs; copy buttons show
//    feedback and copy the right value.
// ---------------------------------------------------------------------------
test.describe('encode UI: live outputs from typed text', () => {
  test('typing text updates Base64 / Base64URL / data URI / JS snippet outputs correctly', async ({ page }) => {
    const text = 'héllo 😀 café — ok';
    await page.getByTestId('encode-text-input').fill(text);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const expected = await page.evaluate((s) => {
      const b64 = window.__base64Tool.encodeText(s);
      return { b64, b64url: window.__base64Tool.toBase64Url(b64) };
    }, text);

    await expect(page.getByTestId('encode-base64-output')).toHaveValue(expected.b64);
    await expect(page.getByTestId('encode-base64url-output')).toHaveValue(expected.b64url);
    const dataUri = await page.getByTestId('encode-datauri-output').inputValue();
    expect(dataUri).toBe(`data:text/plain;base64,${expected.b64}`);
    const snippet = await page.getByTestId('encode-snippet-output').inputValue();
    expect(snippet).toContain(dataUri);
    expect(snippet).toContain('fetch(');
  });

  test('outputs update live as text is edited further (debounced)', async ({ page }) => {
    const input = page.getByTestId('encode-text-input');
    await input.fill('abc');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const first = await page.getByTestId('encode-base64-output').inputValue();

    await input.fill('abcdef');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const second = await page.getByTestId('encode-base64-output').inputValue();

    expect(second).not.toBe(first);
    const expected = await page.evaluate(() => window.__base64Tool.encodeText('abcdef'));
    expect(second).toBe(expected);
  });

  test('a custom MIME type changes the data URI (text mode only)', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill('{"a":1}');
    await page.getByTestId('encode-mime-input').fill('application/json');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const dataUri = await page.getByTestId('encode-datauri-output').inputValue();
    expect(dataUri.startsWith('data:application/json;base64,')).toBe(true);
  });

  test('empty input leaves all outputs blank (no data:text/plain;base64, for nothing)', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill('');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('encode-base64-output')).toHaveValue('');
    await expect(page.getByTestId('encode-datauri-output')).toHaveValue('');
  });
});

test.describe('encode UI: copy buttons', () => {
  const cases = [
    ['encode-base64-copy-btn', 'encode-base64-output'],
    ['encode-base64url-copy-btn', 'encode-base64url-output'],
    ['encode-datauri-copy-btn', 'encode-datauri-output'],
    ['encode-snippet-copy-btn', 'encode-snippet-output'],
  ];

  for (const [btnId, fieldId] of cases) {
    test(`${btnId} shows check feedback and copies the exact ${fieldId} value`, async ({ page }) => {
      await page.getByTestId('encode-text-input').fill('copy me: café 😀');
      await page.waitForTimeout(DEBOUNCE_WAIT);

      const expectedValue = await page.getByTestId(fieldId).inputValue();
      expect(expectedValue.length).toBeGreaterThan(0);

      const btn = page.getByTestId(btnId);
      await btn.click();
      await expect(btn).toHaveText('✅');

      // Best-effort clipboard read-back: file:// origins / headless Chromium
      // can be finicky about the Permissions API for the Clipboard API, so
      // this is a bonus assertion, not the primary one — UI feedback + the
      // known-correct field value (what was handed to copyText()) are the
      // authoritative assertions per docs/conventions.md's copy pattern.
      try {
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        expect(clip).toBe(expectedValue);
      } catch {
        /* clipboard read restricted in this environment; UI feedback above already asserted */
      }

      // Reverts back to the clipboard icon after ~1s.
      await expect(btn).toHaveText('📋', { timeout: 2000 });
    });
  }

  test('decode-text-copy-btn copies the decoded text', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('decoded copy test'));
    await page.getByTestId('decode-input').fill(b64);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const btn = page.getByTestId('decode-text-copy-btn');
    await btn.click();
    await expect(btn).toHaveText('✅');
    await expect(page.getByTestId('decode-text-output')).toHaveValue('decoded copy test');
  });
});

// ---------------------------------------------------------------------------
// 2b. In-field copy convention (docs/conventions.md § "Standard control height
//     & in-field copy — controls.css"). Each value field's copy button lives
//     INSIDE the field (.ct-field wrapper, .ct-copy-btn), pinned top-right for
//     multiline; outputs show it always, editable inputs reveal it only when
//     non-empty; single-line controls share the 44px --control-h.
// ---------------------------------------------------------------------------
test.describe('in-field copy convention', () => {
  // Every copy button sits inside a .ct-field wrapper as a sibling of its
  // input/textarea (not the old side-by-side layout).
  const ALL_COPY_BTNS = [
    'encode-text-copy-btn',
    'encode-mime-copy-btn',
    'encode-base64-copy-btn',
    'encode-base64url-copy-btn',
    'encode-datauri-copy-btn',
    'encode-snippet-copy-btn',
    'decode-input-copy-btn',
    'decode-text-copy-btn',
  ];

  test('every copy button is a .ct-copy-btn nested inside a .ct-field', async ({ page }) => {
    for (const id of ALL_COPY_BTNS) {
      const info = await page.getByTestId(id).evaluate((btn) => ({
        hasClass: btn.classList.contains('ct-copy-btn'),
        parentIsField: !!btn.parentElement && btn.parentElement.classList.contains('ct-field'),
        hasTitle: btn.hasAttribute('title'),
        hasAriaLabel: btn.hasAttribute('aria-label'),
      }));
      expect(info.hasClass, `${id} .ct-copy-btn`).toBe(true);
      expect(info.parentIsField, `${id} inside .ct-field`).toBe(true);
      expect(info.hasTitle, `${id} title`).toBe(true);
      expect(info.hasAriaLabel, `${id} aria-label`).toBe(true);
    }
  });

  test('multiline output fields use .ct-field--multiline (copy pinned top-right)', async ({ page }) => {
    // The four encode outputs + decoded-text output are multiline textareas.
    for (const id of [
      'encode-base64-copy-btn', 'encode-base64url-copy-btn',
      'encode-datauri-copy-btn', 'encode-snippet-copy-btn',
    ]) {
      const isMultiline = await page.getByTestId(id).evaluate(
        (btn) => btn.parentElement.classList.contains('ct-field--multiline')
      );
      expect(isMultiline, `${id} in .ct-field--multiline`).toBe(true);
    }
  });

  test('a multiline copy button is pinned to the top of a tall field, not vertically centered', async ({ page }) => {
    // Populate so the Base64 output grows tall, then confirm its copy button
    // hugs the top edge (top-right pin) rather than sitting at the field's
    // vertical center.
    await page.getByTestId('encode-text-input').fill('x'.repeat(4000));
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const field = page.getByTestId('encode-base64-output');
    const btn = page.getByTestId('encode-base64-copy-btn');
    const fieldBox = await field.boundingBox();
    const btnBox = await btn.boundingBox();
    // Button top is near the field's top, well above its vertical middle.
    expect(btnBox.y - fieldBox.y).toBeLessThan(fieldBox.height / 2);
    // And it's on the right side of the field.
    expect(btnBox.x + btnBox.width).toBeGreaterThan(fieldBox.x + fieldBox.width / 2);
  });

  test('output copy buttons are always visible; the editable-input copies start hidden', async ({ page }) => {
    // Encode outputs: always-on (even before any value is present).
    for (const id of [
      'encode-base64-copy-btn', 'encode-base64url-copy-btn',
      'encode-datauri-copy-btn', 'encode-snippet-copy-btn',
    ]) {
      await expect(page.getByTestId(id), `${id} always visible`).toBeVisible();
    }
    // Editable encode-text copy: hidden on a fresh (empty) load.
    await expect(page.getByTestId('encode-text-copy-btn')).toBeHidden();
    // MIME field defaults to "text/plain" (non-empty) → its copy shows.
    await expect(page.getByTestId('encode-mime-copy-btn')).toBeVisible();
  });

  test('encode-text copy reveals when non-empty and hides again on Clear', async ({ page }) => {
    const btn = page.getByTestId('encode-text-copy-btn');
    await expect(btn).toBeHidden();

    await page.getByTestId('encode-text-input').fill('reveal me');
    await expect(btn).toBeVisible();

    // It copies the exact field value.
    await btn.click();
    await expect(btn).toHaveText('✅');
    try {
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toBe('reveal me');
    } catch { /* clipboard read restricted; UI feedback already asserted */ }

    await page.getByTestId('encode-clear-btn').click();
    await expect(btn).toBeHidden();
  });

  test('decode-input copy reveals when non-empty and hides again on Clear', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const btn = page.getByTestId('decode-input-copy-btn');
    await expect(btn).toBeHidden();

    await page.getByTestId('decode-input').fill('SGVsbG8=');
    await expect(btn).toBeVisible();

    await page.getByTestId('decode-clear-btn').click();
    await expect(btn).toBeHidden();
  });

  test('MIME copy hides when the field is emptied and returns after typing', async ({ page }) => {
    const btn = page.getByTestId('encode-mime-copy-btn');
    await expect(btn).toBeVisible(); // starts "text/plain"

    await page.getByTestId('encode-mime-input').fill('');
    await expect(btn).toBeHidden();

    await page.getByTestId('encode-mime-input').fill('image/png');
    await expect(btn).toBeVisible();
  });

  test('single-line controls share the standard 44px --control-h', async ({ page }) => {
    // --control-h defaults to 44px in controls.css; the MIME text input, the
    // mode buttons, and the Clear button all size to it.
    for (const id of ['encode-mime-input', 'mode-encode-btn', 'mode-decode-btn', 'encode-clear-btn']) {
      const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
      expect(Math.round(h), `${id} height`).toBe(44);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. File encode via setInputFiles: outputs match the expected encoding of
//    the fixture's exact bytes; file name/size/MIME shown.
// ---------------------------------------------------------------------------
test.describe('file encode', () => {
  test('a small known PNG file encodes to the exact matching Base64/data URI, with file info shown', async ({
    page,
  }) => {
    await page.getByTestId('encode-file-input').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG_BUFFER,
    });
    await page.waitForTimeout(DEBOUNCE_WAIT);

    // File info shown.
    const fileInfo = page.getByTestId('encode-file-info');
    await expect(fileInfo).toBeVisible();
    await expect(fileInfo.locator('.file-name')).toHaveText('tiny.png');
    await expect(fileInfo.locator('.file-mime')).toHaveText('image/png');
    const sizeText = await fileInfo.locator('.file-size').textContent();
    expect(sizeText).toMatch(/\d/); // some human-readable size rendered

    // Base64 output decodes back to the exact original bytes.
    const b64 = await page.getByTestId('encode-base64-output').inputValue();
    const decodedBytes = Buffer.from(b64, 'base64');
    expect(decodedBytes.equals(TINY_PNG_BUFFER)).toBe(true);

    // data: URI carries the file's MIME and the same Base64 payload.
    const dataUri = await page.getByTestId('encode-datauri-output').inputValue();
    expect(dataUri).toBe(`data:image/png;base64,${b64}`);

    // MIME input is disabled while a file is selected (ignored per DESIGN.md).
    await expect(page.getByTestId('encode-mime-input')).toBeDisabled();
  });

  test('file wins over typed text; removing the file restores the text-based output', async ({ page }) => {
    const textInput = page.getByTestId('encode-text-input');
    await textInput.fill('this text should be ignored while a file is selected');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const textOnlyB64 = await page.getByTestId('encode-base64-output').inputValue();

    await page.getByTestId('encode-file-input').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG_BUFFER,
    });
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const fileB64 = await page.getByTestId('encode-base64-output').inputValue();
    expect(fileB64).not.toBe(textOnlyB64);
    expect(Buffer.from(fileB64, 'base64').equals(TINY_PNG_BUFFER)).toBe(true);

    await page.getByTestId('encode-remove-file-btn').click();
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('encode-file-info')).toBeHidden();
    await expect(page.getByTestId('encode-mime-input')).toBeEnabled();
    const restoredB64 = await page.getByTestId('encode-base64-output').inputValue();
    expect(restoredB64).toBe(textOnlyB64);
  });

  test('a UTF-8 text file with unicode content encodes correctly', async ({ page }) => {
    const content = 'unicode file body: café 😀 你好 — done';
    const buffer = Buffer.from(content, 'utf-8');
    await page.getByTestId('encode-file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer,
    });
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const b64 = await page.getByTestId('encode-base64-output').inputValue();
    expect(Buffer.from(b64, 'base64').toString('utf-8')).toBe(content);
    await expect(page.getByTestId('encode-file-info').locator('.file-name')).toHaveText('notes.txt');
    await expect(page.getByTestId('encode-file-info').locator('.file-mime')).toHaveText('text/plain');
  });
});

// ---------------------------------------------------------------------------
// 4. Decode: known Base64 and known data URI -> correct decoded text;
//    Download-as-file triggers a real download with the expected
//    filename/mime; invalid input -> inline error, no crash.
// ---------------------------------------------------------------------------
test.describe('decode: text output', () => {
  test('a known bare Base64 string decodes to the correct text', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('plain base64 decode test'));
    await page.getByTestId('decode-input').fill(b64);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    await expect(page.getByTestId('decode-text-output')).toHaveValue('plain base64 decode test');
    await expect(page.getByTestId('decode-detected-mime')).toContainText('application/octet-stream');
    await expect(page.getByTestId('decode-binary-note')).toBeHidden();
  });

  test('a known data: URI decodes to the correct text and detected MIME', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('café 😀 data uri decode'));
    await page.getByTestId('decode-input').fill(`data:text/plain;base64,${b64}`);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    await expect(page.getByTestId('decode-text-output')).toHaveValue('café 😀 data uri decode');
    await expect(page.getByTestId('decode-detected-mime')).toContainText('text/plain');
  });

  test('binary (non-UTF8) decoded data shows the binary note, not the text output', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const b64 = TINY_PNG_BUFFER.toString('base64');
    await page.getByTestId('decode-input').fill(`data:image/png;base64,${b64}`);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    await expect(page.getByTestId('decode-text-col')).toBeHidden();
    await expect(page.getByTestId('decode-binary-note')).toBeVisible();
    await expect(page.getByTestId('decode-download-btn')).toBeEnabled();
  });
});

test.describe('decode: Download as file', () => {
  test('downloading a decoded text data URI produces a .txt download with the correct content', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    const content = 'download me as text';
    const b64 = await page.evaluate((s) => window.__base64Tool.encodeText(s), content);
    await page.getByTestId('decode-input').fill(`data:text/plain;base64,${b64}`);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('decode-download-btn').click(),
    ]);
    expect(download.suggestedFilename()).toBe('decoded.txt');

    const savePath = path.join(os.tmpdir(), `base64-tool-download-${Date.now()}.txt`);
    await download.saveAs(savePath);
    const saved = fs.readFileSync(savePath, 'utf-8');
    expect(saved).toBe(content);
    fs.unlinkSync(savePath);
  });

  test('downloading a decoded binary (PNG) data URI produces a .png download with byte-exact content', async ({
    page,
  }) => {
    await page.getByTestId('mode-decode-btn').click();
    const b64 = TINY_PNG_BUFFER.toString('base64');
    await page.getByTestId('decode-input').fill(`data:image/png;base64,${b64}`);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('decode-download-btn').click(),
    ]);
    expect(download.suggestedFilename()).toBe('decoded.png');

    const savePath = path.join(os.tmpdir(), `base64-tool-download-${Date.now()}.png`);
    await download.saveAs(savePath);
    const saved = fs.readFileSync(savePath);
    expect(saved.equals(TINY_PNG_BUFFER)).toBe(true);
    fs.unlinkSync(savePath);
  });

  test('Download button is disabled until a successful decode', async ({ page }) => {
    await page.getByTestId('mode-decode-btn').click();
    await expect(page.getByTestId('decode-download-btn')).toBeDisabled();
    await page.getByTestId('decode-input').fill('!!! not base64 !!!');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('decode-download-btn')).toBeDisabled();
  });
});

test.describe('decode: invalid input handling', () => {
  test('garbage input shows an inline error, no crash, and the tool recovers on valid input next', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.getByTestId('mode-decode-btn').click();
    const decodeInput = page.getByTestId('decode-input');
    await decodeInput.fill('!!! not base64 !!!');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const errorEl = page.getByTestId('decode-error');
    await expect(errorEl).toBeVisible();
    const errText = await errorEl.textContent();
    expect(errText.length).toBeGreaterThan(0);
    await expect(page.getByTestId('decode-download-btn')).toBeDisabled();
    await expect(page.getByTestId('decode-text-col')).toBeHidden();

    // Recovery: type something valid next.
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('recovered ok'));
    await decodeInput.fill(b64);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(errorEl).toBeHidden();
    await expect(page.getByTestId('decode-text-output')).toHaveValue('recovered ok');
    await expect(page.getByTestId('decode-download-btn')).toBeEnabled();

    expect(pageErrors).toEqual([]);
  });

  test('an odd-length / malformed Base64URL string is rejected cleanly', async ({ page }) => {
    // Length % 4 === 1 after URL-safe normalization is unrecoverable (no
    // valid padding count restores it) -> normalizeBase64/fromBase64Url
    // throws "Invalid Base64URL length."
    const err = await page.evaluate(() => {
      try {
        window.__base64Tool.fromBase64Url('a'); // length 1 -> rem 1 -> unrecoverable
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(err).toMatch(/length/i);

    // Same case through the real decode UI: a URL-safe-flagged string
    // (contains '-') whose length is unrecoverable shows an inline error.
    await page.getByTestId('mode-decode-btn').click();
    await page.getByTestId('decode-input').fill('a-bcd'); // hasUrlSafe, length 5 -> rem 1
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('decode-error')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Large-input guard (PLAN.md § 5/§3): soft warn between 2MB-10MB, hard cap
//    over 10MB for encode files; ~10MB-equivalent Base64 char cap for decode.
//    Synthetic inputs via the exposed `state`/pure-function hooks, per the
//    tester brief ("assert the guard triggers without crashing").
// ---------------------------------------------------------------------------
test.describe('large-input guard', () => {
  test('encode: a file between the soft-warn and hard-cap thresholds succeeds but shows a warning', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    const result = await page.evaluate(async () => {
      const size = 3 * 1024 * 1024; // 3MB: above the 2MB warn line, below the 10MB cap
      const file = new File([new Uint8Array(size)], 'warn.bin', { type: 'application/octet-stream' });
      window.__base64Tool.state.encode.sourceFile = file;
      await window.__base64Tool.renderEncodeOutputs();
      const warningEl = document.querySelector('[data-testid="encode-warning"]');
      const errorEl = document.querySelector('[data-testid="encode-error"]');
      const b64Output = document.querySelector('[data-testid="encode-base64-output"]').value;
      return {
        warningHidden: warningEl.hidden,
        warningText: warningEl.textContent,
        errorHidden: errorEl.hidden,
        outputLength: b64Output.length,
      };
    });

    expect(result.warningHidden).toBe(false);
    expect(result.warningText.length).toBeGreaterThan(0);
    expect(result.errorHidden).toBe(true);
    expect(result.outputLength).toBeGreaterThan(0); // encoding still succeeded
    expect(pageErrors).toEqual([]);
  });

  test('encode: a file over the hard cap is rejected with a clear error, no crash', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    const result = await page.evaluate(async () => {
      const size = 11 * 1024 * 1024; // 11MB: over the 10MB hard cap
      const file = new File([new Uint8Array(size)], 'toobig.bin', { type: 'application/octet-stream' });
      window.__base64Tool.state.encode.sourceFile = file;
      await window.__base64Tool.renderEncodeOutputs();
      const errorEl = document.querySelector('[data-testid="encode-error"]');
      const b64Output = document.querySelector('[data-testid="encode-base64-output"]').value;
      return { errorHidden: errorEl.hidden, errorText: errorEl.textContent, outputLength: b64Output.length };
    });

    expect(result.errorHidden).toBe(false);
    expect(result.errorText).toMatch(/too large/i);
    expect(result.outputLength).toBe(0); // output left empty, not a hung/partial encode
    expect(pageErrors).toEqual([]);

    // The page stays responsive afterward: a normal text encode still works.
    await page.evaluate(() => {
      window.__base64Tool.state.encode.sourceFile = null;
    });
    await page.getByTestId('encode-text-input').fill('still works after the guard fired');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const recovered = await page.getByTestId('encode-base64-output').inputValue();
    expect(recovered.length).toBeGreaterThan(0);
  });

  test('decode: input past the ~10MB-equivalent Base64 char cap is rejected with a clear error, no crash', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    const err = await page.evaluate(() => {
      // 14,000,004 chars: a multiple of 4 (needs no padding, passes charset
      // validation) and just over MAX_DECODE_B64_CHARS (14,000,000).
      const huge = 'A'.repeat(14000004);
      try {
        window.__base64Tool.decodeInput(huge);
        return null;
      } catch (e) {
        return e.message;
      }
    });

    expect(err).toMatch(/too large/i);
    expect(err).toMatch(/limit/i);
    expect(pageErrors).toEqual([]);

    // Page still responsive: a normal decode works right after.
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('still alive'));
    await page.getByTestId('mode-decode-btn').click();
    await page.getByTestId('decode-input').fill(b64);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('decode-text-output')).toHaveValue('still alive');
  });
});

// ---------------------------------------------------------------------------
// 6. data-testid hooks present; window.__base64Tool shape matches PLAN.md;
//    no crypto.randomUUID (grep, source-level).
// ---------------------------------------------------------------------------
test.describe('data-testid hooks + window.__base64Tool API shape', () => {
  const ALL_TESTIDS = [
    'mode-toggle', 'mode-encode-btn', 'mode-decode-btn',
    'encode-section', 'encode-text-input', 'encode-text-copy-btn', 'encode-dropzone', 'encode-file-input',
    'encode-file-info', 'encode-remove-file-btn', 'encode-mime-input', 'encode-mime-copy-btn', 'encode-clear-btn',
    'encode-error', 'encode-warning',
    'encode-base64-col', 'encode-base64-output', 'encode-base64-copy-btn',
    'encode-base64url-col', 'encode-base64url-output', 'encode-base64url-copy-btn',
    'encode-datauri-col', 'encode-datauri-output', 'encode-datauri-copy-btn',
    'encode-snippet-col', 'encode-snippet-output', 'encode-snippet-copy-btn',
    'decode-section', 'decode-input', 'decode-input-copy-btn', 'decode-clear-btn', 'decode-error', 'decode-detected-mime',
    'decode-text-col', 'decode-text-output', 'decode-text-copy-btn',
    'decode-binary-note', 'decode-download-btn',
    'help-button', 'help-overlay', 'help-modal', 'modal-close-x',
  ];

  test('every documented data-testid exists exactly once', async ({ page }) => {
    for (const id of ALL_TESTIDS) {
      const count = await page.locator(`[data-testid="${id}"]`).count();
      expect(count, `data-testid="${id}"`).toBe(1);
    }
  });

  test('window.__base64Tool exposes exactly the documented API shape', async ({ page }) => {
    const keys = await page.evaluate(() => Object.keys(window.__base64Tool).sort());
    const expected = [
      'encodeText', 'decodeText', 'bytesToBase64', 'base64ToBytes',
      'toBase64Url', 'fromBase64Url', 'parseDataUri',
      'normalizeBase64', 'decodeInput', 'extensionForMime',
      'setMode', 'renderEncodeOutputs', 'renderDecodeOutput',
      'state',
    ].sort();
    expect(keys).toEqual(expected);

    const types = await page.evaluate(() => ({
      encodeText: typeof window.__base64Tool.encodeText,
      decodeText: typeof window.__base64Tool.decodeText,
      bytesToBase64: typeof window.__base64Tool.bytesToBase64,
      base64ToBytes: typeof window.__base64Tool.base64ToBytes,
      toBase64Url: typeof window.__base64Tool.toBase64Url,
      fromBase64Url: typeof window.__base64Tool.fromBase64Url,
      parseDataUri: typeof window.__base64Tool.parseDataUri,
      normalizeBase64: typeof window.__base64Tool.normalizeBase64,
      decodeInput: typeof window.__base64Tool.decodeInput,
      extensionForMime: typeof window.__base64Tool.extensionForMime,
      setMode: typeof window.__base64Tool.setMode,
      renderEncodeOutputs: typeof window.__base64Tool.renderEncodeOutputs,
      renderDecodeOutput: typeof window.__base64Tool.renderDecodeOutput,
      state: typeof window.__base64Tool.state,
    }));
    for (const [key, t] of Object.entries(types)) {
      const expectedType = key === 'state' ? 'object' : 'function';
      expect(t, key).toBe(expectedType);
    }
  });

  test('state is a live reference reflecting mode/source-file changes', async ({ page }) => {
    await page.evaluate(() => window.__base64Tool.setMode('decode'));
    expect(await page.evaluate(() => window.__base64Tool.state.mode)).toBe('decode');
    await page.evaluate(() => window.__base64Tool.setMode('encode'));
    expect(await page.evaluate(() => window.__base64Tool.state.mode)).toBe('encode');
  });
});

test.describe('source-level regressions (no crypto.randomUUID)', () => {
  test('index.html never calls crypto.randomUUID (secure-context-only API)', () => {
    const src = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
    expect(src).not.toMatch(/crypto\.randomUUID/);
  });
});

// ---------------------------------------------------------------------------
// 7. localStorage persistence — docs/conventions.md § "Persist UI state
// (localStorage)" (hat-picker is the exemplar). Versioned key
// "base64-tool:v1". Only the mode + the two raw text inputs (encode
// text-input, decode input) are persisted — never the uploaded file's bytes,
// and never the four encode outputs / decoded output, which are DERIVED and
// must be RECOMPUTED fresh from the restored text on reload.
// ---------------------------------------------------------------------------
test.describe('localStorage persistence', () => {
  const STORAGE_KEY = 'base64-tool:v1';
  const ENCODE_SAMPLE = 'persisted encode café 😀';
  const DECODE_SAMPLE_TEXT = 'persisted decode text';
  const DECODE_SAMPLE_B64 = Buffer.from(DECODE_SAMPLE_TEXT, 'utf-8').toString('base64');

  test('mode + text-input changes write the versioned key; reload restores mode + inputs with correctly re-derived outputs', async ({ page }) => {
    // Type encode text (default mode is 'encode' already).
    await page.getByTestId('encode-text-input').fill(ENCODE_SAMPLE);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(stored.mode).toBe('encode');
    expect(stored.encodeText).toBe(ENCODE_SAMPLE);
    expect(stored.decodeText).toBe('');
    // Derived output is never stored — only the raw source text.
    expect(stored).not.toHaveProperty('encodeBase64');
    expect(stored).not.toHaveProperty('outputs');

    const expectedEncodeBase64 = await page.evaluate(
      (s) => window.__base64Tool.encodeText(s),
      ENCODE_SAMPLE
    );
    await expect(page.getByTestId('encode-base64-output')).toHaveValue(expectedEncodeBase64);

    // Switch to Decode mode and type known Base64 — this is also a mode
    // toggle, which saves immediately (no debounce needed for that part).
    await page.getByTestId('mode-decode-btn').click();
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.mode).toBe('decode');
    // The encode text survives the mode switch (still the source of truth
    // for the encode tab, even while it's hidden).
    expect(stored.encodeText).toBe(ENCODE_SAMPLE);

    await page.getByTestId('decode-input').fill(DECODE_SAMPLE_B64);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.decodeText).toBe(DECODE_SAMPLE_B64);

    await expect(page.getByTestId('decode-text-output')).toHaveValue(DECODE_SAMPLE_TEXT);

    // Reload: restore-on-load must repopulate the mode + both text inputs
    // AND re-run encode/decode so the derived outputs reappear, exactly as
    // if the user had just typed them (nothing derived is read back from
    // storage — it's recomputed from the restored raw text).
    await page.reload();
    await page.waitForFunction(() => window.__base64Tool && window.__base64Tool.state);

    // Decode mode was the last-saved mode, so it should be what's shown.
    await expect(page.getByTestId('mode-decode-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('decode-section')).toBeVisible();
    await expect(page.getByTestId('encode-section')).toBeHidden();
    await expect(page.getByTestId('decode-input')).toHaveValue(DECODE_SAMPLE_B64);
    await expect(page.getByTestId('decode-text-output')).toHaveValue(DECODE_SAMPLE_TEXT);

    // Switch back to Encode to confirm its restored text + re-derived
    // output are correct too (proves both tabs' state survived the reload,
    // not just the currently-visible one).
    await page.getByTestId('mode-encode-btn').click();
    await expect(page.getByTestId('encode-text-input')).toHaveValue(ENCODE_SAMPLE);
    await expect(page.getByTestId('encode-base64-output')).toHaveValue(expectedEncodeBase64);
  });

  test('Clear buttons persist the emptied text; an empty tool persists empty strings', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill(ENCODE_SAMPLE);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.encodeText).toBe(ENCODE_SAMPLE);

    await page.getByTestId('encode-clear-btn').click();
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.encodeText).toBe('');

    await page.getByTestId('mode-decode-btn').click();
    await page.getByTestId('decode-input').fill(DECODE_SAMPLE_B64);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await page.getByTestId('decode-clear-btn').click();
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.decodeText).toBe('');

    // Reload with everything cleared: restores to the same empty state, not
    // stuck showing stale pre-clear text.
    await page.reload();
    await page.waitForFunction(() => window.__base64Tool && window.__base64Tool.state);
    await expect(page.getByTestId('encode-text-input')).toHaveValue('');
    await expect(page.getByTestId('decode-input')).toHaveValue('');
    await expect(page.getByTestId('encode-base64-output')).toHaveValue('');
  });

  test('degrades gracefully when localStorage throws on every read/write: no crash, tool starts empty and stays fully usable', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Simulate a browser/context where localStorage access throws (private
    // mode, restrictive policy, quota) — per docs/conventions.md, every
    // read/write must be try/catch-wrapped and the tool must work fully with
    // no stored state. Overriding Storage.prototype (rather than deleting or
    // reassigning `window.localStorage`, which some engines make
    // non-configurable) reliably intercepts every localStorage.setItem/
    // getItem call this page's script makes.
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new Error('blocked'); };
      Storage.prototype.getItem = function () { throw new Error('blocked'); };
    });
    // The top-level beforeEach already navigated before this init script was
    // registered; reload so it actually applies to this load.
    await page.reload();

    // Sanity-check the simulation actually took effect before trusting the
    // rest of the assertions.
    const threw = await page.evaluate(() => {
      try { localStorage.setItem('x', '1'); return false; } catch { return true; }
    });
    expect(threw).toBe(true);

    await page.waitForFunction(() => window.__base64Tool && window.__base64Tool.state);
    expect(pageErrors).toEqual([]); // load produced no uncaught exception

    // No stored state was readable -> starts empty/encode mode, same as
    // today with no localStorage support at all.
    await expect(page.getByTestId('mode-encode-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('encode-text-input')).toHaveValue('');
    await expect(page.getByTestId('encode-base64-output')).toHaveValue('');

    // Normal interaction (mode switch, typing, Clear) still works
    // end-to-end without throwing up the call stack — saveState()/
    // loadState() swallow the localStorage error every time.
    await page.getByTestId('encode-text-input').fill(ENCODE_SAMPLE);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const expectedEncodeBase64 = await page.evaluate(
      (s) => window.__base64Tool.encodeText(s),
      ENCODE_SAMPLE
    );
    await expect(page.getByTestId('encode-base64-output')).toHaveValue(expectedEncodeBase64);

    await page.getByTestId('mode-decode-btn').click();
    await page.getByTestId('decode-input').fill(DECODE_SAMPLE_B64);
    await page.waitForTimeout(DEBOUNCE_WAIT);
    await expect(page.getByTestId('decode-text-output')).toHaveValue(DECODE_SAMPLE_TEXT);

    await page.getByTestId('decode-clear-btn').click();
    await expect(page.getByTestId('decode-input')).toHaveValue('');

    expect(pageErrors).toEqual([]); // still no uncaught exceptions after a full interaction pass
  });
});

// ---------------------------------------------------------------------------
// 8. Mobile (~375x667, dpr2, touch): real taps/clicks (not hooks) to switch
//    mode, type/encode, copy; no horizontal overflow at 375/360px; ~44px tap
//    targets; elementFromPoint overlay hit-test guard.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  test('real tap: switch to Decode and back updates aria-pressed and visible section', async ({ page }) => {
    const encodeBtn = page.getByTestId('mode-encode-btn');
    const decodeBtn = page.getByTestId('mode-decode-btn');

    await decodeBtn.tap();
    await expect(decodeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(encodeBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('decode-section')).toBeVisible();
    await expect(page.getByTestId('encode-section')).toBeHidden();

    await encodeBtn.tap();
    await expect(encodeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('encode-section')).toBeVisible();
  });

  test('real tap + type: encoding text produces correct live outputs on mobile', async ({ page }) => {
    const input = page.getByTestId('encode-text-input');
    await input.tap();
    await input.fill('mobile encode café 😀');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const expected = await page.evaluate(() => window.__base64Tool.encodeText('mobile encode café 😀'));
    await expect(page.getByTestId('encode-base64-output')).toHaveValue(expected);
  });

  test('real tap on a copy button shows check feedback', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill('tap to copy');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const btn = page.getByTestId('encode-base64-copy-btn');
    await btn.tap();
    await expect(btn).toHaveText('✅');
  });

  test('no horizontal page overflow at 375px with all encode outputs populated', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill('overflow check café 😀 你好');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('no horizontal overflow down to ~360px, including the decode section', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.getByTestId('mode-decode-btn').tap();
    const b64 = await page.evaluate(() => window.__base64Tool.encodeText('narrow viewport check'));
    await page.getByTestId('decode-input').fill(b64);
    await page.waitForTimeout(DEBOUNCE_WAIT);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('primary single-line controls meet the ~44px tap-target minimum', async ({ page }) => {
    await page.getByTestId('encode-text-input').fill('tap target check');
    await page.waitForTimeout(DEBOUNCE_WAIT);

    // Single-line controls carry the shared --control-h (44px) from
    // controls.css; the dropzone keeps its own 44px min. The in-field
    // MULTILINE copy icons are intentionally compact (they sit inside a large
    // tap-friendly field, not as standalone tap targets) — see the "in-field
    // copy convention" suite for their placement/behavior; only the single-line
    // MIME field's copy icon is a full-height 44px control.
    for (const testid of [
      'mode-encode-btn', 'mode-decode-btn', 'encode-clear-btn',
      'encode-mime-input', 'encode-mime-copy-btn', 'encode-dropzone',
    ]) {
      const box = await page.getByTestId(testid).boundingBox();
      // expect.soft: report every control's measurement rather than aborting
      // the test (and skipping the rest) at the first one under 44px.
      expect.soft(box.height, `${testid} height`).toBeGreaterThanOrEqual(44);
    }
  });

  // Lower-level hit-test guard (the lesson from a sibling tool's regression:
  // a passing functional test still missed a real overlay covering a
  // control). Verifies via document.elementFromPoint that nothing sits on
  // top of a primary button at mobile size.
  test('no overlay intercepts hit-testing on the mode-encode-btn or a copy button', async ({ page }) => {
    async function isHitByOwnControl(locator) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      return locator.evaluate(
        (el, { x, y, w, h }) => {
          const hit = document.elementFromPoint(x + w / 2, y + h / 2);
          return !!hit && (hit === el || el.contains(hit));
        },
        { x: box.x, y: box.y, w: box.width, h: box.height }
      );
    }

    await page.getByTestId('encode-text-input').fill('hit test');
    await page.waitForTimeout(DEBOUNCE_WAIT);
    expect(await isHitByOwnControl(page.getByTestId('mode-encode-btn'))).toBe(true);
    expect(await isHitByOwnControl(page.getByTestId('encode-base64-copy-btn'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. First-load Help popup — docs/conventions.md § "First-load help popup
//    (all tools)". Auto-shows exactly once on a genuinely fresh visit
//    (localStorage key "base64-tool:help-seen:v1" absent), never again after
//    that, and is otherwise reachable only via the Help (?) button. Every
//    other test in this file pre-seeds the key via the shared beforeEach
//    above so the modal never interferes with unrelated assertions — the
//    "genuine first visit" case below deliberately opts out of that by
//    using its own fresh browser.newContext(), which starts with no
//    localStorage at all.
// ---------------------------------------------------------------------------
test.describe('first-load Help popup', () => {
  test('auto-shows on a genuine first visit (fresh context, no pre-seeded key)', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const freshPage = await context.newPage();
      await freshPage.goto(TOOL_URL);

      const overlay = freshPage.getByTestId('help-overlay');
      await expect(overlay).toBeVisible();
      await expect(freshPage.getByTestId('help-modal')).toBeVisible();
      // Initial focus moves to the top-right ✕ (the sole dedicated close control).
      await expect(freshPage.getByTestId('modal-close-x')).toBeFocused();

      // The seen-flag is now persisted, so a reload of the SAME context does
      // not auto-show it again.
      await freshPage.reload();
      await expect(overlay).toBeHidden();
      const stored = await freshPage.evaluate(
        (key) => window.localStorage.getItem(key),
        HELP_SEEN_KEY
      );
      expect(stored).toBe('1');
    } finally {
      await context.close();
    }
  });

  test('does not auto-show on a subsequent visit (pre-seeded help-seen key)', async ({ page }) => {
    // `page` here comes from the shared beforeEach, which already pre-seeds
    // HELP_SEEN_KEY before navigating — i.e. this is the "already seen"
    // case the auto-show guard must respect.
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });

  test('opens via the Help (?) button, with initial focus on the ✕', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeHidden();

    await page.getByTestId('help-button').click();
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId('help-modal')).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('help-modal')).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('Escape closes it and returns focus to the Help button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('backdrop click closes it and returns focus to the Help button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    const overlay = page.getByTestId('help-overlay');
    await helpButton.click();
    await expect(overlay).toBeVisible();

    // Click a corner of the overlay, well outside the centered dialog.
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('the top-right ✕ closes it and returns focus to the Help button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await helpButton.click();
    await expect(overlay).toBeVisible();

    const closeX = dialog.getByTestId('modal-close-x');
    await expect(closeX).toHaveAttribute('aria-label', 'Close');
    await closeX.click();
    await expect(overlay).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('focus is trapped inside the dialog while open (Tab/Shift+Tab stay on the ✕, the sole focusable control)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const dialog = page.getByTestId('help-modal');
    const closeX = dialog.getByTestId('modal-close-x');
    // Initial focus is on the ✕ — it's the only focusable control left in
    // the dialog now that the bottom Close button is gone.
    await expect(closeX).toBeFocused();

    // Tab and Shift+Tab both wrap right back to the ✕.
    await page.keyboard.press('Tab');
    await expect(closeX).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeX).toBeFocused();

    // Focus never escapes to something behind the modal (e.g. the mode
    // toggle) while it's open.
    await expect(page.getByTestId('mode-encode-btn')).not.toBeFocused();
  });

  test('the overlay computes to display:none when closed (the [hidden] cascade trap)', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    // Closed by default here (pre-seeded help-seen).
    expect(
      await overlay.evaluate((el) => getComputedStyle(el).display)
    ).toBe('none');

    await page.getByTestId('help-button').click();
    expect(
      await overlay.evaluate((el) => getComputedStyle(el).display)
    ).not.toBe('none');

    await page.getByTestId('modal-close-x').click();
    expect(
      await overlay.evaluate((el) => getComputedStyle(el).display)
    ).toBe('none');
  });

  test('the Help button and dialog ✕ use touch-action: manipulation', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const helpButtonTouchAction = await page
      .getByTestId('help-button')
      .evaluate((el) => getComputedStyle(el).touchAction);
    const closeXTouchAction = await page
      .getByTestId('modal-close-x')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(helpButtonTouchAction).toBe('manipulation');
    expect(closeXTouchAction).toBe('manipulation');
  });

  test('opens scrolled to the top even when its content overflows (initial focus must not scroll the dialog)', async ({ page }) => {
    // Shrink the viewport so the help content overflows the dialog's
    // max-height, then open it — a bug where initial focus moved somewhere
    // scrolled out of view would let the browser scroll the panel to reveal
    // it, opening the modal scrolled away from the top.
    await page.setViewportSize({ width: 375, height: 400 });
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await page.getByTestId('help-button').click();
    await expect(overlay).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('the page (html) uses touch-action: manipulation so double-tap does not zoom', async ({ page }) => {
    const touchAction = await page.evaluate(
      () => getComputedStyle(document.documentElement).touchAction
    );
    expect(touchAction).toBe('manipulation');
  });
});

// ---------------------------------------------------------------------------
// Shared License modal (src/tools/include/license.js, inlined via the shared
// footer.html). The footer "MIT License" link opens an accessible modal
// (role=dialog, focus trap, ✕/Esc/backdrop close, focus return). base64-tool
// bundles no third-party libraries, so the modal shows the "100% vanilla"
// note rather than a dependency list.
// ---------------------------------------------------------------------------
test.describe('shared License modal', () => {
  test('the footer License link opens the modal with MIT text, the ✕, and the no-dependencies note', async ({ page }) => {
    const overlay = page.getByTestId('license-overlay');
    const trigger = page.getByTestId('footer-license-link');
    await expect(trigger).toHaveText('MIT License');

    await trigger.click();

    const modal = page.getByTestId('license-modal');
    await expect(overlay).toBeVisible();
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toContainText('MIT License');

    const closeX = modal.getByTestId('license-close-x');
    await expect(closeX).toBeVisible();
    await expect(closeX).toHaveAttribute('aria-label', 'Close');

    // No bundled deps → the vanilla / no-runtime-dependencies note.
    await expect(modal).toContainText('100% vanilla');
    await expect(modal).toContainText('no runtime dependencies');
  });

  // Focus trap + Esc / ✕ / backdrop close + focus-return are the shared
  // License-modal contract; assert them via the shared helper.
  test('opens, is an accessible dialog with the ✕ focused, and closes via Esc / ✕ / backdrop with focus return', async ({ page }) => {
    await assertLicenseModal(page);
  });
});
