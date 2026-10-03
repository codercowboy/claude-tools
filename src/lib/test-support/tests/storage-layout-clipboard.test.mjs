// jason-code-side coverage for storage.mjs + layout.mjs + clipboard.mjs.
// The fake page runs page.evaluate / addInitScript callbacks in Node against fake globals.
// Run: node --test conventions/tools/test-support/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dumpStorage, readStored, settleStorage, assertOnlyKeys, assertLacksKeys,
  persistRoundTrip, breakStorage, assertNotPersisted,
} from '../storage.mjs';
import { VIEWPORTS, resolveViewport, setViewport, measureOverflow, expectNoOverflow } from '../layout.mjs';
import { stubClipboard, readClipboard, expectCopyFlash } from '../clipboard.mjs';

function fakeStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    _m: m,
  };
}
function fakePage(env = {}) {
  const inits = [];
  const page = {
    inits, viewport: null, reloads: 0,
    async evaluate(fn, arg) {
      const saved = {};
      const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
      for (const k of Object.keys(env)) { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); put(k, env[k]); }
      try { return await fn(arg); } finally {
        for (const k of Object.keys(env)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; }
      }
    },
    async addInitScript(fn, arg) { inits.push([fn, arg]); },
    async setViewportSize(v) { page.viewport = v; },
    async reload() { page.reloads++; },
  };
  return page;
}
const winWith = (local, session = fakeStore(), loc = { hash: '', search: '' }) =>
  ({ window: { localStorage: local, sessionStorage: session }, location: loc });

test('dumpStorage / readStored / settleStorage', async () => {
  const ls = fakeStore({ a: '{"x":1}', b: 'raw' });
  const page = fakePage(winWith(ls));
  assert.deepEqual(await dumpStorage(page), { a: '{"x":1}', b: 'raw' });
  assert.deepEqual(await readStored(page, 'a'), { x: 1 });
  assert.equal(await readStored(page, 'b', { json: false }), 'raw');
  assert.equal(await readStored(page, 'nope'), null);
  setTimeout(() => ls.setItem('late', '{"v":2}'), 120);
  assert.deepEqual(await settleStorage(page, 'late', { predicate: (v) => v.v === 2, timeout: 2000 }), { v: 2 });
  await assert.rejects(() => settleStorage(page, 'never', { timeout: 150, interval: 20 }), /never settled/);
});

test('assertOnlyKeys / assertLacksKeys', () => {
  assert.doesNotThrow(() => assertOnlyKeys({ b: 1, a: 2 }, ['a', 'b']));
  assert.throws(() => assertOnlyKeys({ a: 1, hmacKey: 2 }, ['a']), /mismatch/);
  assert.doesNotThrow(() => assertLacksKeys({ a: 1 }, ['shapes']));
  assert.throws(() => assertLacksKeys({ shapes: [] }, ['shapes']), /must not contain/);
});

test('persistRoundTrip runs change -> settle -> onStored -> reload -> afterReload', async () => {
  const ls = fakeStore();
  const page = fakePage(winWith(ls));
  const order = [];
  const stored = await persistRoundTrip(page, {
    key: 'k',
    change: async () => { order.push('change'); ls.setItem('k', '{"mode":"x"}'); },
    onStored: (s) => order.push('stored:' + s.mode),
    waitReady: async () => order.push('ready'),
    afterReload: async () => order.push('after'),
  });
  assert.deepEqual(stored, { mode: 'x' });
  assert.deepEqual(order, ['change', 'stored:x', 'ready', 'after']);
  assert.equal(page.reloads, 1);
});

test('breakStorage installs init scripts that make storage throw (all modes)', async () => {
  class Storage { getItem() { return 1; } setItem() {} removeItem() {} clear() {} key() {} }
  for (const [mode, probe] of [
    ['methods', () => new Storage().getItem('a')],
    ['quota', () => new Storage().setItem('a', 'b')],
  ]) {
    const page = fakePage();
    await breakStorage(page, { mode });
    globalThis.Storage = Storage;
    Object.assign(Storage.prototype, { getItem() { return 1; }, setItem() {} });
    const [fn, arg] = page.inits[0];
    fn(arg);
    assert.throws(probe);
    delete globalThis.Storage;
  }
  // 'access': window.localStorage getter throws SecurityError
  const page = fakePage();
  await breakStorage(page, { mode: 'access' });
  const win = {};
  globalThis.window = win; globalThis.DOMException = DOMException;
  page.inits[0][0](page.inits[0][1]);
  assert.throws(() => win.localStorage, /insecure/);
  delete globalThis.window;
  await assert.rejects(() => breakStorage(fakePage(), { mode: 'bogus' }), /unknown mode/);
});

