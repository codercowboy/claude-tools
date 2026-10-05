// =====================================================================
// Pretty-Printer & Minifier — pure engine (DOM-free, exported, unit-tested).
//
// The six language pretty/minify engines + tokenizers now live in the shared,
// Node-importable module src/lib/utils/formats/CtPretty.mjs (promoted to jason-code,
// vendored here). This file imports that engine and re-exports its API, and
// keeps the tool-specific built-in SAMPLES (the "Load sample" demo text, which
// carries claude-tools project identity) local. The unit tests read this
// module's namespace and app.mjs inlines this file at build time, so the
// surface is unchanged; the build resolves the import and inlines the engine
// body (stripping each export) so the shipped index.html stays dependency-free
// and file://-openable.
//
// NOTE: the SAMPLES strings below contain the WORDS import/export and a script
// close-tag inside template literals — they are sample DATA, not code. The
// build's import-inliner masks strings/templates, so they are left untouched;
// the import/export lists themselves carry no interior comments so the inliner
// parses them literally.
// =====================================================================
import {
  byteLength, indentUnit, lineColFromOffset,
  formatJSON, minifyJSON,
  parseYAML, formatYAML, minifyYAML,
  formatHTML, minifyHTML,
  formatCSS, minifyCSS,
  tokenizeSQL, formatSQL, minifySQL,
  tokenizeJS, formatJS, minifyJS,
} from '../../../lib/utils/formats/CtPretty.mjs';

const SAMPLES = {
  json: `{"name":"claude-tools","version":"0.1.0","keywords":["vanilla","tools"],"nested":{"a":1,"b":[true,false,null],"pi":3.14},"empty":{}}`,
  yaml: `# A small project descriptor
name: pretty-printer
version: 0.1.0
tags:
  - json
  - yaml
  - html
server:
  host: localhost
  port: 8080
  debug: false
matrix:
  - {os: linux, node: 20}
  - {os: macos, node: 22}
`,
  html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Demo</title></head>
<body><header><h1>Hello</h1></header><main><p>This is a <strong>tiny</strong> demo with a <a href="#top">link</a>.</p>
<ul><li>One</li><li>Two</li></ul></main>
<script>console.log("kept verbatim  ", 1+1);</script>
</body></html>`,
  css: `/* theme */
:root{--gap:8px;--fg:#1c1c1f}
body{margin:0;font-family:system-ui,sans-serif;color:var(--fg)}
.card,.panel{display:flex;gap:var(--gap);padding:12px;background:url("bg.png") no-repeat}
@media (max-width:640px){.card{flex-direction:column}}`,
  sql: `select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = true and u.created_at > '2020-01-01' group by u.id, u.name having count(o.id) > 3 order by orders desc limit 10;`,
  js: `// tiny module
import {readFile} from 'node:fs/promises';
const re = /\\/(\\d+)\\//g;
function greet(name='world'){
  const msg = \`hello \${name.trim() || 'friend'}!\`;
  return msg.replace(re, m => m.toUpperCase());
}
const nums = [1,2,3].map(n => n*2).filter(n => n > 2);
export {greet, nums};
`,
};

export {
  byteLength, indentUnit, lineColFromOffset,
  formatJSON, minifyJSON,
  parseYAML, formatYAML, minifyYAML,
  formatHTML, minifyHTML,
  formatCSS, minifyCSS,
  tokenizeSQL, formatSQL, minifySQL,
  tokenizeJS, formatJS, minifyJS,
  SAMPLES,
};
