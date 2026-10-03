// storage.mjs — e2e helpers for localStorage persistence, blocked-storage
// resilience and the "secrets are never persisted" scan.
// Dependency-free (never imports @playwright/test). Helpers take `page` and THROW
// on failure, so they work under any runner. Everything runs via page.evaluate /
// page.addInitScript, so it is file://-safe.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Snapshot every localStorage (and, optionally, sessionStorage) entry as a plain object. */
export async function dumpStorage(page, { session = false } = {}) {
  return page.evaluate((withSession) => {
    const grab = (s) => {
      const out = {};
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        out[k] = s.getItem(k);
      }
      return out;
    };
    return withSession
      ? { local: grab(window.localStorage), session: grab(window.sessionStorage) }
      : grab(window.localStorage);
  }, session);
}

/** Read one stored value; parsed as JSON unless `{ json: false }`. `null` when absent. */
export async function readStored(page, key, { json = true } = {}) {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  if (raw == null) return null;
  return json ? JSON.parse(raw) : raw;
}

/**
 * Wait until `key` has been written (and, if given, `predicate(parsed)` is truthy),
 * then return the parsed value. Replaces the fixed ~400ms file:// write-settle
 * `waitForTimeout` guard with a poll on the stored value. Throws on timeout.
 */
export async function settleStorage(page, key, { predicate, timeout = 5000, json = true, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    let value = null;
    try { value = await readStored(page, key, { json }); } catch { value = null; }
    last = value;
    if (value != null && (!predicate || predicate(value))) return value;
    if (Date.now() >= deadline) break;
    await sleep(interval);
  }
  throw new Error(`settleStorage: "${key}" never settled within ${timeout}ms (last: ${JSON.stringify(last)})`);
}

/** Throw unless the object's keys are exactly `keys` (order-insensitive). Returns the object. */
export function assertOnlyKeys(obj, keys) {
  const got = Object.keys(obj || {}).sort();
  const want = [...keys].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`stored keys mismatch: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  return obj;
}

/** Throw if the object carries any of the `keys` (source-of-truth-only contract). */
export function assertLacksKeys(obj, keys) {
  const bad = keys.filter((k) => obj && Object.prototype.hasOwnProperty.call(obj, k));
  if (bad.length) throw new Error(`stored blob must not contain: ${bad.join(', ')}`);
  return obj;
}

/**
 * Persist-inputs / recompute-outputs round trip:
 *   change() -> settle the stored blob -> onStored(parsed) -> reload -> afterReload().
 * Any step may throw to fail. Returns the parsed stored value.
 * `waitReady` (optional) runs after the reload, before `afterReload`.
 */
export async function persistRoundTrip(page, { key, change, predicate, onStored, waitReady, afterReload, timeout } = {}) {
  if (!key) throw new Error('persistRoundTrip: `key` is required');
  if (change) await change();
  const stored = await settleStorage(page, key, { predicate, timeout });
  if (onStored) await onStored(stored);
  await page.reload();
  if (waitReady) await waitReady();
  if (afterReload) await afterReload(stored);
  return stored;
}

/**
 * Make localStorage misbehave on the NEXT navigation (uses addInitScript, so call
 * it before page.goto / page.reload). mode:
 *   'methods' (default) - Storage.prototype.getItem/setItem/removeItem/clear/key throw
 *   'access'            - touching window.localStorage itself throws SecurityError
 *                         (what a browser with storage blocked does)
 *   'quota'             - only setItem throws QuotaExceededError (reads still work)
 */
export async function breakStorage(page, { mode = 'methods' } = {}) {
  if (!['methods', 'access', 'quota'].includes(mode)) throw new Error(`breakStorage: unknown mode "${mode}"`);
  await page.addInitScript((m) => {
    if (m === 'access') {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
      });
    } else if (m === 'quota') {
      Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
    } else {
      const boom = function () { throw new Error('blocked'); };
      for (const fn of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) Storage.prototype[fn] = boom;
    }
  }, mode);
}

/**
 * Security scan: none of `secrets` (string | string[]) may appear in any
 * localStorage/sessionStorage key or value. Also scans the URL hash/search.
 * Empty secrets are rejected (they would trivially match). Returns the dump.
 */
export async function assertNotPersisted(page, secrets, { allowKeys } = {}) {
  const list = (Array.isArray(secrets) ? secrets : [secrets]);
  if (!list.length || list.some((s) => typeof s !== 'string' || s === '')) {
    throw new Error('assertNotPersisted: pass one or more non-empty secret strings');
  }
  const dump = await dumpStorage(page, { session: true });
  const url = await page.evaluate(() => location.hash + location.search);
  if (allowKeys) {
    const extra = Object.keys(dump.local).filter((k) => !allowKeys.includes(k));
    if (extra.length) throw new Error(`unexpected localStorage keys: ${extra.join(', ')}`);
  }
  for (const secret of list) {
    for (const [area, entries] of Object.entries(dump)) {
      for (const [k, v] of Object.entries(entries)) {
        if (k.includes(secret) || String(v).includes(secret)) {
          throw new Error(`secret leaked into ${area}Storage["${k}"]`);
        }
      }
    }
    if (url.includes(secret)) throw new Error('secret leaked into the URL (hash/search)');
  }
  return dump;
}
