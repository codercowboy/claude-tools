#!/usr/bin/env node
/*
 * slice-tool.mjs — migration aid: slice a hand-authored single-file tool into
 * the build-assembled `source/` layout (see docs/conventions.md § Build-assembled tools).
 * Detects the pasted shared-include blocks and the tool's own CSS/JS and rewrites
 * them as <<ct:include …>> / <<ct:inline …>> tokens, then SELF-CHECKS that
 * expanding the tokens reproduces the original byte-for-byte before writing
 * anything. If it can't, it throws and writes nothing — slice that tool by hand.
 *
 * LEGACY: the flat-include library it checked blocks against (the old
 * flat-include lib) is retired, so this only works when $JC_INCLUDE_DIR
 * (see build-tool.mjs resolveIncludeDir) points at an include dir.
 *
 * Usage:
 *   node scripts/slice-tool.mjs --dir=src/tools/foo          # write source/
 *   node scripts/slice-tool.mjs --dir=src/tools/foo --dry    # analyze only
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveIncludeDir } from './build-tool.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DIR = resolveIncludeDir(REPO);
if (!INCLUDE_DIR && !process.argv.includes('--help')) {
  console.error('slice-tool: legacy flat-include dir is retired; set $JC_INCLUDE_DIR to use this migration aid.');
  process.exit(1);
}

// Shared include blocks: [name, beginNeedle, endNeedle].
const INCLUDES = [
  ['base.css',    '/* ===== Begin ct-base',    '/* ===== end ct-base ===== */'],
  ['gallery.css', '/* ===== Begin ct-gallery', '/* ===== end ct-gallery ===== */'],
  ['footer.html', '<!------ Begin Footer',      '<!---- end footer -->'],
  ['confirm.js',  '// ===== Begin ctConfirm',   '// ===== end ctConfirm ====='],
  ['copy.js',     '// ===== Begin ctCopy',      '// ===== end ctCopy ====='],
];

function findBlock(html, begin, end) {
  const b = html.indexOf(begin);
  if (b === -1) return null;
  const e = html.indexOf(end, b);
  if (e === -1) return null;
  return html.slice(b, e + end.length);
}

