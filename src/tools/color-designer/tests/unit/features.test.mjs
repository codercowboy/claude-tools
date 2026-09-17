// Pure logic for the v10 feature batch: seeded rng, CVD simulation, locks,
// WCAG scoring, export formatters, and the additive richer-mood params
// (anchorBias / roles override). DOM-free — node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner, seqRng } from './_helpers.mjs';

const {
  hashStringToInt, mulberry32, makeSeededRng,
  simulateCVD, CVD_TYPES,
  lockKey, applyLocks,
  contrastGrade, contrastLabel, bestForegroundIndex, scorePairs,
  EXPORT_FORMATS, exportPalette, toCssVars, toScss, toJson, toTailwind, toHexList, toRgbaList,
  generateScheme, roll, MOOD_ANY, MOOD_MAP, parseColor, hexString, rgbaString,
} = await loadColorDesigner();

// --- Seeded rng ------------------------------------------------------------
test('hashStringToInt: deterministic, unsigned 32-bit', () => {
  assert.equal(hashStringToInt('abc'), hashStringToInt('abc'));
  assert.notEqual(hashStringToInt('abc'), hashStringToInt('abd'));
  const h = hashStringToInt('anything');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});

test('mulberry32: same seed -> same stream in [0,1); different seed differs', () => {
  const a = mulberry32(12345), b = mulberry32(12345), c = mulberry32(999);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  assert.notDeepEqual(seqA, [c(), c(), c(), c()]);
});

test('makeSeededRng: the same seed string reproduces the same roll', () => {
  const a = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: makeSeededRng('sunset-42'), mood: 'ocean' });
  const b = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: makeSeededRng('sunset-42'), mood: 'ocean' });
  assert.deepEqual(a.schemes, b.schemes);
  const c = roll({ algorithm: 'triadic', seeds: [], count: 4, rng: makeSeededRng('other'), mood: 'ocean' });
  assert.notDeepEqual(a.schemes, c.schemes);
});

// --- CVD -------------------------------------------------------------------
test('simulateCVD: "none"/unknown type is an identity copy (alpha preserved)', () => {
  const c = { r: 10, g: 200, b: 90, a: 0.5 };
  assert.deepEqual(simulateCVD(c, 'none'), { r: 10, g: 200, b: 90, a: 0.5 });
  assert.deepEqual(simulateCVD(c, 'bogus'), { r: 10, g: 200, b: 90, a: 0.5 });
});

test('simulateCVD: known matrix output for pure red under protanopia', () => {
  // protanopia row0 = [0.567,0.433,0], so red(255,0,0) -> r=round(0.567*255)=145
  const out = simulateCVD({ r: 255, g: 0, b: 0, a: 1 }, 'protanopia');
  assert.equal(out.r, 145);
  assert.equal(out.g, Math.round(0.558 * 255)); // 142
  assert.equal(out.b, 0);
  for (const ch of ['r', 'g', 'b']) assert.ok(out[ch] >= 0 && out[ch] <= 255);
});

test('simulateCVD: grey is unchanged by every CVD type (rows sum to 1)', () => {
  for (const { key } of CVD_TYPES) {
    if (key === 'none') continue;
    const out = simulateCVD({ r: 128, g: 128, b: 128, a: 1 }, key);
    assert.equal(out.r, 128, key);
    assert.equal(out.g, 128, key);
    assert.equal(out.b, 128, key);
  }
});

// --- Locks -----------------------------------------------------------------
test('lockKey: "scheme:color" string', () => {
  assert.equal(lockKey(2, 3), '2:3');
});

test('applyLocks: overwrites exactly the locked slots, leaves others', () => {
  const schemes = [[{ r: 1, g: 1, b: 1, a: 1 }, { r: 2, g: 2, b: 2, a: 1 }]];
  const locked = { '0:1': { r: 9, g: 9, b: 9, a: 1 } };
  applyLocks(schemes, locked);
  assert.deepEqual(schemes[0][0], { r: 1, g: 1, b: 1, a: 1 });
  assert.deepEqual(schemes[0][1], { r: 9, g: 9, b: 9, a: 1 });
});

test('applyLocks: skips out-of-range slots and missing schemes; null locked is a no-op', () => {
  const schemes = [[{ r: 1, g: 1, b: 1, a: 1 }]];
  applyLocks(schemes, { '0:5': { r: 9, g: 9, b: 9, a: 1 }, '7:0': { r: 9, g: 9, b: 9, a: 1 } });
  assert.deepEqual(schemes, [[{ r: 1, g: 1, b: 1, a: 1 }]]);
  assert.doesNotThrow(() => applyLocks(schemes, null));
});

test('applyLocks: defaults a missing alpha to 1', () => {
  const schemes = [[{ r: 0, g: 0, b: 0, a: 1 }]];
  applyLocks(schemes, { '0:0': { r: 5, g: 6, b: 7 } });
  assert.equal(schemes[0][0].a, 1);
});

// --- WCAG scoring ----------------------------------------------------------
test('contrastGrade / contrastLabel: threshold boundaries', () => {
  assert.equal(contrastLabel(21), 'AAA');
  assert.equal(contrastLabel(7), 'AAA');
  assert.equal(contrastLabel(4.5), 'AA');
  assert.equal(contrastLabel(3), 'AA Large');
  assert.equal(contrastLabel(2.9), 'Fail');
  const g = contrastGrade(4.5);
  assert.equal(g.AA, true);
  assert.equal(g.AAA, false);
  assert.equal(g.AALarge, true);
});

