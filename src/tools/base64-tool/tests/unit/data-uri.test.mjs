// data: URI parsing unit tests: parseDataUri() (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBase64Tool } from './_helpers.mjs';

const { parseDataUri } = await loadBase64Tool();

test('parseDataUri(): basic base64 data URI', () => {
  assert.deepEqual(parseDataUri('data:text/plain;base64,aGVsbG8='), {
    mime: 'text/plain',
    isBase64: true,
    payload: 'aGVsbG8=',
  });
});

test('parseDataUri(): image MIME type', () => {
  const result = parseDataUri('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.isBase64, true);
  assert.equal(result.payload, 'iVBORw0KGgo=');
});

test('parseDataUri(): non-base64 (plain percent-encoded) data URI defaults mime to text/plain', () => {
  assert.deepEqual(parseDataUri('data:,Hello%20World'), {
    mime: 'text/plain',
    isBase64: false,
    payload: 'Hello%20World',
  });
});

test('parseDataUri(): additional params before ;base64 are ignored for mime (only the first segment is used)', () => {
  const result = parseDataUri('data:text/plain;charset=utf-8;base64,SGVsbG8=');
  assert.equal(result.mime, 'text/plain');
  assert.equal(result.isBase64, true);
  assert.equal(result.payload, 'SGVsbG8=');
});

test('parseDataUri(): payload may itself contain commas — only the first comma delimits it', () => {
  const result = parseDataUri('data:text/plain,a,b,c');
  assert.equal(result.payload, 'a,b,c');
});

test('parseDataUri(): a string with no comma at all is not a valid data URI', () => {
  assert.equal(parseDataUri('data:text/plain'), null);
});

test('parseDataUri(): a string not starting with "data:" is not a data URI', () => {
  assert.equal(parseDataUri('not a data uri, nope'), null);
  assert.equal(parseDataUri('aGVsbG8='), null);
});

test('parseDataUri(): null/undefined/empty input is not a data URI', () => {
  assert.equal(parseDataUri(null), null);
  assert.equal(parseDataUri(undefined), null);
  assert.equal(parseDataUri(''), null);
});

test('parseDataUri(): surrounding whitespace is trimmed before matching', () => {
  const result = parseDataUri('  data:text/plain;base64,aGVsbG8=  ');
  assert.equal(result.isBase64, true);
  assert.equal(result.mime, 'text/plain');
});