export function sliceTool(toolDir, { dry = false } = {}) {
  const label = toolDir.replace(REPO + '/', '');
  const htmlPath = join(toolDir, 'index.html');
  const original = readFileSync(htmlPath, 'utf8');
  let html = original;
  const notes = [];
  const tokenText = {}; // token filename -> the exact original block text (for self-check)

  // 1. tokenize each shared include that's present
  const includesUsed = [];
  for (const [name, begin, end] of INCLUDES) {
    const blk = findBlock(html, begin, end);
    if (!blk) continue;
    if (html.split(blk).length !== 2) throw new Error(`${label}: include ${name} block not unique`);
    // sanity: block body should match the canonical include body. Skip the strict
    // equality check for a canonical file that carries {{project.*}} tokens or a
    // nested <<ct:include|inline …>> (e.g. footer.html): its shipped block holds
    // the SUBSTITUTED project values and the EXPANDED nested include, so it can
    // never equal the tokenized canonical text. It's still tokenized/inlined
    // normally, and the byte-for-byte SELF-CHECK below still proves losslessness.
    const canon = readFileSync(join(INCLUDE_DIR, name), 'utf8');
    const canonHasTokens = /\{\{project\./.test(canon) || /<<ct:(include|inline) [\w.-]+>>/.test(canon);
    if (!canonHasTokens && canon.trim() !== blk.trim()) throw new Error(`${label}: ${name} block differs from canonical include`);
    html = html.split(blk).join(`<<ct:include ${name}>>`);
    tokenText[name] = blk;
    includesUsed.push(name);
  }
  notes.push(`includes: ${includesUsed.join(', ') || '(none)'}`);

  // 2. tool CSS: first <style>…</style> inner, minus any include token in it
  const styleOpen = html.indexOf('<style>');
  const styleClose = html.indexOf('</style>', styleOpen + 1);
  if (styleOpen === -1 || styleClose === -1) throw new Error(`${label}: no <style> block`);
  const styleInner = html.slice(styleOpen + '<style>'.length, styleClose);
  const incTokenRe = /<<ct:include [\w.-]+>>/g;
  const incTokens = styleInner.match(incTokenRe) || [];
  const lastIncEnd = incTokens.length
    ? styleInner.lastIndexOf(incTokens[incTokens.length - 1]) + incTokens[incTokens.length - 1].length
    : 0;
  const preCss = styleInner.slice(0, lastIncEnd);         // include token(s) at the top, kept in template
  const toolCss = styleInner.slice(lastIncEnd);           // the tool's own CSS -> styles.css
  const afterCssTokens = (preCss.match(incTokenRe) || []).length;
  if (afterCssTokens !== incTokens.length) throw new Error(`${label}: an include token sits inside the tool CSS (non-top-of-<style>) — slice by hand`);
  const newStyleInner = preCss + '<<ct:inline styles.css>>';
  html = html.slice(0, styleOpen + '<style>'.length) + newStyleInner + html.slice(styleClose);
  tokenText['styles.css'] = toolCss;

  // 3. module script: the (single) <script type="module">…</script>
  const modOpenTag = '<script type="module">';
  const modOpen = html.indexOf(modOpenTag);
  const srcFiles = { 'styles.css': toolCss };
  let hasModule = false, hasLogic = false;
  if (modOpen !== -1) {
    if (html.indexOf(modOpenTag, modOpen + 1) !== -1) throw new Error(`${label}: more than one <script type="module"> — slice by hand`);
    const modInnerStart = modOpen + modOpenTag.length;
    const modClose = html.indexOf('</script>', modInnerStart);
    if (modClose === -1) throw new Error(`${label}: module script not closed`);
    const moduleJs = html.slice(modInnerStart, modClose);
    hasModule = true;

    // optional PURE-LOGIC split -> logic.mjs (imported directly by unit tests)
    let beginPure = moduleJs.indexOf('// ===== BEGIN PURE-LOGIC');
    if (beginPure !== -1) {
      while (beginPure > 0 && (moduleJs[beginPure - 1] === ' ' || moduleJs[beginPure - 1] === '\t')) beginPure--;
      const endAt = moduleJs.indexOf('// ===== END PURE-LOGIC');
      if (endAt === -1) throw new Error(`${label}: BEGIN without END PURE-LOGIC`);
      let endLineEnd = moduleJs.indexOf('\n', endAt);
      endLineEnd = endLineEnd === -1 ? moduleJs.length : endLineEnd + 1;
      const preamble = moduleJs.slice(0, beginPure);
      const pure = moduleJs.slice(beginPure, endLineEnd);
      const rest = moduleJs.slice(endLineEnd);
      srcFiles['logic.mjs'] = pure;
      srcFiles['app.mjs'] = preamble + '<<ct:inline logic.mjs>>' + rest;
      hasLogic = true;
    } else {
      srcFiles['app.mjs'] = moduleJs;
    }
    html = html.slice(0, modInnerStart) + '<<ct:inline app.mjs>>' + html.slice(modClose);
    tokenText['app.mjs'] = moduleJs;
    if (hasLogic) tokenText['logic.mjs'] = srcFiles['logic.mjs'];
  }
  notes.push(`module: ${hasModule ? (hasLogic ? 'yes (logic+app split)' : 'yes (app only)') : 'none'}`);

  const template = html;

  // 4. SELF-CHECK: expand tokens with the original block/source texts -> must
  //    equal the original file byte-for-byte (proves the slicing is lossless).
  const expandMap = { ...tokenText };
  let rebuilt = template;
  for (let i = 0; i < 20 && /<<ct:(include|inline) [\w.-]+>>/.test(rebuilt); i++) {
    rebuilt = rebuilt.replace(/<<ct:(include|inline) ([\w.-]+)>>/g, (_m, _k, n) => {
      if (!(n in expandMap)) throw new Error(`${label}: no text for token ${n}`);
      return expandMap[n];
    });
  }
  if (rebuilt !== original) throw new Error(`${label}: SELF-CHECK FAILED (token expansion != original)`);

  const result = { label, includesUsed, hasModule, hasLogic, template, srcFiles, notes };
  if (dry) return result;

  const S = join(toolDir, 'source');
  if (existsSync(join(S, 'index.template.html'))) throw new Error(`${label}: source/ already exists — refusing to overwrite`);
  mkdirSync(S, { recursive: true });
  writeFileSync(join(S, 'index.template.html'), template);
  for (const [name, text] of Object.entries(srcFiles)) writeFileSync(join(S, name), text);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dry = process.argv.includes('--dry');
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  if (!dirArg) { console.error('usage: node scripts/slice-tool.mjs --dir=PATH [--dry]'); process.exit(2); }
  const toolDir = resolve(dirArg.slice('--dir='.length));
  try {
    const r = sliceTool(toolDir, { dry });
    console.log(`✓ ${r.label}: ${dry ? 'DRY — would slice' : 'sliced'} — ${r.notes.join(' | ')}`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
