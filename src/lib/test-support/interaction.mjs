// test-support/interaction.mjs — interaction / lifecycle e2e helpers.
//
// Dev/test-only ESM, IMPORTED by a tool's tests/*.e2e.mjs. Dependency-free ON
// PURPOSE (same rule as shared-ui.mjs): uses only the Playwright `page` /
// `browser` / locator objects passed in and never imports @playwright/test, so
// it resolves from this shared dir and drives the caller tool's own Playwright.
// Assertion helpers THROW on failure (Playwright reports the throw as a test
// failure). Distilled from the ad-hoc copies in the tools' suites; see
// PROVENANCE.md (#6 #7 #10 #12 #18 #19).
//
//   import { waitForToolReady, trackPageErrors, assertHookShape, driveHook,
//            assertModalA11y, assertHelpAutoShows, assertConfirmDialog,
//            assertDropDispatch, assertRovingTabs, TINY_PNG_B64 }
//     from '../../test-support/interaction.mjs';

function fail(msg) { throw new Error(msg); }

// A canonical, valid 1×1 PNG (base64). Used as the payload for synthetic file
// drops — small, real, and accepted by image loaders.
export const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// assertDropDispatch(page, { selector, dragClass, fileCount, fileName, mime, b64 })
//   — the drop-path contract for a `wireDropzone` (CtComponents)-wired element, driven
// by REAL synthetic DnD events (the path `setInputFiles` / test hooks never
// exercise). Dispatches, on the element matched by `selector`:
//   dragenter → dragleave → dragover → drop
// with a genuine `DataTransfer` + `FileList` (fileCount valid files), and
// asserts the full contract:
//   - dragenter ADDS `dragClass`; dragleave REMOVES it
//   - dragover is preventDefault'd (dispatchEvent → false; no browser navigation)
//   - drop is preventDefault'd AND the dropped FileList (fileCount files) reaches
//     the zone (observed via a capture-phase spy before the handler runs)
//   - drop REMOVES `dragClass`
// Works on initially-hidden zones (synthetic events fire on attached-but-hidden
// nodes; it waits for `state: 'attached'`, not visibility). Returns the observed
// `{ seenFiles }`. Throws (→ Playwright test failure) on any contract breach, so
// a wireDropzone regression — a dropped preventDefault, a missing class toggle,
// or an onFiles that never sees the files — turns the suite red.
export async function assertDropDispatch(page, {
  selector,
  dragClass,
  fileCount = 1,
  fileName = 'drop.png',
  mime = 'image/png',
  b64 = TINY_PNG_B64,
} = {}) {
  if (!selector) fail('assertDropDispatch: `selector` is required');
  if (!dragClass) fail('assertDropDispatch: `dragClass` is required');
  await page.waitForSelector(selector, { state: 'attached', timeout: 5000 });

  const out = await page.evaluate((args) => {
    const { selector, dragClass, fileCount, fileName, mime, b64 } = args;
    const zone = document.querySelector(selector);
    if (!zone) return { exists: false };

    const fire = (type, dt) => {
      const ev = new DragEvent(type, {
        bubbles: true, cancelable: true, dataTransfer: dt || new DataTransfer(),
      });
      return zone.dispatchEvent(ev); // false iff a listener called preventDefault
    };

    // 1. dragenter adds the class; 2. dragleave removes it.
    fire('dragenter');
    const afterEnter = zone.classList.contains(dragClass);
    fire('dragleave');
    const afterLeave = zone.classList.contains(dragClass);

    // 3. dragover is preventDefault'd.
    const overReturn = fire('dragover');

    // 4. a real DataTransfer carrying `fileCount` valid files.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dot = fileName.lastIndexOf('.');
    const stem = dot === -1 ? fileName : fileName.slice(0, dot);
    const ext = dot === -1 ? '' : fileName.slice(dot);
    const dt = new DataTransfer();
    for (let i = 0; i < fileCount; i++) {
      const name = fileCount > 1 ? `${stem}-${i + 1}${ext}` : fileName;
      dt.items.add(new File([bytes], name, { type: mime }));
    }

    // capture-phase spy: confirm the FileList reaches the zone on drop.
    let seenFiles = -1;
    const spy = (e) => {
      seenFiles = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files.length : -1;
    };
    zone.addEventListener('drop', spy, { capture: true });
    const dropReturn = zone.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
    zone.removeEventListener('drop', spy, { capture: true });
    const afterDropClass = zone.classList.contains(dragClass);

    return {
      exists: true,
      afterEnter, afterLeave,
      dragoverPrevented: overReturn === false,
      dropPrevented: dropReturn === false,
      seenFiles, afterDropClass,
    };
  }, { selector, dragClass, fileCount, fileName, mime, b64 });

  if (!out.exists) fail(`assertDropDispatch: no element matches ${JSON.stringify(selector)}`);
  if (out.afterEnter !== true) fail(`dragenter did not add .${dragClass} to ${selector}`);
  if (out.afterLeave !== false) fail(`dragleave did not remove .${dragClass} from ${selector}`);
  if (out.dragoverPrevented !== true) fail(`dragover was not preventDefault'd on ${selector} (would let the browser navigate)`);
  if (out.dropPrevented !== true) fail(`drop was not preventDefault'd on ${selector} (would let the browser navigate)`);
  if (out.seenFiles !== fileCount) fail(`dropped FileList reached ${selector} with ${out.seenFiles} file(s), expected ${fileCount}`);
  if (out.afterDropClass !== false) fail(`drop did not remove .${dragClass} from ${selector}`);
  return { seenFiles: out.seenFiles };
}