test('assertNotPersisted finds leaks in values, keys, sessionStorage and the URL', async () => {
  const clean = fakePage(winWith(fakeStore({ prefs: '{"mode":"hash"}' })));
  assert.equal((await assertNotPersisted(clean, 'SECRET')).local.prefs, '{"mode":"hash"}');
  await assert.doesNotReject(() => assertNotPersisted(clean, ['S1', 'S2'], { allowKeys: ['prefs'] }));
  await assert.rejects(() => assertNotPersisted(clean, 'x', { allowKeys: [] }), /unexpected localStorage keys/);
  await assert.rejects(() => assertNotPersisted(clean, ''), /non-empty/);
  const leakV = fakePage(winWith(fakeStore({ prefs: '{"k":"my-SECRET-x"}' })));
  await assert.rejects(() => assertNotPersisted(leakV, 'SECRET'), /localStorage\["prefs"\]/);
  const leakK = fakePage(winWith(fakeStore({ 'SECRET': '1' })));
  await assert.rejects(() => assertNotPersisted(leakK, 'SECRET'), /leaked/);
  const leakS = fakePage(winWith(fakeStore(), fakeStore({ t: 'SECRET' })));
  await assert.rejects(() => assertNotPersisted(leakS, 'SECRET'), /sessionStorage/);
  const leakU = fakePage(winWith(fakeStore(), fakeStore(), { hash: '#SECRET', search: '' }));
  await assert.rejects(() => assertNotPersisted(leakU, 'SECRET'), /URL/);
});

test('viewport presets + expectNoOverflow', async () => {
  assert.equal(VIEWPORTS.mobile.width, 375);
  assert.equal(VIEWPORTS.narrow.width, 380);
  assert.ok(VIEWPORTS.wide.width >= 1400 && VIEWPORTS.ultrawide.width <= 1700);
  assert.deepEqual(resolveViewport({ width: 500 }), { width: 500, height: 800 });
  assert.throws(() => resolveViewport('nope'), /unknown viewport/);
  const doc = (scrollW, clientW) => ({
    document: { documentElement: { scrollWidth: scrollW, clientWidth: clientW }, scrollingElement: { scrollWidth: scrollW }, body: { scrollWidth: 0 } },
  });
  const ok = fakePage(doc(1000, 1000));
  assert.equal((await expectNoOverflow(ok, { viewport: 'mobile' })).overflow, 0);
  assert.deepEqual(ok.viewport, VIEWPORTS.mobile);
  assert.deepEqual(await setViewport(ok, { width: 400, height: 300 }), { width: 400, height: 300 });
  await assert.doesNotReject(() => expectNoOverflow(fakePage(doc(1002, 1000))));
  const bad = fakePage(doc(1200, 1000));
  await assert.rejects(() => expectNoOverflow(bad), /horizontal overflow/);
  assert.equal((await measureOverflow(bad)).overflow, 200);
});

test('stubClipboard / readClipboard', async () => {
  const nav = { clipboard: { writeText: async () => {}, readText: async () => 'real' } };
  const win = {};
  const page = fakePage({ window: win, navigator: nav });
  assert.equal(await readClipboard(page), 'real'); // no stub: best-effort readText
  await stubClipboard(page);
  assert.equal(page.inits.length, 1);
  assert.equal(await readClipboard(page), '');
  await nav.clipboard.writeText('one'); await nav.clipboard.writeText('two');
  assert.equal(await readClipboard(page), 'two');
  assert.deepEqual(await readClipboard(page, { all: true }), ['one', 'two']);
  assert.equal(await nav.clipboard.readText(), 'two');
});

function fakeBtn(states) { // states[0] = original; the timeline advances 60ms per step after click
  let clicked = 0; let hist = null;
  const cur = () => states[!clicked ? 0 : Math.min(states.length - 1, 1 + Math.floor((Date.now() - clicked) / 60))];
  const el = {
    get textContent() { return cur(); },
    __jbcHist: undefined,
  };
  return {
    async click() { clicked = Date.now(); },
    async textContent() { return cur(); },
    // run the in-page callbacks against a fake element with a manual observer
    async evaluate(fn) {
      globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; } observe() {} disconnect() { this.off = true; } };
      const snapshot = { get textContent() { return cur(); }, __jbcHist: el.__jbcHist };
      const r = fn(snapshot);
      el.__jbcHist = snapshot.__jbcHist;
      return r;
    },
  };
}
test('expectCopyFlash asserts flash then revert', async () => {
  assert.equal(await expectCopyFlash(fakeBtn(['Copy all', 'Copied!', 'Copied!', 'Copy all']), { flash: 'Copied!' }), 'Copy all');
  await assert.doesNotReject(() => expectCopyFlash(fakeBtn(['📋', '✅', '📋']), {}));
  await assert.doesNotReject(() => expectCopyFlash(fakeBtn(['📋', '✅', '✅']), { revert: false, flash: '✅' }));
  await assert.rejects(() => expectCopyFlash(fakeBtn(['Copy', 'Copy']), { timeout: 150 }), /never flashed/);
  await assert.rejects(() => expectCopyFlash(fakeBtn(['Copy', 'Done']), { timeout: 200 }), /never reverted/);
  await assert.rejects(() => expectCopyFlash(fakeBtn(['Copy', 'Done', 'Copy']), { flash: 'Other', timeout: 300 }), /never flashed "Other"/);
});
