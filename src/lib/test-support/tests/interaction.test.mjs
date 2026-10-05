// jason-code-side coverage for interaction.mjs using minimal fake page/locator
// objects (the helper is dependency-free and duck-typed on purpose, so it can be
// exercised without a browser). Real-browser coverage is in each consumer tool's
// e2e suite. Run: node --test conventions/tools/test-support/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForToolReady, trackPageErrors, assertHookShape, driveHook,
  assertConfirmDialog, assertModalA11y, assertHelpAutoShows,
  assertDropDispatch, assertRovingTabs, TINY_PNG_B64,
} from '../interaction.mjs';

test('trackPageErrors collects pageerror messages; assertNone throws only when non-empty', () => {
  const handlers = {};
  const page = { on: (ev, fn) => { handlers[ev] = fn; } };
  const t = trackPageErrors(page);
  t.assertNone();
  handlers.pageerror(new Error('boom'));
  assert.deepEqual(t.errors, ['boom']);
  assert.throws(() => t.assertNone(), /boom/);
});

test('waitForToolReady forwards ns/prop/timeout to waitForFunction', async () => {
  let call;
  const page = { waitForFunction: async (...a) => { call = a; } };
  await waitForToolReady(page, '__x');
  assert.deepEqual(call[1], ['__x', 'state']);
  assert.equal(call[2], undefined);
  await waitForToolReady(page, '__x', { prop: null, timeout: 5 });
  assert.deepEqual(call[1], ['__x', null]);
  assert.deepEqual(call[2], { timeout: 5 });
  // the predicate itself
  const g = globalThis; g.window = g;
  g.__x = { state: {} };
  assert.equal(call[0](['__x', 'state']), true);
  assert.equal(call[0](['__x', 'nope']), false);
  assert.equal(call[0](['__x', null]), true);
  assert.equal(call[0](['__missing', null]), false);
  delete g.__x; delete g.window;
});

test('assertHookShape: array keys, typed keys, missing ns / key / wrong type', async () => {
  const mk = (shape) => ({ evaluate: async () => shape });
  await assertHookShape(mk({ a: 'function', state: 'object' }), 'ns', ['a', 'state']);
  await assertHookShape(mk({ a: 'function', s: 'object' }), 'ns', { a: 'function', s: 'object' });
  await assert.rejects(assertHookShape(mk(null), 'ns', ['a']), /not defined/);
  await assert.rejects(assertHookShape(mk({}), 'ns', ['a']), /a is missing/);
  await assert.rejects(assertHookShape(mk({ a: 'object' }), 'ns', { a: 'function' }), /expected function/);
});

test('driveHook evaluates window[ns][method](...args) in the page', async () => {
  let seen;
  const page = { evaluate: async (fn, arg) => { seen = arg; globalThis.window = { n: { m: (x, y) => x + y } }; const r = fn(arg); delete globalThis.window; return r; } };
  assert.equal(await driveHook(page, 'n', 'm', 2, 3), 5);
  assert.deepEqual(seen, ['n', 'm', [2, 3]]);
});

// --- fake locator plumbing for the dialog helpers -------------------------
function fakeLoc(log, name, over = {}) {
  return {
    click: async (o) => log.push(`click ${name}${o ? JSON.stringify(o.position) : ''}`),
    waitFor: async (o) => log.push(`waitFor ${name} ${o.state}`),
    getAttribute: async (a) => over.attrs?.[a] ?? null,
    textContent: async () => over.text ?? '',
    count: async () => over.count ?? 0,
    isVisible: async () => over.visible ?? true,
    evaluate: async () => over.inside ?? true,
    locator: (sel) => fakeLoc(log, `${name}>${sel}`, over.child ?? {}),
    getByTestId: (id) => fakeLoc(log, `${name}>[${id}]`, over.child ?? {}),
  };
}