// assertRovingTabs(page, { tabs, horizontal }) — the APG tablist keyboard
// contract for a `wireTabs` (CtComponents)-wired tablist. `tabs` is the ordered list of
// the tablist's tab `data-testid`s (all of them, in DOM order). Focuses the
// first tab, then drives Arrow (next/prev, wrapping), Home and End, asserting at
// every step that the moved-to tab — and ONLY it — is `aria-selected="true"`,
// holds DOM focus, and carries the roving `tabIndex` 0 (every other tab is
// unselected with `tabIndex` -1). Click + aria-selected is usually the only
// thing a tool's own suite pins; this pins the keyboard roving so a wireTabs
// kbnav regression (a dropped Arrow handler, a stuck tabIndex) turns red.
export async function assertRovingTabs(page, { tabs, horizontal = true } = {}) {
  if (!Array.isArray(tabs) || tabs.length < 2) fail('assertRovingTabs: `tabs` needs >= 2 testids');
  const fwd = horizontal ? 'ArrowRight' : 'ArrowDown';
  const back = horizontal ? 'ArrowLeft' : 'ArrowUp';
  const loc = (id) => page.getByTestId(id);

  // Exactly `id` is selected + focused + tabIndex 0; all others unselected + -1.
  const assertActive = async (id) => {
    for (const t of tabs) {
      const want = t === id;
      const el = loc(t);
      const sel = await el.getAttribute('aria-selected');
      const ti = await el.evaluate((n) => n.tabIndex);
      if ((sel === 'true') !== want) fail(`aria-selected on ${t}: expected ${want}, got ${JSON.stringify(sel)}`);
      if ((ti === 0) !== want) fail(`roving tabIndex on ${t}: expected ${want ? 0 : -1}, got ${ti}`);
    }
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-testid'));
    if (focused !== id) fail(`keyboard focus expected on ${id}, got ${JSON.stringify(focused)}`);
  };

  await loc(tabs[0]).focus();
  await assertActive(tabs[0]);

  // Forward through each tab, then wrap past the last back to the first.
  for (let i = 1; i < tabs.length; i++) {
    await page.keyboard.press(fwd);
    await assertActive(tabs[i]);
  }
  await page.keyboard.press(fwd);
  await assertActive(tabs[0]);

  // Backward from the first wraps to the last.
  await page.keyboard.press(back);
  await assertActive(tabs[tabs.length - 1]);

  // Home jumps to the first, End to the last.
  await page.keyboard.press('Home');
  await assertActive(tabs[0]);
  await page.keyboard.press('End');
  await assertActive(tabs[tabs.length - 1]);
}

async function waitFocused(page, testId) {
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-testid') === id,
    testId,
  );
}

