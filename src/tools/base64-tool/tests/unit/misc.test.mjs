// Misc pure-helper unit tests: extensionForMime(), formatBytes()
// (node --test, no browser/DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBase64Tool } from './_helpers.mjs';

const { extensionForMime, formatBytes, MIME_EXTENSIONS } = await loadBase64Tool();

test('extensionForMime(): known MIME types map to their documented extensions', () => {
  assert.equal(extensionForMime('text/plain'), 'txt');
  assert.equal(extensionForMime('image/png'), 'png');
  assert.equal(extensionForMime('application/json'), 'json');
  assert.equal(extensionForMime('image/svg+xml'), 'svg');
});

test('extensionForMime(): every entry in MIME_EXTENSIONS round-trips through the function itself', () => {
  for (const [mime, ext] of Object.entries(MIME_EXTENSIONS)) {
    assert.equal(extensionForMime(mime), ext, mime);
  }
});

test('extensionForMime(): strips a trailing ;charset=... parameter and lowercases before lookup', () => {
  assert.equal(extensionForMime('text/html; charset=utf-8'), 'html');
  assert.equal(extensionForMime('TEXT/HTML'), 'html');
});

test('extensionForMime(): an unknown but well-formed subtype falls back to a sanitized subtype', () => {
  assert.equal(extensionForMime('application/x-custom+xml'), 'xcustom');
});

test('extensionForMime(): garbage input (no slash, empty, null) falls back to "bin"', () => {
  assert.equal(extensionForMime('garbage'), 'bin');
  assert.equal(extensionForMime(''), 'bin');
  assert.equal(extensionForMime(null), 'bin');
  assert.equal(extensionForMime(undefined), 'bin');
});

test('formatBytes(): sub-1024 values are reported in bytes with no decimal', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1023), '1023 B');
});

test('formatBytes(): known KB/MB/GB boundaries', () => {
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1.0 GB');
});

test('formatBytes(): values beyond GB stay expressed in GB (units array caps out)', () => {
  const oneTB = 1024 * 1024 * 1024 * 1024;
  assert.equal(formatBytes(oneTB), '1024.0 GB');
});
