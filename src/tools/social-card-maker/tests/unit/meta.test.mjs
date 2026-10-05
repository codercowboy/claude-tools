// Unit tests for buildMetaSnippet (source/logic.mjs) — the tool's differentiator:
// the og:* / twitter:* <meta> block reflecting the composed card, with every
// content value HTML-attribute-escaped. Pure, DOM-free; exact expected strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMetaSnippet } from '../../source/logic.mjs';

// Split into lines for order-aware assertions.
const lines = (s) => s.split('\n');

test('buildMetaSnippet emits the full ordered og:* / twitter:* block for a complete card', () => {
  const snippet = buildMetaSnippet({
    title: 'Launch Day',
    description: 'Our new thing is here',
    imageUrl: 'https://example.com/card.png',
    siteName: 'claude-tools',
    twitterCard: 'summary_large_image',
    width: 1200,
    height: 630,
  });
  assert.deepEqual(lines(snippet), [
    '<meta property="og:title" content="Launch Day">',
    '<meta property="og:description" content="Our new thing is here">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="claude-tools">',
    '<meta property="og:image" content="https://example.com/card.png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Launch Day">',
    '<meta name="twitter:description" content="Our new thing is here">',
    '<meta name="twitter:image" content="https://example.com/card.png">',
  ]);
});

test('buildMetaSnippet mirrors title into og:title AND twitter:title (same for description)', () => {
  const snippet = buildMetaSnippet({ title: 'T', description: 'D', imageUrl: 'i.png' });
  assert.ok(snippet.includes('<meta property="og:title" content="T">'));
  assert.ok(snippet.includes('<meta name="twitter:title" content="T">'));
  assert.ok(snippet.includes('<meta property="og:description" content="D">'));
  assert.ok(snippet.includes('<meta name="twitter:description" content="D">'));
  // og:image and twitter:image both carry the same URL.
  assert.ok(snippet.includes('<meta property="og:image" content="i.png">'));
  assert.ok(snippet.includes('<meta name="twitter:image" content="i.png">'));
});

test('buildMetaSnippet attribute-escapes content values (quotes, &, <, >)', () => {
  const snippet = buildMetaSnippet({
    title: 'A & B "quote" <x>',
    description: 'go <here> & "there"',
    imageUrl: 'https://e.com/i.png?a=1&b=2',
  });
  assert.ok(snippet.includes('<meta property="og:title" content="A &amp; B &quot;quote&quot; &lt;x&gt;">'));
  assert.ok(snippet.includes('<meta name="twitter:title" content="A &amp; B &quot;quote&quot; &lt;x&gt;">'));
  assert.ok(snippet.includes('<meta property="og:description" content="go &lt;here&gt; &amp; &quot;there&quot;">'));
  // Ampersand in the URL is escaped too, so the attribute stays well-formed.
  assert.ok(snippet.includes('<meta property="og:image" content="https://e.com/i.png?a=1&amp;b=2">'));
});

test('buildMetaSnippet omits empty title/description lines but keeps the static tags', () => {
  const snippet = buildMetaSnippet({});
  assert.deepEqual(lines(snippet), [
    '<meta property="og:type" content="website">',
    '<meta property="og:image" content="preview.png">',   // default image URL
    '<meta name="twitter:card" content="summary_large_image">', // default card
    '<meta name="twitter:image" content="preview.png">',
  ]);
  assert.ok(!snippet.includes('og:title'));
  assert.ok(!snippet.includes('og:description'));
  assert.ok(!snippet.includes('twitter:title'));
  assert.ok(!snippet.includes('og:site_name'));
  // No dimensions given → no width/height lines.
  assert.ok(!snippet.includes('og:image:width'));
  assert.ok(!snippet.includes('og:image:height'));
});

test('buildMetaSnippet trims whitespace-only title/description to omission', () => {
  const snippet = buildMetaSnippet({ title: '   ', description: '\n\t ', imageUrl: 'x.png' });
  assert.ok(!snippet.includes('og:title'));
  assert.ok(!snippet.includes('og:description'));
});

test('buildMetaSnippet defaults imageUrl to preview.png and twitterCard to summary_large_image', () => {
  const snippet = buildMetaSnippet({ title: 'T' });
  assert.ok(snippet.includes('<meta property="og:image" content="preview.png">'));
  assert.ok(snippet.includes('<meta name="twitter:image" content="preview.png">'));
  assert.ok(snippet.includes('<meta name="twitter:card" content="summary_large_image">'));
});

test('buildMetaSnippet honors a custom twitterCard value (escaped)', () => {
  const snippet = buildMetaSnippet({ title: 'T', twitterCard: 'summary' });
  assert.ok(snippet.includes('<meta name="twitter:card" content="summary">'));
});

test('buildMetaSnippet includes dimensions only when positive, and rounds them', () => {
  const withDims = buildMetaSnippet({ title: 'T', width: 1080.7, height: 1920.2 });
  assert.ok(withDims.includes('<meta property="og:image:width" content="1081">'));
  assert.ok(withDims.includes('<meta property="og:image:height" content="1920">'));
  // Zero / negative dims are dropped.
  const noDims = buildMetaSnippet({ title: 'T', width: 0, height: -5 });
  assert.ok(!noDims.includes('og:image:width'));
  assert.ok(!noDims.includes('og:image:height'));
});

test('buildMetaSnippet emits og:site_name only when a site name is supplied', () => {
  assert.ok(buildMetaSnippet({ title: 'T', siteName: 'My Site' })
    .includes('<meta property="og:site_name" content="My Site">'));
  assert.ok(!buildMetaSnippet({ title: 'T' }).includes('og:site_name'));
});
