// @playwright/test spec for tools/http-headers/index.html (file://, no server).
// Drives the real UI through data-testid hooks; run: npm run test:e2e (--workers=1).
import { test, expect } from '@playwright/test';
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../../lib/test-support/setup.mjs';
import { assertLicenseModal } from '../../../lib/test-support/shared-ui.mjs';
import { assertRovingTabs, trackPageErrors } from '../../../lib/test-support/interaction.mjs';
import { stubClipboard, readClipboard } from '../../../lib/test-support/clipboard.mjs';
import { readStored, settleStorage } from '../../../lib/test-support/storage.mjs';

const TOOL_URL = toolUrl(import.meta.url);
const STORAGE_KEY = 'http-headers:v1';
let pageErrors;
let consoleErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = trackPageErrors(page);
  consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await seedHelpSeen(page, helpSeenKey('http-headers'));
  await page.goto(TOOL_URL);
});
test.afterEach(() => {
  pageErrors.assertNone();
  expect(consoleErrors).toEqual([]);
});

const tab = (page, name) => page.getByTestId(`tab-${name}`);
const status = (page, id) => page.locator(`[data-testid="check-item"][data-check="${id}"]`).getAttribute('data-status');

test('initial state: Input tab selected, empty prompt, no console errors', async ({ page }) => {
  await expect(tab(page, 'input')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('panel-input')).toBeVisible();
  await expect(page.getByTestId('panel-explain')).toBeHidden();
  await expect(page.getByTestId('parse-summary')).toContainText('Paste a header block');
});

test('load sample response: parse summary, cards render with known/unknown + issues', async ({ page }) => {
  await page.getByTestId('load-sample-response').click();
  await expect(page.getByTestId('raw-input')).toHaveValue(/HTTP\/2 200/);
  await expect(page.getByTestId('parse-summary')).toContainText('Parsed 13 headers as response (HTTP/2 200)');
  await tab(page, 'explain').click();
  await expect(page.getByTestId('panel-explain')).toBeVisible();
  // 12 distinct names: set-cookie appears twice
  await expect(page.getByTestId('card')).toHaveCount(12);
  const cc = page.locator('[data-testid="card"][data-header="cache-control"]');
  await expect(cc).toContainText('Cache-Control: public, max-age=3600');
  await expect(cc).toContainText('no-cache means');
  await expect(cc).toContainText('RFC 9111 5.2');
  const sc = page.locator('[data-testid="card"][data-header="set-cookie"]');
  await expect(sc).toContainText('x2');
  await expect(sc).toContainText('SameSite=None requires Secure');
  await expect(page.locator('[data-testid="card"][data-header="x-xss-protection"]')).toContainText('deprecated');
  // filter to cards with issues
  await page.getByTestId('filter-issues').click();
  const n = await page.getByTestId('card').count();
  expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(12);
  await expect(page.locator('[data-testid="card"][data-has-issues="false"]')).toHaveCount(0);
});

test('paste -> live re-parse; custom header gets a generic card', async ({ page }) => {
  await page.getByTestId('raw-input').fill('HTTP/1.1 200 OK\nX-Custom-Thing: 42\nContent-Type : text/html');
  await expect(page.getByTestId('parse-summary')).toContainText('Parsed 2 headers as response');
  await expect(page.getByTestId('parse-banner')).toBeVisible();
  await expect(page.getByTestId('parse-issues')).toContainText('whitespace between');
  await tab(page, 'explain').click();
  await expect(page.locator('[data-testid="card"][data-header="x-custom-thing"]')).toHaveAttribute('data-known', 'false');
});

test('checklist statuses for the sample response', async ({ page }) => {
  await page.getByTestId('load-sample-response').click();
  await tab(page, 'checklist').click();
  expect(await status(page, 'hsts')).toBe('warn');          // max-age=300
  expect(await status(page, 'csp')).toBe('fail');
  expect(await status(page, 'xcto')).toBe('pass');
  expect(await status(page, 'cors')).toBe('fail');           // * + credentials
  expect(await status(page, 'cookie:0')).toBe('warn');
  expect(await status(page, 'cookie:1')).toBe('pass');
  expect(await status(page, 'deprecated:x-xss-protection')).toBe('warn');
  expect(await status(page, 'disclosure')).toBe('warn');
  await expect(page.getByTestId('checklist-summary')).toHaveText(/\d+ pass · \d+ warn · [1-9]\d* fail · \d+ info/);
});

test('checklist: request is explained, override flips it on', async ({ page }) => {
  await page.getByTestId('load-sample-request').click();
  await tab(page, 'checklist').click();
  await expect(page.getByTestId('checklist-empty')).toContainText('applies to responses');
  await expect(page.getByTestId('check-item')).toHaveCount(0);
  await tab(page, 'input').click();
  await page.getByTestId('kind-response').click();
  await tab(page, 'checklist').click();
  await expect(page.getByTestId('check-item').first()).toBeVisible();
});