async function assertAttr(locator, name, expected) {
  const actual = await locator.getAttribute(name);
  if (actual !== expected) {
    fail(`expected [${name}="${expected}"], got ${JSON.stringify(actual)}`);
  }
}

// waitForToolReady(page, ns, { prop = 'state', timeout }) — poll until the tool's
// test namespace `window[ns]` exists AND `window[ns][prop]` is truthy (pass
// prop = null to wait for the namespace alone). Use after goto()/reload().
export async function waitForToolReady(page, ns, { prop = 'state', timeout } = {}) {
  const opts = timeout === undefined ? undefined : { timeout };
  await page.waitForFunction(
    ([n, p]) => !!window[n] && (p == null || !!window[n][p]),
    [ns, prop],
    opts,
  );
}

// trackPageErrors(page) -> { errors, assertNone() }. Starts collecting uncaught
// page exceptions immediately; `errors` is a live array of message strings.
// assertNone() throws listing them if any were seen.
export function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
  return {
    errors,
    assertNone() {
      if (errors.length) fail(`uncaught page errors: ${JSON.stringify(errors)}`);
    },
  };
}

// assertHookShape(page, ns, keys) — assert `window[ns]` exposes the documented
// members. `keys` is an array of member names (must exist) or an object
// { name: 'function' | 'object' | 'bigint' | ... } checked with typeof.
export async function assertHookShape(page, ns, keys) {
  const wanted = Array.isArray(keys) ? Object.fromEntries(keys.map((k) => [k, null])) : keys;
  const shape = await page.evaluate((n) => {
    const api = window[n];
    if (!api) return null;
    const t = {};
    for (const k of Object.keys(api)) t[k] = typeof api[k];
    return t;
  }, ns);
  if (!shape) fail(`window.${ns} is not defined`);
  for (const [k, type] of Object.entries(wanted)) {
    if (!(k in shape)) fail(`window.${ns}.${k} is missing`);
    if (type && shape[k] !== type) fail(`window.${ns}.${k}: expected ${type}, got ${shape[k]}`);
  }
  return shape;
}

// driveHook(page, ns, method, ...args) — call `window[ns][method](...args)` in
// the page and return its (serializable) result. Args must be serializable.
export function driveHook(page, ns, method, ...args) {
  return page.evaluate(
    ([n, m, a]) => window[n][m](...a),
    [ns, method, args],
  );
}

// assertModalA11y(page, opts) — the full a11y contract of a content modal:
// opens from the trigger; role=dialog, aria-modal=true (aria-labelledby when
// `labelledBy` given); focus lands on the ✕; Tab / Shift+Tab keep focus inside
// the dialog; clicking inside doesn't close; Esc, the ✕ and a backdrop click
// each close it and return focus to the trigger (pass backdropFocusReturn:false
// for a tool whose backdrop-close doesn't restore focus — it must still close). Assumes the page is loaded and
// the modal closed. Defaults target the shared Help modal.
export async function assertModalA11y(page, {
  trigger = 'help-button',
  overlay = 'help-overlay',
  modal = 'help-modal',
  closeX = 'modal-close-x',
  labelledBy,
  backdropFocusReturn = true,
} = {}) {
  const trig = page.getByTestId(trigger);
  const ov = page.getByTestId(overlay);
  const dlg = page.getByTestId(modal);
  const x = dlg.getByTestId(closeX);

  const open = async () => {
    await trig.click();
    await ov.waitFor({ state: 'visible' });
    await dlg.waitFor({ state: 'visible' });
    await waitFocused(page, closeX);
  };
  const closed = async () => {
    await ov.waitFor({ state: 'hidden' });
    await waitFocused(page, trigger);
  };

  await open();
  await assertAttr(dlg, 'role', 'dialog');
  await assertAttr(dlg, 'aria-modal', 'true');
  if (labelledBy) await assertAttr(dlg, 'aria-labelledby', labelledBy);
  await assertAttr(x, 'aria-label', 'Close');

  // Focus trap: Tab and Shift+Tab never leave the dialog.
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    const inside = await dlg.evaluate((el) => el.contains(document.activeElement));
    if (!inside) fail(`focus escaped the "${modal}" dialog after ${key}`);
  }

  // A click inside the dialog must NOT close it.
  await dlg.click({ position: { x: 3, y: 3 } });
  if (!(await ov.isVisible())) fail('clicking inside the dialog closed it');

  // Esc closes + returns focus.
  await page.keyboard.press('Escape');
  await closed();

  // The ✕ closes + returns focus.
  await open();
  await x.click();
  await closed();

  // Backdrop (a corner of the overlay, outside the centered dialog) closes.
  await open();
  await ov.click({ position: { x: 5, y: 5 } });
  if (backdropFocusReturn) await closed();
  else await ov.waitFor({ state: 'hidden' });
}

