// Unit tests — SAMPLES (source/logic.mjs). node --test, no browser/DOM.
// Every "Load sample" input must itself round-trip cleanly: format is
// idempotent, and minify is semantically equivalent / still parses. See
// DESIGN.md § "Samples".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLES,
  formatJSON, minifyJSON,
  parseYAML, formatYAML, minifyYAML,
  formatHTML, minifyHTML,
  formatCSS, minifyCSS,
  formatSQL, minifySQL,
  formatJS, minifyJS,
  jsSignificantValues, sqlStream, jsParsesAsModule,
} from './_helpers.mjs';

test('SAMPLES has exactly the six documented languages, all non-empty strings', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), ['css', 'html', 'js', 'json', 'sql', 'yaml']);
  for (const [lang, src] of Object.entries(SAMPLES)) {
    assert.equal(typeof src, 'string', lang);
    assert.ok(src.trim().length > 0, `${lang} sample should be non-empty`);
  }
});

const FORMATTERS = {
  json: formatJSON, yaml: formatYAML, html: formatHTML,
  css: formatCSS, sql: formatSQL, js: formatJS,
};

test('every sample is format-idempotent — fmt(fmt(x)) === fmt(x)', () => {
  for (const [lang, fmt] of Object.entries(FORMATTERS)) {
    const once = fmt(SAMPLES[lang]);
    assert.equal(fmt(once), once, `${lang} format is not idempotent`);
  }
});

test('JSON sample: minify is semantically equal to the source', () => {
  assert.deepEqual(JSON.parse(minifyJSON(SAMPLES.json)), JSON.parse(SAMPLES.json));
});

test('YAML sample: format and minify both re-parse to the same value', () => {
  const base = parseYAML(SAMPLES.yaml);
  assert.deepEqual(parseYAML(formatYAML(SAMPLES.yaml)), base);
  assert.deepEqual(parseYAML(minifyYAML(SAMPLES.yaml)), base);
});

test('HTML sample: minify is idempotent and keeps raw <script> contents verbatim', () => {
  const min = minifyHTML(SAMPLES.html);
  assert.equal(minifyHTML(min), min);
  assert.ok(min.includes('console.log("kept verbatim  ", 1+1);'));
});

test('CSS sample: minify re-parses to the same rule/declaration set', () => {
  // Comment-safe: minify strips comments on both sides, so compare minified
  // forms of the formatted and original stylesheet.
  assert.equal(minifyCSS(formatCSS(SAMPLES.css)), minifyCSS(SAMPLES.css));
});

test('SQL sample: format & minify preserve the token stream', () => {
  assert.deepEqual(sqlStream(formatSQL(SAMPLES.sql)), sqlStream(SAMPLES.sql));
  assert.deepEqual(sqlStream(minifySQL(SAMPLES.sql)), sqlStream(SAMPLES.sql, { dropComments: true }));
});

test('JS sample: format & minify are token-equivalent and both still parse', () => {
  assert.deepEqual(jsSignificantValues(formatJS(SAMPLES.js)), jsSignificantValues(SAMPLES.js));
  assert.deepEqual(jsSignificantValues(minifyJS(SAMPLES.js)), jsSignificantValues(SAMPLES.js));
  assert.ok(jsParsesAsModule(formatJS(SAMPLES.js)));
  assert.ok(jsParsesAsModule(minifyJS(SAMPLES.js)));
});

test('every sample: minify then format is stable where a semantic model exists', () => {
  // JSON: minify then format equals format-of-original.
  assert.equal(formatJSON(minifyJSON(SAMPLES.json)), formatJSON(SAMPLES.json));
  // CSS: minify drops comments, so compare comment-free canonical forms.
  assert.equal(minifyCSS(formatCSS(SAMPLES.css)), minifyCSS(SAMPLES.css));
  // YAML: minify then format re-parses to the same value.
  assert.deepEqual(parseYAML(formatYAML(minifyYAML(SAMPLES.yaml))), parseYAML(SAMPLES.yaml));
});