test('redirect chain: message selector switches analysed block', async ({ page }) => {
  await page.getByTestId('raw-input').fill('HTTP/1.1 301 Moved\nLocation: /b\n\nHTTP/1.1 200 OK\nServer: z');
  await expect(page.getByTestId('block-wrap')).toBeVisible();
  await expect(page.getByTestId('parse-summary')).toContainText('(HTTP/1.1 200 OK)');
  await page.getByTestId('block-select').selectOption('0');
  await expect(page.getByTestId('parse-summary')).toContainText('(HTTP/1.1 301 Moved)');
});

test('copy: card, checklist fix, and built block reach the clipboard', async ({ page }) => {
  await stubClipboard(page);
  await page.getByTestId('load-sample-response').click();
  await tab(page, 'explain').click();
  await page.locator('[data-testid="card"][data-header="etag"] [data-testid="copy-card"]').click();
  expect(await readClipboard(page)).toBe('ETag: "33a64df5"');
  await tab(page, 'checklist').click();
  await page.locator('[data-check="csp"] [data-testid="copy-fix"]').click();
  expect(await readClipboard(page)).toContain("Content-Security-Policy: default-src 'self'");
  await tab(page, 'build').click();
  await page.getByTestId('preset-static').click();
  await page.getByTestId('copy-build').click();
  const out = await readClipboard(page);
  expect(out).toContain('Strict-Transport-Security: max-age=63072000; includeSubDomains');
  expect(out).toContain('X-Content-Type-Options: nosniff');
});

test('builder: preset fills controls + output, snippet formats, custom rows, analyze round trip', async ({ page }) => {
  await tab(page, 'build').click();
  await expect(page.getByTestId('build-out')).toHaveText('');
  await page.getByTestId('preset-api').click();
  await expect(page.getByTestId('opt-hsts')).toBeChecked();
  await expect(page.getByTestId('opt-csp')).toHaveValue('api');
  await expect(page.getByTestId('build-out')).toContainText('Access-Control-Allow-Origin: https://app.example.com');
  await expect(page.getByTestId('build-out')).toContainText('Vary: Origin');
  await page.getByTestId('opt-hsts').uncheck();
  await expect(page.getByTestId('build-out')).not.toContainText('Strict-Transport-Security');
  await page.getByTestId('add-custom').click();
  await page.getByTestId('custom-name').fill('X-Team');
  await page.getByTestId('custom-value').fill('platform');
  await expect(page.getByTestId('build-out')).toContainText('X-Team: platform');
  await page.getByTestId('fmt-nginx').click();
  await expect(page.getByTestId('build-out')).toContainText('add_header X-Team "platform" always;');
  await page.getByTestId('fmt-raw').click();
  await page.getByTestId('opt-hsts').check();
  await page.getByTestId('build-analyze').click();
  await expect(tab(page, 'checklist')).toHaveAttribute('aria-selected', 'true');
  expect(await status(page, 'hsts')).toBe('pass');
  expect(await status(page, 'csp')).toBe('pass');
  await expect(page.getByTestId('checklist-summary')).toHaveText(/ 0 fail /);
});

test('builder: download .txt', async ({ page }) => {
  await tab(page, 'build').click();
  await page.getByTestId('preset-static').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('build-download').click()]);
  expect(dl.suggestedFilename()).toBe('headers.txt');
});

test('tab keyboard navigation (roving tabindex, arrows, Home/End)', async ({ page }) => {
  await assertRovingTabs(page, { tabs: ['tab-input', 'tab-explain', 'tab-checklist', 'tab-build'] });
});

test('persistence: input + tab + options survive reload; secrets are redacted in storage', async ({ page }) => {
  const text = 'HTTP/1.1 200 OK\nServer: nginx\nSet-Cookie: sid=TOPSECRET; Path=/\nAuthorization: Bearer TOPSECRET\nCookie: a=TOPSECRET';
  await page.getByTestId('raw-input').fill(text);
  await tab(page, 'explain').click();
  await page.getByTestId('filter-issues').click();
  await tab(page, 'build').click();
  await page.getByTestId('preset-spa').click();
  await settleStorage(page, STORAGE_KEY, { predicate: (s) => s && s.tab === 'build' && JSON.parse(s.build).csp === 'spa' });
  const raw = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(raw).not.toContain('TOPSECRET');
  expect(raw).toContain('[redacted]');
  const stored = await readStored(page, STORAGE_KEY);
  expect(stored.input).toContain('Server: nginx');
  await page.reload();
  await expect(tab(page, 'build')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('opt-csp')).toHaveValue('spa');
  await tab(page, 'input').click();
  await expect(page.getByTestId('raw-input')).toHaveValue(/Server: nginx/);
  await expect(page.getByTestId('raw-input')).not.toHaveValue(/TOPSECRET/);
  await expect(page.getByTestId('raw-input')).toHaveValue(/Set-Cookie: \[redacted\]/);
  await tab(page, 'checklist').click();
  expect(await status(page, 'cookie:0')).toBe('info');
});

test('shared License modal opens from the footer', async ({ page }) => {
  await assertLicenseModal(page);
});

test('help button opens the help dialog', async ({ page }) => {
  await page.getByTestId('help-button').click();
  await expect(page.getByTestId('help-modal')).toBeVisible();
  await expect(page.getByTestId('help-modal')).toContainText('nothing is sent anywhere');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help-modal')).toBeHidden();
});
