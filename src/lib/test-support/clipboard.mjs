// clipboard.mjs — e2e helpers for copy buttons and clipboard capture.
// Dependency-free (never imports @playwright/test); throws on failure.
// file:// clipboard reads are flaky in headless browsers, so prefer
// stubClipboard()/readClipboard() for content and expectCopyFlash() for UI.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page. Replaces writeText/readText with an in-memory recorder.
function installStub() {
  const rec = { writes: [], last: null };
  window.__jbcClipboard = rec;
  const stub = {
    writeText: (t) => { rec.last = String(t); rec.writes.push(String(t)); return Promise.resolve(); },
    readText: () => Promise.resolve(rec.last == null ? '' : rec.last),
  };
  if (navigator.clipboard) {
    try { navigator.clipboard.writeText = stub.writeText; navigator.clipboard.readText = stub.readText; return; } catch { /* fall through */ }
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: stub });
}

/**
 * Capture clipboard writes in-page. Installs on the current document AND on every
 * later navigation/reload. Read back with readClipboard(). Deterministic; needs
 * no clipboard permissions.
 */
export async function stubClipboard(page) {
  await page.addInitScript(installStub);
  await page.evaluate(installStub);
}

/**
 * Last text written to the clipboard. With a stub installed this is exact
 * (`{all:true}` returns every write). Without one, falls back to a best-effort
 * navigator.clipboard.readText() ('' when unreadable).
 */
export async function readClipboard(page, { all = false } = {}) {
  return page.evaluate(async (wantAll) => {
    const rec = window.__jbcClipboard;
    if (rec) return wantAll ? rec.writes.slice() : (rec.last == null ? '' : rec.last);
    try { return wantAll ? [await navigator.clipboard.readText()] : await navigator.clipboard.readText(); }
    catch { return wantAll ? [] : ''; }
  }, all);
}

// Records every distinct text the button shows (MutationObserver), so a flash
// that comes and goes between polls on a loaded host is still seen.
async function startTextHistory(btn) {
  await btn.evaluate((el) => {
    const h = [(el.textContent || '').trim()];
    const push = () => { const t = (el.textContent || '').trim(); if (h[h.length - 1] !== t) h.push(t); };
    const mo = new MutationObserver(push);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    el.__jbcHist = { h, mo, push };
  });
}
const readHistory = (btn) => btn.evaluate((el) => { el.__jbcHist.push(); return el.__jbcHist.h.slice(); });
const stopHistory = (btn) => btn.evaluate((el) => { if (el.__jbcHist) el.__jbcHist.mo.disconnect(); }).catch(() => {});

/**
 * Click a copy button and assert its transient feedback: text becomes `flash`
 * (default: anything different from the original), then reverts to `revert`
 * (default: the original text). Pass `revert:false` to skip the revert check.
 * Asserts the UI only, not clipboard contents (see readClipboard). Returns the original text.
 */
export async function expectCopyFlash(btn, { flash, revert, timeout = 3000 } = {}) {
  await startTextHistory(btn);
  try {
    const original = ((await btn.textContent()) ?? '').trim();
    await btn.click();
    const deadline = Date.now() + timeout;
    const want = revert != null ? revert : original;
    for (;;) {
      const h = await readHistory(btn);
      const at = h.findIndex((t, i) => i > 0 && (flash != null ? t === flash : t !== original));
      if (at >= 0) {
        if (revert === false) return original;
        if (h.slice(at + 1).includes(want) && h[h.length - 1] === want) return original;
        if (Date.now() >= deadline) throw new Error(`expectCopyFlash: never reverted to "${want}" (history ${JSON.stringify(h)})`);
      } else if (Date.now() >= deadline) {
        throw new Error(`expectCopyFlash: never flashed${flash != null ? ` "${flash}"` : ''} (history ${JSON.stringify(h)})`);
      }
      await sleep(25);
    }
  } finally {
    await stopHistory(btn);
  }
}