test('bestForegroundIndex: picks max-contrast partner (black vs white on a mid grey)', () => {
  const scheme = [
    { r: 128, g: 128, b: 128, a: 1 }, // bg
    { r: 255, g: 255, b: 255, a: 1 }, // white
    { r: 0, g: 0, b: 0, a: 1 },       // black
  ];
  const fg = bestForegroundIndex(scheme, 0);
  assert.equal(fg, 2); // black has higher contrast on mid-grey than white
});

test('scorePairs: one row per color, each with a valid partner + ratio', () => {
  const scheme = [
    { r: 0, g: 0, b: 0, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 },
    { r: 200, g: 30, b: 30, a: 1 },
  ];
  const rows = scorePairs(scheme);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(row.fg >= 0 && row.fg < scheme.length && row.fg !== row.bg);
    assert.ok(row.ratio >= 1 && row.ratio <= 21);
  }
  // black vs white is the maximal 21:1 pair
  assert.ok(Math.abs(rows[0].ratio - 21) < 0.01);
  assert.equal(rows[0].AAA, true);
});

// --- Export formatters -----------------------------------------------------
const SCHEME = [
  { r: 255, g: 0, b: 0, a: 1 },
  { r: 0, g: 128, b: 255, a: 1 },
];

test('EXPORT_FORMATS: every format has key/label/ext/mime and exportPalette handles it', () => {
  for (const f of EXPORT_FORMATS) {
    assert.ok(f.key && f.label && f.ext && f.mime, JSON.stringify(f));
    const out = exportPalette(SCHEME, f.key);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});

test('toCssVars: :root block with --color-N hex vars', () => {
  const out = toCssVars(SCHEME);
  assert.match(out, /:root\s*\{/);
  assert.match(out, /--color-1:\s*#ff0000;/);
  assert.match(out, /--color-2:\s*#0080ff;/);
});

test('toScss: $color-N vars + a $palette map', () => {
  const out = toScss(SCHEME);
  assert.match(out, /\$color-1:\s*#ff0000;/);
  assert.match(out, /\$palette:\s*\(/);
});

test('toJson: parseable array of {hex,rgba}', () => {
  const parsed = JSON.parse(toJson(SCHEME));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].hex, '#ff0000');
  assert.equal(parsed[0].rgba, rgbaString(SCHEME[0]));
});

test('toTailwind: nested palette color object with numbered keys', () => {
  const out = toTailwind(SCHEME);
  assert.match(out, /palette:\s*\{/);
  assert.match(out, /'1':\s*'#ff0000'/);
});

test('toHexList / toRgbaList: one value per line', () => {
  assert.equal(toHexList(SCHEME), '#ff0000\n#0080ff');
  assert.equal(toRgbaList(SCHEME), `${rgbaString(SCHEME[0])}\n${rgbaString(SCHEME[1])}`);
});

test('exportPalette: unknown format falls back to a hex list', () => {
  assert.equal(exportPalette(SCHEME, 'nope'), toHexList(SCHEME));
});

// --- Richer mood params (additive) -----------------------------------------
test('generateScheme: absent anchorBias/roles is byte-identical to MOOD_ANY default', () => {
  const seq = [0.2, 0.7, 0.4, 0.9, 0.1, 0.55, 0.33, 0.8, 0.15, 0.6];
  for (const algo of ['complementary', 'triadic', 'tetradic', 'analogous']) {
    for (const n of [2, 4, 7]) {
      const a = generateScheme(algo, [], n, seqRng(seq), MOOD_ANY);
      const b = generateScheme(algo, [], n, seqRng(seq)); // default mood arg
      assert.deepEqual(a, b, `${algo} n=${n}`);
    }
  }
});

test('generateScheme: a roles override changes the fill while keeping N valid', () => {
  const seq = [0.3, 0.6, 0.2, 0.8, 0.45, 0.1, 0.9];
  const base = generateScheme('triadic', [], 5, seqRng(seq), MOOD_MAP.ocean);
  const custom = { ...MOOD_MAP.ocean, roles: [{ name: 'flat', dL: 0, dS: 0 }] };
  const overridden = generateScheme('triadic', [], 5, seqRng(seq), custom);
  assert.equal(overridden.length, 5);
  assert.notDeepEqual(base, overridden); // single flat role removes the shade/tint swing
});

test('generateScheme: anchorBias shifts non-base anchors but not the base color', () => {
  const seq = [0.9, 0.5, 0.5, 0.2, 0.7]; // no seed-base branch (no seeds)
  const plain = generateScheme('complementary', [], 2, seqRng(seq), MOOD_ANY);
  const biased = generateScheme('complementary', [], 2, seqRng(seq), { ...MOOD_ANY, anchorBias: 40 });
  assert.deepEqual(plain[0], biased[0]);       // slot 0 uses offset 0 -> unchanged
  assert.notDeepEqual(plain[1], biased[1]);     // slot 1 uses offset 180 -> shifted
});
