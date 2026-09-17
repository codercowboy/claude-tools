// Unit tests for fieldEditorMode — derives the picker mode (every / step /
// range / specific / custom) + params from a parsed field. This is what drives
// raw-expression → field-editor sync in the app. node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './_helpers.mjs';

const { parseCron, fieldEditorMode } = await loadLogic();

const modeOf = (expr, key, opts) => fieldEditorMode(parseCron(expr, opts)[key]);

test('`*` -> every', () => {
  assert.deepEqual(modeOf('* * * * *', 'minute'), { mode: 'every' });
});

test('`?` (dom/dow) reads as every (semantically identical) — Spring', () => {
  assert.deepEqual(modeOf('0 0 0 * * ?', 'dow', { flavor: 'spring' }), { mode: 'every' });
  assert.deepEqual(modeOf('0 0 0 ? * *', 'dom', { flavor: 'spring' }), { mode: 'every' });
});

test('special tokens (L / W / #) read as Custom with canonical text', () => {
  assert.deepEqual(modeOf('0 0 0 ? * 6#3', 'dow', { flavor: 'quartz' }), { mode: 'custom', text: '6#3' });
  assert.deepEqual(modeOf('0 0 0 L * ?', 'dom', { flavor: 'quartz' }), { mode: 'custom', text: 'L' });
  assert.deepEqual(modeOf('0 0 0 15W * ?', 'dom', { flavor: 'quartz' }), { mode: 'custom', text: '15W' });
});

test('`*/n` -> step with the step value', () => {
  assert.deepEqual(modeOf('*/15 * * * *', 'minute'), { mode: 'step', step: 15 });
});

test('`a-b` -> range with endpoints', () => {
  assert.deepEqual(modeOf('0 3-5 * * *', 'hour'), { mode: 'range', from: 3, to: 5 });
});

test('single value and lists -> specific with values', () => {
  assert.deepEqual(modeOf('0 0 15 * *', 'dom'), { mode: 'specific', values: [15] });
  assert.deepEqual(modeOf('0 0 1,15 * *', 'dom'), { mode: 'specific', values: [1, 15] });
});

test('anything mixed / range-step -> custom with canonical text', () => {
  assert.deepEqual(modeOf('1-5/2 * * * *', 'minute'), { mode: 'custom', text: '1-5/2' });
  assert.deepEqual(modeOf('1-3,7 * * * *', 'minute'), { mode: 'custom', text: '1-3,7' });
});