test('assertConfirmDialog: confirm / cancel / none / bad action', async () => {
  const log = [];
  const dlgAttrs = { attrs: { 'aria-modal': 'true' }, text: 'Clear everything?' };
  const page = {
    locator: (sel) => fakeLoc(log, sel, sel.includes('.ctc-dialog') ? dlgAttrs : { count: 0 }),
    keyboard: { press: async (k) => log.push(`press ${k}`) },
  };
  await assertConfirmDialog(page, { text: 'Clear', action: 'confirm' });
  assert.ok(log.some((l) => l.includes('.ctc-btn--yes')));
  log.length = 0;
  await assertConfirmDialog(page, { action: 'cancel' });
  assert.ok(log.some((l) => l.includes('.ctc-btn--cancel')));
  log.length = 0;
  await assertConfirmDialog(page, { action: 'escape' });
  assert.ok(log.includes('press Escape'));
  await assertConfirmDialog(page, { action: 'none' });
  await assert.rejects(assertConfirmDialog(page, { text: 'nope' }), /does not contain/);
  await assert.rejects(assertConfirmDialog(page, { action: 'wat' }), /unknown action/);
  // 'none' with a dialog present fails
  const busy = { locator: () => fakeLoc([], 'x', { count: 1 }) };
  await assert.rejects(assertConfirmDialog(busy, { action: 'none' }), /no confirm dialog/);
});

test('assertModalA11y passes on a well-behaved fake and fails when role is wrong', async () => {
  const mkPage = (role) => {
    const log = [];
    const child = { attrs: { 'aria-label': 'Close' } };
    const page = {
      log,
      getByTestId: (id) => fakeLoc(log, id, id === 'help-modal'
        ? { attrs: { role, 'aria-modal': 'true', 'aria-labelledby': 'help-title' }, child }
        : {}),
      waitForFunction: async () => {},
      keyboard: { press: async (k) => log.push(`press ${k}`) },
    };
    return page;
  };
  const ok = mkPage('dialog');
  await assertModalA11y(ok, { labelledBy: 'help-title' });
  assert.equal(ok.log.filter((l) => l === 'press Escape').length, 1);
  await assert.rejects(assertModalA11y(mkPage('alert')), /role="dialog"/);
});

test('assertHelpAutoShows opens a fresh context and always closes it', async () => {
  const log = [];
  const ctx = {
    newPage: async () => ({
      goto: async (u) => log.push(`goto ${u}`),
      reload: async () => log.push('reload'),
      getByTestId: (id) => fakeLoc(log, id, { attrs: { role: 'dialog', 'aria-modal': 'true' }, text: 'How it works' }),
      waitForFunction: async () => {},
      evaluate: async () => '1',
    }),
    close: async () => log.push('close'),
  };
  await assertHelpAutoShows({ newContext: async () => ctx }, 'file:///x', { text: 'How it', seenKey: 'k' });
  assert.deepEqual(log.filter((l) => /^(goto|reload|close)/.test(l)), ['goto file:///x', 'reload', 'close']);
  log.length = 0;
  await assert.rejects(assertHelpAutoShows({ newContext: async () => ctx }, 'file:///x', { text: 'ZZZ' }), /does not contain/);
  assert.ok(log.includes('close'));
});

test('TINY_PNG_B64 decodes to a PNG (signature + IHDR 1x1)', () => {
  const b = Buffer.from(TINY_PNG_B64, 'base64');
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(b.readUInt32BE(16), 1);
  assert.equal(b.readUInt32BE(20), 1);
});

test('assertDropDispatch: requires selector + dragClass (browser path is covered by consumer e2e suites)', async () => {
  await assert.rejects(assertDropDispatch({}, {}), /`selector` is required/);
  await assert.rejects(assertDropDispatch({}, { selector: '#z' }), /`dragClass` is required/);
});

test('assertRovingTabs: passes a correct roving tablist, fails a stuck tabIndex', async () => {
  const mk = (stuck) => {
    const tabs = ['a', 'b', 'c'];
    let cur = 0;
    const page = {
      getByTestId: (id) => {
        const i = tabs.indexOf(id);
        return {
          focus: async () => { cur = i; },
          getAttribute: async () => (i === cur ? 'true' : 'false'),
          evaluate: async () => (stuck ? 0 : (i === cur ? 0 : -1)),
        };
      },
      evaluate: async () => tabs[cur],
      keyboard: {
        press: async (k) => {
          if (k === 'ArrowRight') cur = (cur + 1) % 3;
          else if (k === 'ArrowLeft') cur = (cur + 2) % 3;
          else if (k === 'Home') cur = 0;
          else if (k === 'End') cur = 2;
        },
      },
    };
    return page;
  };
  await assertRovingTabs(mk(false), { tabs: ['a', 'b', 'c'] });
  await assert.rejects(assertRovingTabs(mk(true), { tabs: ['a', 'b', 'c'] }), /roving tabIndex/);
  await assert.rejects(assertRovingTabs(mk(false), { tabs: ['a'] }), />= 2 testids/);
});