// assertHelpAutoShows(browser, url, opts) — first-load Help: in a FRESH context
// (no help-seen seed) the Help overlay auto-shows on first visit with
// role=dialog / aria-modal and focus on the ✕ (and `text`, if given, in the
// dialog), then does NOT show again after a reload. Inverse of seedHelpSeen.
// `seenKey` (a helpSeenKey(...) value) additionally waits for / asserts the flag.
export async function assertHelpAutoShows(browser, url, {
  overlay = 'help-overlay',
  modal = 'help-modal',
  closeX = 'modal-close-x',
  text,
  seenKey,
} = {}) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
    const ov = page.getByTestId(overlay);
    const dlg = page.getByTestId(modal);
    await ov.waitFor({ state: 'visible' });
    await assertAttr(dlg, 'role', 'dialog');
    await assertAttr(dlg, 'aria-modal', 'true');
    if (text !== undefined) {
      const body = (await dlg.textContent()) ?? '';
      if (!body.includes(text)) fail(`help dialog does not contain ${JSON.stringify(text)}`);
    }
    await waitFocused(page, closeX);
    // Over file:// a write-then-reload can race the storage commit: when the
    // caller passes the help-seen key, wait for the flag before reloading.
    if (seenKey) {
      await page.waitForFunction(
        (k) => { try { return window.localStorage.getItem(k) === '1'; } catch { return false; } },
        seenKey,
      );
    }
    await page.reload();
    await ov.waitFor({ state: 'hidden' });
    if (seenKey) {
      const stored = await page.evaluate((k) => window.localStorage.getItem(k), seenKey);
      if (stored !== '1') fail(`expected localStorage[${seenKey}] === "1", got ${JSON.stringify(stored)}`);
    }
  } finally {
    await context.close();
  }
}

// assertConfirmDialog(page, { open, text, action }) — drive the shared inlined
// confirmDialog dialog (.ctc-overlay > .ctc-dialog[role=dialog], buttons
// .ctc-btn--yes / .ctc-btn--cancel). `open` is an optional async fn that
// triggers it (omit if the caller already did). `text`, if given, must appear
// in the dialog. `action`:
//   'confirm'  click Yes                'cancel'  click Cancel
//   'escape'   press Escape             'backdrop' click the backdrop
//   'none'     assert NO dialog appears after `open` (e.g. empty-input Clear)
// For every dismiss action the dialog must be gone afterwards.
export async function assertConfirmDialog(page, { open, text, action = 'confirm' } = {}) {
  const overlay = page.locator('.ctc-overlay');
  const dialog = page.locator('.ctc-overlay .ctc-dialog[role="dialog"]');
  if (open) await open();

  if (action === 'none') {
    if ((await overlay.count()) !== 0) fail('expected no confirm dialog, but one is open');
    return;
  }

  await dialog.waitFor({ state: 'visible' });
  await assertAttr(dialog, 'aria-modal', 'true');
  if (text !== undefined) {
    const body = (await dialog.textContent()) ?? '';
    if (!body.includes(text)) fail(`confirm dialog does not contain ${JSON.stringify(text)}`);
  }

  if (action === 'confirm') await dialog.locator('.ctc-btn--yes').click();
  else if (action === 'cancel') await dialog.locator('.ctc-btn--cancel').click();
  else if (action === 'escape') await page.keyboard.press('Escape');
  else if (action === 'backdrop') await overlay.click({ position: { x: 5, y: 5 } });
  else fail(`assertConfirmDialog: unknown action ${JSON.stringify(action)}`);

  await overlay.waitFor({ state: 'detached' });
}
