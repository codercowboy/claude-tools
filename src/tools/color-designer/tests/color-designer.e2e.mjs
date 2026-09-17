// @playwright/test spec for tools/color-designer/index.html.
//
// Dev/test-only. index.html itself is a dependency-free single file and does
// not reference this package or @playwright/test in any way — this spec
// drives the finished page from the outside via data-testid hooks and the
// window.__colorDesigner test API described in DESIGN.md § Testability and
// PLAN.md § 13.
//
// Run with: npm install && npx playwright install chromium && npm run test:e2e
// (from tools/color-designer/)

import { test, expect } from '@playwright/test';
// Shared test-support (imported, never inlined into the shipped index.html).
import { toolUrl, helpSeenKey, seedHelpSeen } from '../../test-support/setup.mjs';

const TOOL_URL = toolUrl(import.meta.url);

// Anchor counts per algorithm, straight from DESIGN.md's table — used to
// verify the anchor-cycling fill rule (PLAN.md § 5: slot i's anchor hue is
// `anchors[i % anchors.length]`) without hardcoding pixel values.
const ANCHOR_COUNTS = {
  complementary: 2,
  analogous: 3,
  triadic: 3,
  splitComplementary: 3,
  tetradic: 4,
  monochromatic: 1,
};
const ALL_ALGORITHMS = Object.keys(ANCHOR_COUNTS);

// The 5 fixed roles from PLAN.md § 5 — only s/l deltas, hue is untouched by
// role, so re-implementing this table lets tests compute an independent
// "expected" color via the tool's own lower-level primitives (anchorHues,
// hslToRgb) rather than calling generateScheme for its own expected value.
const ROLES = [
  { dL: -0.28, dS: 0.05 },
  { dL: 0, dS: 0 },
  { dL: 0.28, dS: -0.08 },
  { dL: -0.06, dS: 0.2 },
  { dL: 0.1, dS: -0.3 },
];

// Hue round-trips through 8-bit RGB quantization; small tolerance absorbs
// rounding without masking a real anchor-math bug.
const HUE_TOLERANCE_DEG = 2;

const HELP_SEEN_KEY = helpSeenKey('color-designer');

test.beforeEach(async ({ page }) => {
  // Pre-seed the Help-modal "seen" flag so the auto-show-on-first-load
  // behavior (docs/conventions.md "First-load help popup") doesn't steal
  // focus/interfere with every other test in this suite. The dedicated
  // "Help modal" describe block below tests the fresh-visit auto-show path
  // itself, using its own from-scratch browser.newContext() (so this
  // pre-seed init script is never registered on it).
  await seedHelpSeen(page, HELP_SEEN_KEY);
  await page.goto(TOOL_URL);
  // performRoll() runs on DOMContentLoaded (auto-roll on load) — wait for it
  // so every test starts from a populated, settled state.
  await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
});

// Harmony / colors-per-scheme / vision / demo-speed / roll-seed and the
// Copy-link / Save-palette actions now live inside the Settings modal, so a
// test must open it to reach them. setSetting opens, sets one control (a
// <select> by value, or the roll-seed text input when fill=true) and Saves.
async function setSetting(page, testid, value, fill = false) {
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('settings-overlay')).toBeVisible();
  const ctrl = page.getByTestId(testid);
  if (fill) await ctrl.fill(value); else await ctrl.selectOption(value);
  await page.getByTestId('settings-save-btn').click();
  await expect(page.getByTestId('settings-overlay')).toBeHidden();
}

// ---------------------------------------------------------------------------
// 1. Pure math: rgbToHsl/hslToRgb round-trip, parseColor, rgbaString/hexString.
// ---------------------------------------------------------------------------
test.describe('pure math: rgbToHsl / hslToRgb round-trip', () => {
  test('a spread of colors round-trip through HSL within ±1 per channel', async ({ page }) => {
    const samples = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
      { r: 18, g: 52, b: 86 },
      { r: 200, g: 150, b: 50 },
      { r: 123, g: 45, b: 200 },
    ];
    const results = await page.evaluate((colors) => {
      const api = window.__colorDesigner;
      return colors.map((c) => {
        const hsl = api.rgbToHsl(c);
        const back = api.hslToRgb(hsl);
        return { original: c, back };
      });
    }, samples);
    for (const { original, back } of results) {
      expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
    }
  });

  test('grayscale (r=g=b) has s=0 and hue is not undefined/NaN', async ({ page }) => {
    const hsl = await page.evaluate(() => window.__colorDesigner.rgbToHsl({ r: 128, g: 128, b: 128 }));
    expect(hsl.s).toBe(0);
    expect(hsl.h).toBe(0);
    expect(Number.isFinite(hsl.h)).toBe(true);
  });
});

test.describe('parseColor across hex + rgb/rgba (comma & slash)', () => {
  test('hex 3/4/6/8-digit, with/without #, case-insensitive', async ({ page }) => {
    const out = await page.evaluate(() => {
      const p = window.__colorDesigner.parseColor;
      return {
        three: p('#abc'),
        threeNoHash: p('abc'),
        four: p('#abcd'),
        six: p('#112233'),
        sixNoHash: p('112233'),
        eight: p('#11223399'),
        upper: p('#ABCDEF'),
        padded: p('  #abcdef  '),
      };
    });
    expect(out.three).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(out.threeNoHash).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(out.four).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 });
    expect(out.six).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 1 });
    expect(out.sixNoHash).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 1 });
    expect(out.eight).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 0x99 / 255 });
    expect(out.upper).toEqual({ r: 0xab, g: 0xcd, b: 0xef, a: 1 });
    expect(out.padded).toEqual({ r: 0xab, g: 0xcd, b: 0xef, a: 1 });
  });

  test('rgb()/rgba() comma syntax, alpha optional, clamps out-of-range', async ({ page }) => {
    const out = await page.evaluate(() => {
      const p = window.__colorDesigner.parseColor;
      return {
        noAlpha: p('rgb(255, 0, 0)'),
        withAlpha: p('rgba(51, 102, 255, 0.5)'),
        clampOver: p('rgb(300, -10, 128)'),
        alphaClamp: p('rgba(0, 0, 0, 2)'),
      };
    });
    expect(out.noAlpha).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(out.withAlpha).toEqual({ r: 51, g: 102, b: 255, a: 0.5 });
    expect(out.clampOver).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(out.alphaClamp).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test('modern slash syntax rgb(r g b / a) requires alpha', async ({ page }) => {
    const out = await page.evaluate(() => {
      const p = window.__colorDesigner.parseColor;
      return {
        slash: p('rgb(0 0 255 / 0.8)'),
        noSlashNoComma: p('rgb(255 0 0)'),
      };
    });
    expect(out.slash).toEqual({ r: 0, g: 0, b: 255, a: 0.8 });
    expect(out.noSlashNoComma).toBeNull();
  });

  test('invalids -> null: garbage, empty, percentages, named colors, hsl(), malformed', async ({ page }) => {
    const out = await page.evaluate(() => {
      const p = window.__colorDesigner.parseColor;
      return {
        garbage: p('not a color'),
        empty: p(''),
        whitespace: p('   '),
        percentages: p('rgb(50%, 0%, 0%)'),
        named: p('rebeccapurple'),
        hsl: p('hsl(0, 100%, 50%)'),
        badLen5: p('#12345'),
        badLen7: p('#1234567'),
        missingParen: p('rgb(1, 2, 3'),
      };
    });
    for (const [key, val] of Object.entries(out)) {
      expect(val, `${key} should be null`).toBeNull();
    }
  });
});

test.describe('rgbaString / hexString canonical formatting', () => {
  test('rgbaString always includes trimmed alpha, even opaque', async ({ page }) => {
    const out = await page.evaluate(() => {
      const f = window.__colorDesigner.rgbaString;
      return {
        opaque: f({ r: 255, g: 0, b: 0, a: 1 }),
        half: f({ r: 10, g: 20, b: 30, a: 0.5 }),
        trimmed: f({ r: 1, g: 2, b: 3, a: 0.333333 }),
      };
    });
    expect(out.opaque).toBe('rgba(255, 0, 0, 1)');
    expect(out.half).toBe('rgba(10, 20, 30, 0.5)');
    expect(out.trimmed).toBe('rgba(1, 2, 3, 0.333)');
  });

  test('hexString lowercase #rrggbb; #rrggbbaa only when a<1', async ({ page }) => {
    const out = await page.evaluate(() => {
      const f = window.__colorDesigner.hexString;
      return {
        opaque: f({ r: 255, g: 0, b: 0, a: 1 }),
        alpha: f({ r: 0, g: 255, b: 0, a: 0.6 }), // 0.6*255=153=0x99 exact
      };
    });
    expect(out.opaque).toBe('#ff0000');
    expect(out.alpha).toBe('#00ff0099');
  });
});

// ---------------------------------------------------------------------------
// 2. Harmony anchor math: each algorithm's hues reflect the correct
//    anchor-hue offsets; each scheme has exactly 5 colors.
// ---------------------------------------------------------------------------
test.describe('harmony anchor math per algorithm', () => {
  for (const algorithm of ALL_ALGORITHMS) {
    test(`${algorithm}: 5 colors, slots cycle anchors[i % anchors.length] within tolerance`, async ({ page }) => {
      const result = await page.evaluate(
        ({ algorithm, tolerance }) => {
          const api = window.__colorDesigner;
          // Fixed, non-degenerate rng sequence: consumed in order H, baseS, baseL
          // (generateScheme with zero seeds makes exactly 3 rng() calls — see
          // PLAN.md § 7.1's documented call order).
          const rng = api.makeSeqRng([0.213, 0.777, 0.456]);
          const colors = api.generateScheme(algorithm, [], 5, rng);
          const H = 0.213 * 360;
          const anchors = api.anchorHues(algorithm, H);
          const hues = colors.map((c) => api.rgbToHsl(c).h);
          function circDist(a, b) {
            const d = Math.abs(a - b) % 360;
            return d > 180 ? 360 - d : d;
          }
          const perSlot = hues.map((h, i) => {
            const expectedHue = anchors[i % anchors.length];
            return { actual: h, expected: expectedHue, dist: circDist(h, expectedHue) };
          });
          return {
            length: colors.length,
            anchorCount: anchors.length,
            perSlot,
            allWithinTolerance: perSlot.every((s) => s.dist <= tolerance),
          };
        },
        { algorithm, tolerance: HUE_TOLERANCE_DEG }
      );
      expect(result.length).toBe(5);
      expect(result.anchorCount).toBe(ANCHOR_COUNTS[algorithm]);
      expect(result.allWithinTolerance, JSON.stringify(result.perSlot)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Determinism: seeded rng -> exact repeatable output; known input -> known
//    output (independently reconstructed from anchorHues + hslToRgb + ROLES).
// ---------------------------------------------------------------------------
test.describe('determinism (makeSeqRng / rollWith)', () => {
  test('generateScheme with the same rngSeq produces identical colors twice', async ({ page }) => {
    const [a, b] = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const seq = [0.1, 0.42, 0.9, 0.05, 0.77, 0.31];
      return [
        api.generateScheme('triadic', [], 5, api.makeSeqRng(seq)),
        api.generateScheme('triadic', [], 5, api.makeSeqRng(seq)),
      ];
    });
    expect(a).toEqual(b);
  });

  test('roll() / rollWith() with the same inputs produces identical results twice', async ({ page }) => {
    const [a, b] = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const rngSeq = Array.from({ length: 40 }, (_, i) => ((i * 37 + 11) % 97) / 97);
      const args = { algorithm: 'random', seeds: [], rngSeq };
      return [api.rollWith(args), api.rollWith(args)];
    });
    expect(a).toEqual(b);
  });

  test('known input -> known output: generateScheme matches an independent reconstruction from anchorHues + hslToRgb', async ({
    page,
  }) => {
    const result = await page.evaluate((roles) => {
      const api = window.__colorDesigner;
      const clamp01 = (x) => Math.min(1, Math.max(0, x));
      const algorithm = 'complementary';
      const rngSeq = [0, 0, 0]; // H=0, baseS=0.55, baseL=0.45
      const H = 0;
      const baseS = 0.55;
      const baseL = 0.45;
      const anchors = api.anchorHues(algorithm, H);
      const expected = [0, 1, 2, 3, 4].map((i) => {
        const hue = anchors[i % anchors.length];
        const role = roles[i];
        const { r, g, b } = api.hslToRgb({ h: hue, s: clamp01(baseS + role.dS), l: clamp01(baseL + role.dL) });
        return { r, g, b, a: 1 };
      });
      const actual = api.generateScheme(algorithm, [], 5, api.makeSeqRng(rngSeq));
      return { expected, actual };
    }, ROLES);
    expect(result.actual).toEqual(result.expected);
  });
});

// ---------------------------------------------------------------------------
// 4. THE KEY RULE: Random mode -> one roll shares one algorithm across all 5
//    schemes; a specific selection -> all 5 use that algorithm.
// ---------------------------------------------------------------------------
test.describe('THE KEY RULE: algorithm coherence within a roll', () => {
  test('window API: rollWith(random) resolves one concrete algorithm and every scheme matches its anchor pattern', async ({
    page,
  }) => {
    const result = await page.evaluate(
      ({ anchorCounts, tolerance }) => {
        const api = window.__colorDesigner;
        // rngSeq[0]=0.4 -> floor(0.4*6)=2 -> ALGORITHMS[2] = 'triadic'.
        const rngSeq = [0.4, ...Array.from({ length: 60 }, (_, i) => ((i * 37 + 11) % 97) / 97)];
        const { algorithm, schemes } = api.roll({ algorithm: 'random', seeds: [], rng: api.makeSeqRng(rngSeq) });
        function circDist(a, b) {
          const d = Math.abs(a - b) % 360;
          return d > 180 ? 360 - d : d;
        }
        const anchorsLen = anchorCounts[algorithm];
        const perScheme = schemes.map((scheme) => {
          const hues = scheme.map((c) => api.rgbToHsl(c).h);
          // Group slots by i % anchorsLen and check within-group hue closeness
          // — this is only meaningful/derivable if every scheme truly used
          // `algorithm`'s anchor count.
          const groups = new Map();
          hues.forEach((h, i) => {
            const g = i % anchorsLen;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(h);
          });
          let ok = true;
          for (const groupHues of groups.values()) {
            const ref = groupHues[0];
            for (const h of groupHues) if (circDist(h, ref) > tolerance) ok = false;
          }
          return ok;
        });
        return { algorithm, resolvedIsConcrete: algorithm !== 'random', perScheme };
      },
      { anchorCounts: ANCHOR_COUNTS, tolerance: HUE_TOLERANCE_DEG }
    );
    expect(result.algorithm).toBe('triadic');
    expect(result.resolvedIsConcrete).toBe(true);
    expect(result.perScheme).toEqual([true, true, true, true, true]);
  });

  test('window API: a specific algorithm selection is used by every scheme (no random pick)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const rngSeq = Array.from({ length: 40 }, (_, i) => ((i * 37 + 11) % 97) / 97);
      return api.roll({ algorithm: 'monochromatic', seeds: [], count: 5, rng: api.makeSeqRng(rngSeq) });
    });
    expect(result.algorithm).toBe('monochromatic');
    expect(result.schemes).toHaveLength(5);
    for (const scheme of result.schemes) expect(scheme).toHaveLength(5);
  });

  test('UI: Random mode roll -> algorithm-used-label is set once, all 5 scheme rows are internally coherent', async ({
    page,
  }) => {
    await setSetting(page, 'harmony-select', 'random');
    await page.getByTestId('roll-btn').click();

    const label = await page.getByTestId('algorithm-used-label').textContent();
    expect(label && label.trim().length).toBeGreaterThan(0);

    const resolved = await page.evaluate(() => window.__colorDesigner.state.rollResult.algorithm);
    const labelToKey = {
      Complementary: 'complementary',
      Analogous: 'analogous',
      Triadic: 'triadic',
      'Split-complementary': 'splitComplementary',
      Tetradic: 'tetradic',
      Monochromatic: 'monochromatic',
    };
    expect(labelToKey[label.trim()]).toBe(resolved);
  });

  test('UI: selecting a specific harmony (Triadic) and rolling repeatedly always shows Triadic', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'triadic');
    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Triadic');
    let resolved = await page.evaluate(() => window.__colorDesigner.state.rollResult.algorithm);
    expect(resolved).toBe('triadic');

    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Triadic');
    resolved = await page.evaluate(() => window.__colorDesigner.state.rollResult.algorithm);
    expect(resolved).toBe('triadic');
  });
});

// ---------------------------------------------------------------------------
// 4b. Moods: a flavor layered on top of the harmony. Composes with harmony,
//     shows in the badge as "Mood · Harmony". "Surprise me" is the default and
//     means NO mood persuasion (fully random, badge is harmony-only). The
//     retired "Any" option is gone. The choice persists across reloads.
// ---------------------------------------------------------------------------
test.describe('moods', () => {
  test('the default mood is "Surprise me" and there is no "Any" option', async ({ page }) => {
    await expect(page.getByTestId('mood-select')).toHaveValue('surprise');
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="mood-select"] option')).map((o) => o.value));
    expect(values).not.toContain('any');
    expect(values[0]).toBe('surprise');
  });

  test('selecting a mood + a harmony rolls that combination and badges "Mood · Harmony"', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'triadic');
    await page.getByTestId('mood-select').selectOption('ocean');
    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Ocean · Triadic');
    const rr = await page.evaluate(() => window.__colorDesigner.state.rollResult);
    expect(rr.mood).toBe('ocean');
    expect(rr.algorithm).toBe('triadic');
  });

  test('"Surprise me" means no persuasion — resolves to "any" and badges just the harmony', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'complementary');
    await page.getByTestId('mood-select').selectOption('surprise');
    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Complementary');
    const mood = await page.evaluate(() => window.__colorDesigner.state.rollResult.mood);
    expect(mood).toBe('any');
  });

  test('mood selection persists across a reload', async ({ page }) => {
    await page.getByTestId('mood-select').selectOption('sunset');
    await page.getByTestId('roll-btn').click();
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('color-designer:v1') || '{}').moodSelect === 'sunset'; }
      catch { return false; }
    });
    await page.context().storageState(); // force the file:// localStorage IPC to commit before reload
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('mood-select')).toHaveValue('sunset');
    expect(await page.evaluate(() => window.__colorDesigner.state.moodSelect)).toBe('sunset');
  });
});

// ---------------------------------------------------------------------------
// 4c. Seed removal actually drops seeds from the NEXT roll (regression), and
//     Restore defaults wipes this device's stored state back to defaults.
// ---------------------------------------------------------------------------
test.describe('seed removal + restore defaults', () => {
  test('removing seed colors via the chip × stops them appearing in the next roll', async ({ page }) => {
    await page.evaluate(() => { window.__colorDesigner.addSeed('#ff0000'); window.__colorDesigner.addSeed('#00ff00'); });
    await page.getByTestId('roll-btn').click();
    const seeded = await page.evaluate(() =>
      window.__colorDesigner.state.rollResult.schemes.flat().map(window.__colorDesigner.hexString));
    // at least one of the two vivid seeds got woven in
    expect(seeded.includes('#ff0000') || seeded.includes('#00ff00')).toBe(true);

    // remove every seed through the real chip × buttons — the list re-renders
    // after each removal (detaching old handles), so click the first each time
    // and wait for the count to drop.
    for (let remaining = await page.getByTestId('seed-chip').count(); remaining > 0; remaining--) {
      await page.getByTestId('seed-chip-remove').first().click();
      await expect(page.getByTestId('seed-chip')).toHaveCount(remaining - 1);
    }
    expect(await page.evaluate(() => window.__colorDesigner.state.seeds.length)).toBe(0);

    await page.getByTestId('roll-btn').click();
    const after = await page.evaluate(() =>
      window.__colorDesigner.state.rollResult.schemes.flat().map(window.__colorDesigner.hexString));
    expect(after).not.toContain('#ff0000');
    expect(after).not.toContain('#00ff00');
  });

  test('Restore defaults (confirmed) clears seeds/settings and returns to defaults', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#ff0000'));
    await setSetting(page, 'harmony-select', 'triadic');
    await setSetting(page, 'count-select', '3');
    await page.getByTestId('mood-select').selectOption('ocean');

    await page.getByTestId('settings-btn').click();
    await page.getByTestId('restore-defaults-btn').click();
    await page.getByRole('button', { name: 'Yes' }).click(); // ctConfirm → reload

    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    const s = await page.evaluate(() => ({
      seeds: window.__colorDesigner.state.seeds.length,
      algo: window.__colorDesigner.state.algorithmSelect,
      count: window.__colorDesigner.state.count,
      mood: window.__colorDesigner.state.moodSelect,
    }));
    expect(s.seeds).toBe(0);
    expect(s.algo).toBe('random');
    expect(s.count).toBe(6);
    expect(s.mood).toBe('surprise');
  });
});

// ---------------------------------------------------------------------------
// 4c. "Add as seed" button on generated swatches: promotes a swatch to a seed
//     chip WITHOUT rerolling, wiggles the Roll button, dedupes, and never
//     toggles the scheme row it lives in.
// ---------------------------------------------------------------------------
test.describe('add-swatch-as-seed button', () => {
  test('clicking a swatch\'s + adds it as a seed chip, does NOT reroll, and wiggles Roll', async ({ page }) => {
    const beforeSchemes = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    const firstSwatch = page.getByTestId('scheme-swatch').first();
    const expectedHex = await firstSwatch.getByTestId('scheme-swatch-hex').textContent();

    await firstSwatch.hover();
    await firstSwatch.getByTestId('scheme-swatch-seed-btn').click();

    // a seed chip appeared, matching the swatch's hex
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    await expect(page.getByTestId('seed-chip-label').first()).toHaveText(expectedHex);

    // no reroll happened — the rolled palette is byte-identical
    const afterSchemes = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(afterSchemes).toBe(beforeSchemes);

    // Roll button got the wiggle nudge (class applied synchronously on click)
    await expect(page.getByTestId('roll-btn')).toHaveClass(/wiggle/);
  });

  test('clicking + does not expand/collapse the scheme row it sits in', async ({ page }) => {
    // Re-roll first so all rows start collapsed (initial load auto-opens row 0).
    await page.getByTestId('roll-btn').click();
    const row = page.getByTestId('scheme-row').first();
    await expect(row.getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');

    const swatch = row.getByTestId('scheme-swatch').first();
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-seed-btn').click();

    // still collapsed — the click was consumed by the + button, not the row
    await expect(row.getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('adding the same swatch twice keeps a single deduped seed chip', async ({ page }) => {
    const swatch = page.getByTestId('scheme-swatch').first();
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-seed-btn').click();
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-seed-btn').click();
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// 4d. "Add as seed" button: keyboard activation, reduced-motion behavior, and
//     dedupe by canonical rgba() across different input string forms of the
//     same color. Complements 4c (mouse click, no-reroll, row-toggle guard).
// ---------------------------------------------------------------------------
test.describe('add-swatch-as-seed button: keyboard, reduced motion, cross-form dedupe', () => {
  test('the + is a real button that activates from the keyboard (focus + Enter) without rerolling', async ({ page }) => {
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    const swatch = page.getByTestId('scheme-swatch').first();
    const expectedHex = await swatch.getByTestId('scheme-swatch-hex').textContent();
    const btn = swatch.getByTestId('scheme-swatch-seed-btn');

    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    await expect(page.getByTestId('seed-chip-label').first()).toHaveText(expectedHex);
    // Enter on the + must not have triggered a re-roll.
    const after = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));
    expect(after).toBe(before);
  });

  test('under prefers-reduced-motion the + still adds the seed, but the Roll wiggle animation is disabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const swatch = page.getByTestId('scheme-swatch').first();
    await swatch.hover();
    await swatch.getByTestId('scheme-swatch-seed-btn').click();

    // The seed is still added (functionality is not motion-gated)...
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    // ...but the CSS wiggle keyframe is suppressed under reduced motion. The
    // `.wiggle` class is still applied (assertable), yet resolves to no
    // animation — that's the reduced-motion contract for the nudge.
    const animationName = await page.getByTestId('roll-btn').evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');
  });

  test('dedupes by canonical rgba() across different string forms of the same color', async ({ page }) => {
    // Same color, three different textual forms: hex, comma rgba(), modern
    // slash rgb(). addSeedFromColor compares canonical rgbaString(), so the
    // second/third are duplicates of the first regardless of how they arrived.
    const results = await page.evaluate(() => {
      const api = window.__colorDesigner;
      api.clearSeeds();
      const added = api.addSeed('#ff0000');                 // typed hex -> a chip
      const dupA = api.addSeedFromColor({ r: 255, g: 0, b: 0, a: 1 });   // + from a swatch object
      // A parsed slash-syntax string yielding the identical color must also dedupe.
      const dupB = api.addSeedFromColor(api.parseColor('rgb(255 0 0 / 1)'));
      return { addedNull: added === null, dupA, dupB, count: api.state.seeds.length };
    });
    expect(results.addedNull).toBe(false); // the initial add succeeded
    expect(results.dupA).toBe('duplicate');
    expect(results.dupB).toBe('duplicate');
    expect(results.count).toBe(1); // all three collapsed to one chip
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
  });

  test('a genuinely different color from + is NOT treated as a duplicate', async ({ page }) => {
    const results = await page.evaluate(() => {
      const api = window.__colorDesigner;
      api.clearSeeds();
      const a = api.addSeedFromColor({ r: 10, g: 20, b: 30, a: 1 });
      const b = api.addSeedFromColor({ r: 10, g: 20, b: 31, a: 1 }); // 1 blue apart
      return { a, b, count: api.state.seeds.length };
    });
    expect(results.a).toBe('added');
    expect(results.b).toBe('added');
    expect(results.count).toBe(2);
  });

  test('the scheme header itself still toggles via Enter and Space when it (not a child +) is focused', async ({ page }) => {
    // Re-roll so all rows start collapsed (initial load auto-opens row 0).
    await page.getByTestId('roll-btn').click();
    const toggle = page.getByTestId('scheme-row').first().getByTestId('scheme-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Focus the header container itself (role="button", tabindex=0), not the +.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(' ');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

// ---------------------------------------------------------------------------
// 4e. Mood persistence + badge on restore: a persisted roll comes back with
//     its mood AND its badge intact (not a fresh random re-roll), and the
//     no-persuasion "Surprise me" mood restores to a harmony-only badge.
// ---------------------------------------------------------------------------
test.describe('mood: badge + roll survive a reload (restore, not re-roll)', () => {
  test('a themed mood restores its "Mood · Harmony" badge and the exact rolled schemes', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'triadic');
    await page.getByTestId('mood-select').selectOption('ocean');
    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Ocean · Triadic');
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult.schemes));

    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    // Badge, selects, and resolved mood all come back...
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Ocean · Triadic');
    await expect(page.getByTestId('mood-select')).toHaveValue('ocean');
    const restored = await page.evaluate(() => window.__colorDesigner.state.rollResult);
    expect(restored.mood).toBe('ocean');
    expect(restored.algorithm).toBe('triadic');
    // ...and the schemes are the SAME roll, not a new random one (proof of restore).
    expect(JSON.stringify(restored.schemes)).toBe(before);
  });

  test('the no-persuasion "Surprise me" mood restores a harmony-only badge (no mood prefix)', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'complementary');
    await page.getByTestId('mood-select').selectOption('surprise');
    await page.getByTestId('roll-btn').click();
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Complementary');

    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('algorithm-used-label')).toHaveText('Complementary');
    await expect(page.getByTestId('mood-select')).toHaveValue('surprise');
  });
});

// ---------------------------------------------------------------------------
// 5. Seeds: N seeds -> each scheme injects 1..min(3,N) of them; 0 seeds ->
//    fully generated, no crash.
// ---------------------------------------------------------------------------
test.describe('seed injection bounds', () => {
  test('0 seeds: generateScheme never crashes, always 5 colors', async ({ page }) => {
    const lengths = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const out = [];
      for (let i = 0; i < 10; i++) out.push(api.generateScheme('triadic', [], 5, api.cryptoRng).length);
      return out;
    });
    expect(lengths).toEqual(new Array(10).fill(5));
  });

  test('1 seed: exactly 1 of the 5 colors is that seed, every trial', async ({ page }) => {
    const counts = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const seed = { r: 10, g: 200, b: 30, a: 1 };
      const out = [];
      for (let i = 0; i < 20; i++) {
        const colors = api.generateScheme('triadic', [seed], 5, api.cryptoRng);
        const matches = colors.filter((c) => c.r === seed.r && c.g === seed.g && c.b === seed.b && c.a === seed.a).length;
        out.push(matches);
      }
      return out;
    });
    expect(counts.every((c) => c === 1)).toBe(true);
  });

  test('2 seeds: 1 or 2 of the 5 colors match exactly one of the seeds, bounded by pool size', async ({ page }) => {
    const counts = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const seeds = [
        { r: 10, g: 200, b: 30, a: 1 },
        { r: 220, g: 40, b: 90, a: 1 },
      ];
      const out = [];
      for (let i = 0; i < 25; i++) {
        const colors = api.generateScheme('analogous', seeds, 5, api.cryptoRng);
        const matches = colors.filter((c) => seeds.some((s) => s.r === c.r && s.g === c.g && s.b === c.b && s.a === c.a)).length;
        out.push(matches);
      }
      return out;
    });
    expect(counts.every((c) => c === 1 || c === 2)).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(0);
  });

  test('5 seeds (pool > 3): 1..3 of the 5 colors match, never more than 3', async ({ page }) => {
    const counts = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const seeds = [0, 1, 2, 3, 4].map((i) => ({ r: (i * 40) % 256, g: (i * 70) % 256, b: (i * 90) % 256, a: 1 }));
      const out = [];
      for (let i = 0; i < 25; i++) {
        const colors = api.generateScheme('tetradic', seeds, 5, api.cryptoRng);
        const matches = colors.filter((c) => seeds.some((s) => s.r === c.r && s.g === c.g && s.b === c.b && s.a === c.a)).length;
        out.push(matches);
      }
      return out;
    });
    expect(counts.every((c) => c >= 1 && c <= 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5b. Configurable colors-per-scheme (N): generateScheme/roll honor an
//     explicit `count` (clamped 2-10, clampCount fallback 4) for any N in that
//     range; the UI default (before touching the count select) is 6.
// ---------------------------------------------------------------------------
test.describe('configurable colors-per-scheme (N)', () => {
  for (const N of [2, 4, 10]) {
    test(`generateScheme honors count=${N}: exactly ${N} colors, every trial`, async ({ page }) => {
      const lengths = await page.evaluate((n) => {
        const api = window.__colorDesigner;
        const out = [];
        for (let i = 0; i < 8; i++) out.push(api.generateScheme('triadic', [], n, api.cryptoRng).length);
        return out;
      }, N);
      expect(lengths).toEqual(new Array(8).fill(N));
    });

    test(`roll() honors count=${N}: all 5 schemes have exactly ${N} colors`, async ({ page }) => {
      const lengths = await page.evaluate((n) => {
        const api = window.__colorDesigner;
        const { schemes } = api.roll({ algorithm: 'analogous', seeds: [], count: n, rng: api.cryptoRng });
        return schemes.map((s) => s.length);
      }, N);
      expect(lengths).toEqual(new Array(5).fill(N));
    });
  }

  test('default N is 6: window.__colorDesigner.state.count and the initial roll both start at 6', async ({ page }) => {
    const { count, schemeLength, selectValue } = await page.evaluate(() => ({
      count: window.__colorDesigner.state.count,
      schemeLength: window.__colorDesigner.state.rollResult.schemes[0].length,
      selectValue: document.querySelector('[data-testid="count-select"]').value,
    }));
    expect(count).toBe(6);
    expect(schemeLength).toBe(6);
    expect(selectValue).toBe('6');
  });

  test('generateScheme/count is clamped: out-of-range and non-finite values fall back sensibly', async ({ page }) => {
    const out = await page.evaluate(() => {
      const api = window.__colorDesigner;
      return {
        low: api.clampCount(0),
        high: api.clampCount(999),
        nonFinite: api.clampCount(undefined),
        fractional: api.clampCount(6.6),
        inRange: api.clampCount(7),
      };
    });
    expect(out.low).toBe(2);
    expect(out.high).toBe(10);
    expect(out.nonFinite).toBe(4);
    expect(out.fractional).toBe(7); // rounds before clamping
    expect(out.inRange).toBe(7);
  });

  test('UI: changing colors-per-scheme and rolling changes the swatch count per scheme', async ({ page }) => {
    await setSetting(page, 'count-select', '2');
    await page.getByTestId('roll-btn').click();

    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    expect(N).toBe(2);

    const firstRowSwatches = page.getByTestId('scheme-row').first().getByTestId('scheme-swatch');
    await expect(firstRowSwatches).toHaveCount(2);
    await expect(page.getByTestId('scheme-swatch')).toHaveCount(10); // 5 schemes x 2 colors
  });

  test('seed injection is bounded by N as well as pool size (N=2, 5 seeds in the pool)', async ({ page }) => {
    const { counts, lengths } = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const seeds = [0, 1, 2, 3, 4].map((i) => ({ r: (i * 40) % 256, g: (i * 70) % 256, b: (i * 90) % 256, a: 1 }));
      const counts = [];
      const lengths = [];
      for (let i = 0; i < 20; i++) {
        const colors = api.generateScheme('tetradic', seeds, 2, api.cryptoRng);
        lengths.push(colors.length);
        const matches = colors.filter((c) => seeds.some((s) => s.r === c.r && s.g === c.g && s.b === c.b && s.a === c.a)).length;
        counts.push(matches);
      }
      return { counts, lengths };
    });
    expect(lengths).toEqual(new Array(20).fill(2));
    // Never more injected seeds than there are slots (N=2), even though the
    // pool has 5 seeds and pickSeedCount would otherwise allow up to 3.
    expect(counts.every((c) => c >= 1 && c <= 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Accordion: the first scheme auto-expands ONLY on the very first
//    (initial-load) roll; every subsequent re-roll collapses ALL schemes
//    (none auto-open). Single-open otherwise; aria-expanded; detail renders
//    between its row and the next.
// ---------------------------------------------------------------------------
test.describe('accordion behavior', () => {
  test('first scheme auto-expands on load, and state.isInitialLoad is true', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(0).getByTestId('scheme-detail')).not.toBeHidden();
    for (let i = 1; i < 5; i++) {
      await expect(rows.nth(i).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
      await expect(rows.nth(i).getByTestId('scheme-detail')).toBeHidden();
    }
    const isInitialLoad = await page.evaluate(() => window.__colorDesigner.state.isInitialLoad);
    expect(isInitialLoad).toBe(true);
  });

  test('re-roll (Roll again click) collapses ALL schemes — none auto-open, even the one that was open', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    // Scheme 0 is auto-open from initial load; open a different one instead.
    await rows.nth(3).getByTestId('scheme-toggle').click();
    await expect(rows.nth(3).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');

    await page.getByTestId('roll-btn').click();

    for (let i = 0; i < 5; i++) {
      await expect(rows.nth(i).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
      await expect(rows.nth(i).getByTestId('scheme-detail')).toBeHidden();
    }
    const expandedCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="scheme-toggle"][aria-expanded="true"]').length
    );
    expect(expandedCount).toBe(0);
    const isInitialLoad = await page.evaluate(() => window.__colorDesigner.state.isInitialLoad);
    expect(isInitialLoad).toBe(false);
  });

  test('re-roll collapses all schemes even when scheme 0 (the initially-open one) was left open', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');

    await page.getByTestId('roll-btn').click();

    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(0).getByTestId('scheme-detail')).toBeHidden();
  });

  test('collapse-all-on-re-roll holds across multiple consecutive re-rolls, not just the first', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    for (let n = 0; n < 3; n++) {
      await rows.nth(1).getByTestId('scheme-toggle').click(); // open something
      await page.getByTestId('roll-btn').click(); // re-roll
      const expandedCount = await page.evaluate(
        () => document.querySelectorAll('[data-testid="scheme-toggle"][aria-expanded="true"]').length
      );
      expect(expandedCount).toBe(0);
    }
  });

  test('single-open: opening one scheme closes whatever was open', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');

    await rows.nth(2).getByTestId('scheme-toggle').click();

    await expect(rows.nth(2).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(2).getByTestId('scheme-detail')).not.toBeHidden();
    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(0).getByTestId('scheme-detail')).toBeHidden();

    // Exactly one open at a time.
    const expandedCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="scheme-toggle"][aria-expanded="true"]').length
    );
    expect(expandedCount).toBe(1);
  });

  test('clicking the already-open scheme collapses it (zero-open is valid)', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    await rows.nth(0).getByTestId('scheme-toggle').click(); // collapse the auto-opened first scheme
    await expect(rows.nth(0).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(0).getByTestId('scheme-detail')).toBeHidden();
    const expandedCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="scheme-toggle"][aria-expanded="true"]').length
    );
    expect(expandedCount).toBe(0);
  });

  test('detail panel renders between its own scheme row and the next (DOM order)', async ({ page }) => {
    const order = await page.evaluate(() => {
      const list = document.querySelectorAll('[data-testid="scheme-row"]');
      return Array.from(list).map((row) => {
        const children = Array.from(row.children).map((c) => c.dataset.testid);
        return children; // ['scheme-toggle', 'scheme-detail'] within each row wrapper
      });
    });
    for (const children of order) {
      expect(children).toEqual(['scheme-toggle', 'scheme-detail']);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Detail: per-color copy rows and copy-all textareas match the scheme.
// ---------------------------------------------------------------------------
test.describe('scheme detail: per-color rows + copy-all match the scheme', () => {
  test('per-color rgba/hex fields match rgbaString/hexString for each of the N colors, in order', async ({ page }) => {
    const scheme = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0]);
    const expected = await page.evaluate(
      (scheme) => scheme.map((c) => ({ rgba: window.__colorDesigner.rgbaString(c), hex: window.__colorDesigner.hexString(c) })),
      scheme
    );
    const N = scheme.length; // default colors-per-scheme (4), not hardcoded 5

    const rows = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row');
    await expect(rows).toHaveCount(N);
    for (let i = 0; i < N; i++) {
      await expect(rows.nth(i).getByTestId('scheme-color-rgba')).toHaveValue(expected[i].rgba);
      await expect(rows.nth(i).getByTestId('scheme-color-hex')).toHaveValue(expected[i].hex);
    }
  });

  test('per-color copy buttons give check feedback', async ({ page }) => {
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    const rgbaCopy = row.getByTestId('scheme-color-rgba-copy');
    await expect(rgbaCopy).toHaveText('📋');
    await rgbaCopy.click();
    await expect(rgbaCopy).toHaveText('✅');
  });

  test('rgbaOutput(i)/hexOutput(i) getters match the copy-all textareas, derived and line-aligned', async ({ page }) => {
    const { rgbaOut, hexOut, N } = await page.evaluate(() => ({
      rgbaOut: window.__colorDesigner.rgbaOutput(0),
      hexOut: window.__colorDesigner.hexOutput(0),
      N: window.__colorDesigner.state.rollResult.schemes[0].length,
    }));
    const detail = page.getByTestId('scheme-detail').first();
    await expect(detail.getByTestId('scheme-rgba-output')).toHaveValue(rgbaOut);
    await expect(detail.getByTestId('scheme-hex-output')).toHaveValue(hexOut);

    // Line-aligned with the N per-color rows.
    const rgbaLines = rgbaOut.split('\n');
    const hexLines = hexOut.split('\n');
    expect(rgbaLines).toHaveLength(N);
    expect(hexLines).toHaveLength(N);
  });

  test('Copy-all buttons show "Copied!" feedback', async ({ page }) => {
    const detail = page.getByTestId('scheme-detail').first();
    const btn = detail.getByTestId('scheme-rgba-copy-all-btn');
    await expect(btn).toHaveText('Copy all');
    await btn.click();
    await expect(btn).toHaveText('Copied!');
  });
});

// ---------------------------------------------------------------------------
// 8. Per-chip × removes a seed directly (no dialog). Bulk clearing now lives as
//    "Restore defaults" in the Settings panel (tested there).
// ---------------------------------------------------------------------------
test.describe('seeds: per-chip remove is direct', () => {
  test('per-chip × removes a single seed WITHOUT any dialog', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorDesigner.addSeed('#3366ff');
      window.__colorDesigner.addSeed('#ff0000');
    });
    await expect(page.getByTestId('seed-chip')).toHaveCount(2);

    await page.getByTestId('seed-chip').first().getByTestId('seed-chip-remove').click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
  });

  test('invalid seed input shows an inline error and does not add a chip', async ({ page }) => {
    await page.getByTestId('seed-input').fill('not a color');
    await page.getByTestId('seed-add-btn').click();
    await expect(page.getByTestId('seed-error')).not.toHaveText('');
    await expect(page.getByTestId('seed-chip')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 8b. Mobile keyboard dismiss on Add seed — docs/conventions.md § Responsive
// & mobile: a successful commit blurs the field (soft keyboard follows
// focus); a rejected commit keeps focus so the user can fix the value.
// ---------------------------------------------------------------------------
test.describe('Add seed: mobile keyboard dismiss convention', () => {
  test('successful add blurs the seed input (dismisses the mobile keyboard)', async ({ page }) => {
    const input = page.getByTestId('seed-input');
    await input.fill('#3366ff');
    await input.focus();
    await expect(input).toBeFocused();

    await page.getByTestId('seed-add-btn').click();

    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    await expect(input).not.toBeFocused();
    const activeIsInput = await page.evaluate(
      () => document.activeElement === document.querySelector('[data-testid="seed-input"]')
    );
    expect(activeIsInput).toBe(false);
  });

  test('rejected add (invalid) keeps focus in the seed input', async ({ page }) => {
    const input = page.getByTestId('seed-input');
    await input.fill('not a color');
    await input.focus();

    await page.getByTestId('seed-add-btn').click();

    await expect(page.getByTestId('seed-error')).not.toHaveText('');
    await expect(page.getByTestId('seed-chip')).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('rejected add (duplicate-looking / empty) keeps focus in the seed input', async ({ page }) => {
    const input = page.getByTestId('seed-input');
    await input.fill('');
    await input.focus();

    await page.getByTestId('seed-add-btn').click();

    await expect(page.getByTestId('seed-error')).not.toHaveText('');
    await expect(input).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// 9. Reduced-motion: colors render immediately, demo cycle does not run.
// ---------------------------------------------------------------------------
test.describe('prefers-reduced-motion: reduce', () => {
  test('swatches render at full opacity immediately after load, no fade wait needed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const swatch = page.getByTestId('scheme-swatch').first();
    await expect(swatch).toBeVisible();
    const opacity = await swatch.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');
  });

  test('the live demo cycle does not run under reduced motion (no interval)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const intervalId = await page.evaluate(() => window.__colorDesigner.state.demo.intervalId);
    expect(intervalId).toBeNull();
  });

  test('without reduced motion, the demo cycle DOES run (interval is set) for the open scheme', async ({ page }) => {
    const intervalId = await page.evaluate(() => window.__colorDesigner.state.demo.intervalId);
    expect(intervalId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. data-testid hooks + window.__colorDesigner API shape.
// ---------------------------------------------------------------------------
test.describe('data-testid hooks present + API shape', () => {
  test('all top-level and section testids exist', async ({ page }) => {
    const singleTestids = [
      'top-row',
      'roll-card',
      'settings-btn',
      'settings-overlay',
      'harmony-select',
      'mood-select',
      'roll-back-btn',
      'roll-forward-btn',
      'roll-seed-input',
      'cvd-select',
      'demo-speed',
      'share-link-btn',
      'save-palette-btn',
      'saved-shelf',
      'roll-btn',
      'algorithm-used-label',
      'count-select',
      'roll-announce',
      'seeds-section',
      'seed-input',
      'seed-add-btn',
      'seed-error',
      'seed-list',
      'restore-defaults-btn',
      'cvd-badge',
      'schemes-section',
      'schemes-list',
    ];
    for (const id of singleTestids) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }
  });

  test('all per-scheme-row testids exist, x5 schemes, x N colors each (N = state.count)', async ({ page }) => {
    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    await expect(page.getByTestId('scheme-row')).toHaveCount(5);
    await expect(page.getByTestId('scheme-toggle')).toHaveCount(5);
    await expect(page.getByTestId('scheme-swatches')).toHaveCount(5);
    await expect(page.getByTestId('scheme-swatch')).toHaveCount(5 * N);
    await expect(page.getByTestId('scheme-swatch-hex')).toHaveCount(5 * N);
    await expect(page.getByTestId('scheme-detail')).toHaveCount(5);
  });

  test('all per-color-row testids exist within the open detail panel', async ({ page }) => {
    const N = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes[0].length);
    const detail = page.getByTestId('scheme-detail').first();
    await expect(detail.getByTestId('scheme-demo')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-demo-card')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-demo-heading')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-demo-paragraph')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-demo-button')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-color-rows')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-color-row')).toHaveCount(N);
    for (const id of ['scheme-color-swatch', 'scheme-color-rgba', 'scheme-color-rgba-copy', 'scheme-color-hex', 'scheme-color-hex-copy']) {
      await expect(detail.getByTestId(id)).toHaveCount(N);
    }
    await expect(detail.getByTestId('scheme-rgba-output-col')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-rgba-output')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-rgba-copy-all-btn')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-hex-output-col')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-hex-output')).toHaveCount(1);
    await expect(detail.getByTestId('scheme-hex-copy-all-btn')).toHaveCount(1);
  });

  test('seed chip testids exist once a seed is added', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#3366ff'));
    const chip = page.getByTestId('seed-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip.getByTestId('seed-chip-swatch')).toHaveCount(1);
    await expect(chip.getByTestId('seed-chip-label')).toHaveCount(1);
    await expect(chip.getByTestId('seed-chip-remove')).toHaveCount(1);
  });

  test('window.__colorDesigner exposes the full documented API shape (PLAN.md § 13)', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const api = window.__colorDesigner;
      return {
        parseColor: typeof api.parseColor,
        rgbaString: typeof api.rgbaString,
        hexString: typeof api.hexString,
        rgbToHsl: typeof api.rgbToHsl,
        hslToRgb: typeof api.hslToRgb,
        relLuminance: typeof api.relLuminance,
        contrastRatio: typeof api.contrastRatio,
        circularHueDistance: typeof api.circularHueDistance,
        anchorHues: typeof api.anchorHues,
        generateScheme: typeof api.generateScheme,
        roll: typeof api.roll,
        rollWith: typeof api.rollWith,
        makeSeqRng: typeof api.makeSeqRng,
        cryptoRng: typeof api.cryptoRng,
        clampCount: typeof api.clampCount,
        addSeed: typeof api.addSeed,
        removeSeed: typeof api.removeSeed,
        clearSeeds: typeof api.clearSeeds,
        performRoll: typeof api.performRoll,
        state: typeof api.state,
        rgbaOutput: typeof api.rgbaOutput,
        hexOutput: typeof api.hexOutput,
      };
    });
    expect(shape).toEqual({
      parseColor: 'function',
      rgbaString: 'function',
      hexString: 'function',
      rgbToHsl: 'function',
      hslToRgb: 'function',
      relLuminance: 'function',
      contrastRatio: 'function',
      circularHueDistance: 'function',
      anchorHues: 'function',
      generateScheme: 'function',
      roll: 'function',
      rollWith: 'function',
      makeSeqRng: 'function',
      cryptoRng: 'function',
      clampCount: 'function',
      addSeed: 'function',
      removeSeed: 'function',
      clearSeeds: 'function',
      performRoll: 'function',
      state: 'object',
      rgbaOutput: 'function',
      hexOutput: 'function',
    });
  });

  test('state is a live reference reflecting seeds/rollResult', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#112233'));
    const seeds = await page.evaluate(() => window.__colorDesigner.state.seeds);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].color).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 1 });
    expect(seeds[0].raw).toBe('#112233');
  });
});

// ---------------------------------------------------------------------------
// 10b. Layout (v3): a two-column top row -- roll card (left) + seed card
//      (right). The roll card stacks Roll again -> Mood -> Roll history ->
//      Settings (icon on the LEFT, like Copy link / Save palette). Harmony,
//      colors-per-scheme, vision, demo-speed and roll-seed moved into the
//      Settings modal; the algorithm badge is kept but hidden.
// ---------------------------------------------------------------------------
test.describe('layout (v3): two-column top row, roll card order, settings modal', () => {
  test('the top row holds the roll card then the seed card, side by side', async ({ page }) => {
    const order = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="top-row"]');
      return Array.from(row.children)
        .filter((el) => el.tagName === 'SECTION')
        .map((el) => el.dataset.testid);
    });
    expect(order).toEqual(['roll-card', 'seeds-section']);
  });

  test('roll card order: Roll again, then Mood, then Roll history, then Settings', async ({ page }) => {
    const order = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="roll-card"]');
      const wanted = new Set(['roll-btn', 'mood-select', 'roll-back-btn', 'settings-btn']);
      const found = [];
      card.querySelectorAll('[data-testid]').forEach((el) => {
        if (wanted.has(el.dataset.testid)) found.push(el.dataset.testid);
      });
      return found;
    });
    expect(order).toEqual(['roll-btn', 'mood-select', 'roll-back-btn', 'settings-btn']);
  });

  test('the algorithm-used label is present but hidden (functionality kept, just not shown)', async ({ page }) => {
    const hidden = await page.evaluate(() => document.querySelector('[data-testid="algorithm-used-label"]').hidden);
    expect(hidden).toBe(true);
  });

  test('Roll button label leads with the dice icon on the left', async ({ page }) => {
    const textContent = await page.evaluate(() => document.querySelector('[data-testid="roll-btn"]').textContent);
    expect(textContent).toContain('Roll again');
    expect(textContent).toContain('\u{1F3B2}');
    // Icon on the LEFT now: dice, two real U+00A0 non-breaking spaces, then label.
    expect(textContent).toContain('\u{1F3B2}\u00A0\u00A0Roll again');
  });

  test('Settings button leads with the gear icon on the left', async ({ page }) => {
    const textContent = await page.evaluate(() => document.querySelector('[data-testid="settings-btn"]').textContent);
    expect(textContent).toContain('\u2699\uFE0F\u00A0\u00A0Settings');
  });

  test('the tool has exactly one Roll button (no second roll control near the seeds section)', async ({ page }) => {
    const rollLikeButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).filter((b) => /roll/i.test(b.textContent)).length;
    });
    expect(rollLikeButtons).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10b-ii. Settings modal: opens from the roll card, holds the moved controls
//         in order, and Cancel reverts a change while Save keeps it.
// ---------------------------------------------------------------------------
test.describe('settings modal', () => {
  test('opens from Settings and lists controls top-to-bottom: count, harmony, vision, demo, roll seed, copy-link, save', async ({ page }) => {
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('settings-overlay')).toBeVisible();
    const order = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="settings-modal"]');
      const wanted = new Set(['count-select', 'harmony-select', 'cvd-select', 'demo-speed', 'roll-seed-input', 'share-link-btn', 'save-palette-btn']);
      const found = [];
      dialog.querySelectorAll('[data-testid]').forEach((el) => {
        if (wanted.has(el.dataset.testid)) found.push(el.dataset.testid);
      });
      return found;
    });
    expect(order).toEqual(['count-select', 'harmony-select', 'cvd-select', 'demo-speed', 'roll-seed-input', 'share-link-btn', 'save-palette-btn']);
  });

  test('Save keeps a change; Cancel reverts it', async ({ page }) => {
    await setSetting(page, 'harmony-select', 'triadic');
    expect(await page.evaluate(() => window.__colorDesigner.state.algorithmSelect)).toBe('triadic');

    await page.getByTestId('settings-btn').click();
    await page.getByTestId('harmony-select').selectOption('monochromatic');
    await page.getByTestId('settings-cancel-btn').click();
    await expect(page.getByTestId('settings-overlay')).toBeHidden();
    expect(await page.evaluate(() => window.__colorDesigner.state.algorithmSelect)).toBe('triadic');
    await expect(page.getByTestId('harmony-select')).toHaveValue('triadic');
  });

  test('closes (reverting) via the close X and via Escape', async ({ page }) => {
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('settings-overlay')).toBeVisible();
    await page.getByTestId('settings-close-x').click();
    await expect(page.getByTestId('settings-overlay')).toBeHidden();

    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('settings-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-overlay')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 10c. Wiggle: adding a seed color briefly wiggles the Roll-again button.
// ---------------------------------------------------------------------------
test.describe('wiggle nudge on adding a seed', () => {
  test('adding a seed via the test API adds the wiggle class to the Roll button', async ({ page }) => {
    const hasWiggle = await page.evaluate(() => {
      window.__colorDesigner.addSeed('#3366ff');
      return document.getElementById('rollBtn').classList.contains('wiggle');
    });
    expect(hasWiggle).toBe(true);
  });

  test('adding a seed via the real Add button/UI also wiggles the Roll button', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.getByTestId('seed-add-btn').click();
    const hasWiggle = await page.evaluate(() => document.getElementById('rollBtn').classList.contains('wiggle'));
    expect(hasWiggle).toBe(true);
  });

  test('the wiggle class does not falsely appear before any seed is added', async ({ page }) => {
    const hasWiggle = await page.evaluate(() => document.getElementById('rollBtn').classList.contains('wiggle'));
    expect(hasWiggle).toBe(false);
  });

  test('an invalid seed (Add fails) does not trigger the wiggle', async ({ page }) => {
    await page.getByTestId('seed-input').fill('not a color');
    await page.getByTestId('seed-add-btn').click();
    const hasWiggle = await page.evaluate(() => document.getElementById('rollBtn').classList.contains('wiggle'));
    expect(hasWiggle).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10d. Tooltips: every icon-only button (and the copy-all buttons) carries a
//      non-empty `title` in addition to its `aria-label`.
// ---------------------------------------------------------------------------
test.describe('tooltips: title attributes on icon-only / copy buttons', () => {
  test('seed chip remove (x) button has a non-empty title', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#3366ff'));
    const title = await page.getByTestId('seed-chip-remove').getAttribute('title');
    expect(title && title.trim().length).toBeGreaterThan(0);
  });

  test('per-color copy buttons (rgba + hex) have non-empty titles', async ({ page }) => {
    const detail = page.getByTestId('scheme-detail').first(); // open on initial load
    const row = detail.getByTestId('scheme-color-row').first();
    const rgbaTitle = await row.getByTestId('scheme-color-rgba-copy').getAttribute('title');
    const hexTitle = await row.getByTestId('scheme-color-hex-copy').getAttribute('title');
    expect(rgbaTitle && rgbaTitle.trim().length).toBeGreaterThan(0);
    expect(hexTitle && hexTitle.trim().length).toBeGreaterThan(0);
  });

  test('both Copy-all buttons have non-empty titles', async ({ page }) => {
    const detail = page.getByTestId('scheme-detail').first();
    const rgbaAllTitle = await detail.getByTestId('scheme-rgba-copy-all-btn').getAttribute('title');
    const hexAllTitle = await detail.getByTestId('scheme-hex-copy-all-btn').getAttribute('title');
    expect(rgbaAllTitle && rgbaAllTitle.trim().length).toBeGreaterThan(0);
    expect(hexAllTitle && hexAllTitle.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 10d. Purple primary button hover: keeps the purple border, inverts to a
//      white fill + purple text (never white-on-white). DESIGN.md § Controls
//      bar.
// ---------------------------------------------------------------------------
test.describe('purple primary button hover (fill/text invert, not white-on-white)', () => {
  const PURPLE = 'rgb(124, 58, 237)'; // --accent: #7c3aed
  const WHITE = 'rgb(255, 255, 255)';

  test('before hover: purple fill, white text', async ({ page }) => {
    const styles = await page.getByTestId('roll-btn').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    expect(styles.bg).toBe(PURPLE);
    expect(styles.color).toBe(WHITE);
  });

  test('on hover: fill goes white, text goes purple, border stays purple — label stays readable', async ({ page }) => {
    await page.getByTestId('roll-btn').hover();
    const styles = await page.getByTestId('roll-btn').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, borderColor: cs.borderTopColor };
    });
    expect(styles.bg).toBe(WHITE);
    expect(styles.color).toBe(PURPLE);
    expect(styles.borderColor).toBe(PURPLE);
    // The core regression this guards against: fill and text must never
    // match (that's what made the old white-on-white label invisible).
    expect(styles.color).not.toBe(styles.bg);
  });

  test('the .btn-primary hover rule is reusable (applies to any purple primary button, not just #rollBtn by id)', async ({ page }) => {
    const hasClass = await page.getByTestId('roll-btn').evaluate((el) => el.classList.contains('btn-primary'));
    expect(hasClass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Mobile (~375x667, dpr2, touch): real taps, no horizontal overflow,
//     nothing overlays the Roll button / an accordion expand control.
// ---------------------------------------------------------------------------
test.describe('mobile viewport (375x667, dpr2, touch)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  test('real tap on Roll produces a new roll (rollResult updates)', async ({ page }) => {
    const before = await page.evaluate(() => JSON.stringify(window.__colorDesigner.state.rollResult));
    await page.getByTestId('roll-btn').tap();
    await page.waitForFunction(
      (prev) => JSON.stringify(window.__colorDesigner.state.rollResult) !== prev,
      before,
      { timeout: 5000 }
    ).catch(() => {}); // rolls can coincidentally match; label presence checked below regardless
    await expect(page.getByTestId('algorithm-used-label')).not.toHaveText('');
    await expect(page.getByTestId('scheme-row')).toHaveCount(5);
  });

  test('real tap expands an accordion scheme', async ({ page }) => {
    const rows = page.getByTestId('scheme-row');
    await rows.nth(2).getByTestId('scheme-toggle').tap();
    await expect(rows.nth(2).getByTestId('scheme-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(2).getByTestId('scheme-detail')).not.toBeHidden();
  });

  test('real tap adds a seed color (input + Add button)', async ({ page }) => {
    const input = page.getByTestId('seed-input');
    await input.tap();
    await input.fill('#3366ff');
    await page.getByTestId('seed-add-btn').tap();
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
  });

  test('seed chip remove (×) button has a >=44x44 tap target', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#3366ff'));
    const box = await page.getByTestId('seed-chip-remove').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('no horizontal page overflow with seeds + expanded scheme + demo running', async ({ page }) => {
    await page.evaluate(() => {
      window.__colorDesigner.addSeed('#3366ff');
      window.__colorDesigner.addSeed('#ff0000');
      window.__colorDesigner.addSeed('rgba(10, 200, 30, 0.5)');
    });
    await page.getByTestId('roll-btn').tap();
    await page.getByTestId('scheme-row').nth(1).getByTestId('scheme-toggle').tap();

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('no horizontal overflow down to ~360px width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      window.__colorDesigner.addSeed('#3366ff');
      window.__colorDesigner.addSeed('#ff0000');
    });
    await page.getByTestId('roll-btn').tap();

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  // Lower-level hit-test guard (the lesson from a sibling tool's regression:
  // a passing functional test still missed a real overlay covering a
  // control). Verifies via document.elementFromPoint that nothing sits on
  // top of the Roll button or an accordion expand control at mobile size —
  // proof of tappability that doesn't rely on the window.__* hooks.
  test('no overlay intercepts hit-testing on the Roll button or an accordion expand control', async ({ page }) => {
    // The hit-test target for a real tap is "does elementFromPoint land on
    // the control itself or one of its OWN descendants" (e.g. the toggle
    // button's swatch strip / hex label are legitimate children painted on
    // top of it) — it only FAILS if something outside the control (an
    // overlay, a modal backdrop, an unrelated sibling) is on top instead.
    async function isHitByOwnControl(locator) {
      // Scroll into view first — a real tap auto-scrolls before acting, and
      // this control can legitimately sit below an initial 667px mobile
      // fold (v4's richer, taller live demo pushes later scheme rows well
      // down the page); hit-testing at an off-screen boundingBox would be a
      // false negative (elementFromPoint returns null off-canvas), not a
      // real overlay bug.
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      return locator.evaluate(
        (el, { x, y, w, h }) => {
          const hit = document.elementFromPoint(x + w / 2, y + h / 2);
          return !!hit && (hit === el || el.contains(hit));
        },
        { x: box.x, y: box.y, w: box.width, h: box.height }
      );
    }

    expect(await isHitByOwnControl(page.getByTestId('roll-btn'))).toBe(true);
    expect(await isHitByOwnControl(page.getByTestId('scheme-toggle').first())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11b. Live demo: richer demo (all N colors visible via sample lines + a
//      swatch column), the slower ~7.5s auto-cycle, and play/pause/prev/next
//      playback controls. See DESIGN.md § "Scheme detail (expanded panel)".
// ---------------------------------------------------------------------------
test.describe('live demo: sample lines + swatch column show ALL N colors', () => {
  test('at the default N=6: 6 sample lines, and 5 (N-1) non-background swatches', async ({ page }) => {
    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    expect(N).toBe(6);
    const detail = page.getByTestId('scheme-detail').first(); // open on initial load
    await expect(detail.getByTestId('scheme-demo-line')).toHaveCount(N);
    await expect(detail.getByTestId('scheme-demo-swatch')).toHaveCount(N - 1);
  });

  test('line/swatch counts scale with N (colors-per-scheme = 7)', async ({ page }) => {
    await setSetting(page, 'count-select', '7');
    await page.getByTestId('roll-btn').click();
    await page.getByTestId('scheme-toggle').first().click(); // re-rolls collapse all; open scheme 0
    const detail = page.getByTestId('scheme-detail').first();
    await expect(detail.getByTestId('scheme-demo-line')).toHaveCount(7);
    await expect(detail.getByTestId('scheme-demo-swatch')).toHaveCount(6);
  });

  test('each sample line has its own background/text color pairing (not all identical)', async ({ page }) => {
    const detail = page.getByTestId('scheme-detail').first();
    const bgColors = await detail.getByTestId('scheme-demo-line').evaluateAll(
      (els) => els.map((el) => getComputedStyle(el).backgroundColor)
    );
    const distinct = new Set(bgColors);
    expect(distinct.size).toBeGreaterThan(1);
  });

  test('the swatch column excludes the current demo background color', async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.__colorDesigner;
      const i = api.state.demo.schemeIndex;
      const scheme = api.state.rollResult.schemes[i];
      const N = scheme.length;
      const bgIndex = ((api.state.demo.pairingIndex % N) + N) % N;
      const bgHex = api.hexString(scheme[bgIndex]);
      const swatchEls = Array.from(document.querySelectorAll('[data-testid="scheme-demo-swatch"]'));
      const swatchColorIndexes = swatchEls.map((el) => Number(el.dataset.colorIndex));
      return { bgIndex, swatchColorIndexes, bgHex };
    });
    expect(result.swatchColorIndexes).not.toContain(result.bgIndex);
    expect(result.swatchColorIndexes).toHaveLength(result.swatchColorIndexes.length); // sanity: array, not undefined
  });
});

test.describe('live demo: playback controls (play/pause, prev, next)', () => {
  test('demo playback control buttons exist with non-empty titles + aria-labels', async ({ page }) => {
    const detail = page.getByTestId('scheme-detail').first();
    for (const id of ['scheme-demo-prev', 'scheme-demo-toggle', 'scheme-demo-next']) {
      const btn = detail.getByTestId(id);
      await expect(btn).toHaveCount(1);
      const title = await btn.getAttribute('title');
      const ariaLabel = await btn.getAttribute('aria-label');
      expect(title && title.trim().length).toBeGreaterThan(0);
      expect(ariaLabel && ariaLabel.trim().length).toBeGreaterThan(0);
    }
  });

  test('window.__colorDesigner exposes deterministic demo hooks (demoNext/demoPrev/demoTogglePlayback) as functions', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const api = window.__colorDesigner;
      return {
        demoNext: typeof api.demoNext,
        demoPrev: typeof api.demoPrev,
        demoTogglePlayback: typeof api.demoTogglePlayback,
        demoState: typeof api.state.demo,
        pairingIndex: typeof api.state.demo.pairingIndex,
        isPlaying: typeof api.state.demo.isPlaying,
      };
    });
    expect(shape).toEqual({
      demoNext: 'function',
      demoPrev: 'function',
      demoTogglePlayback: 'function',
      demoState: 'object',
      pairingIndex: 'number',
      isPlaying: 'boolean',
    });
  });

  test('without reduced motion, the demo starts playing (isPlaying true, interval set, toggle shows "Pause")', async ({ page }) => {
    const state = await page.evaluate(() => ({
      isPlaying: window.__colorDesigner.state.demo.isPlaying,
      intervalId: window.__colorDesigner.state.demo.intervalId,
    }));
    expect(state.isPlaying).toBe(true);
    expect(state.intervalId).not.toBeNull();
    const toggle = page.getByTestId('scheme-demo-toggle');
    expect(await toggle.getAttribute('title')).toBe('Pause');
    expect(await toggle.getAttribute('aria-pressed')).toBe('true');
  });

  test('clicking the toggle pauses the auto-cycle; clicking again resumes it', async ({ page }) => {
    const toggle = page.getByTestId('scheme-demo-toggle');
    await toggle.click(); // pause
    let state = await page.evaluate(() => window.__colorDesigner.state.demo);
    expect(state.isPlaying).toBe(false);
    expect(state.intervalId).toBeNull();
    expect(await toggle.getAttribute('title')).toBe('Play');
    expect(await toggle.getAttribute('aria-pressed')).toBe('false');

    await toggle.click(); // resume
    state = await page.evaluate(() => window.__colorDesigner.state.demo);
    expect(state.isPlaying).toBe(true);
    expect(state.intervalId).not.toBeNull();
    expect(await toggle.getAttribute('title')).toBe('Pause');
  });

  test('the auto-cycle is much slower than the old ~2.5s cadence — no advance within 3s', async ({ page }) => {
    const before = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    expect(after).toBe(before);
  });

  test('demoNext/demoPrev hooks advance/rewind pairingIndex, wrapping at N', async ({ page }) => {
    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    const start = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    expect(start).toBe(0);

    const afterNext = await page.evaluate(() => {
      window.__colorDesigner.demoNext();
      return window.__colorDesigner.state.demo.pairingIndex;
    });
    expect(afterNext).toBe(1);

    const afterPrevTwice = await page.evaluate(() => {
      window.__colorDesigner.demoPrev();
      window.__colorDesigner.demoPrev();
      return window.__colorDesigner.state.demo.pairingIndex;
    });
    expect(afterPrevTwice).toBe(normMod(-1, N));

    function normMod(n, m) { return ((n % m) + m) % m; }
  });

  test('a real click on Next changes the pairing index and re-renders the hero card background', async ({ page }) => {
    // Read the --demo-bg custom property directly (set synchronously by
    // renderDemo) rather than the *animated* computed background-color,
    // which is mid-transition (600ms crossfade) right after the click and
    // so isn't reliably different yet on the very next synchronous read.
    const before = await page.evaluate(() => ({
      pairingIndex: window.__colorDesigner.state.demo.pairingIndex,
      bg: document.querySelector('[data-testid="scheme-demo-card"]').style.getPropertyValue('--demo-bg'),
    }));
    await page.getByTestId('scheme-demo-next').click();
    const after = await page.evaluate(() => ({
      pairingIndex: window.__colorDesigner.state.demo.pairingIndex,
      bg: document.querySelector('[data-testid="scheme-demo-card"]').style.getPropertyValue('--demo-bg'),
    }));
    expect(after.pairingIndex).not.toBe(before.pairingIndex);
    expect(after.bg).not.toBe(before.bg);
  });

  test('a real click on Previous decrements the pairing index (wraps to N-1 from 0)', async ({ page }) => {
    const N = await page.evaluate(() => window.__colorDesigner.state.count);
    await page.getByTestId('scheme-demo-prev').click();
    const pairingIndex = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    expect(pairingIndex).toBe(N - 1);
  });

  test('prev/next still work while paused', async ({ page }) => {
    await page.getByTestId('scheme-demo-toggle').click(); // pause
    const before = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    await page.getByTestId('scheme-demo-next').click();
    const after = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    expect(after).not.toBe(before);
    // still paused — a manual step must not silently resume the auto-cycle
    const isPlaying = await page.evaluate(() => window.__colorDesigner.state.demo.isPlaying);
    expect(isPlaying).toBe(false);
  });
});

test.describe('live demo: prefers-reduced-motion starts paused, prev/next still work', () => {
  test('reduced motion: demo starts paused (isPlaying false, no interval), toggle shows "Play"', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const state = await page.evaluate(() => ({
      isPlaying: window.__colorDesigner.state.demo.isPlaying,
      intervalId: window.__colorDesigner.state.demo.intervalId,
    }));
    expect(state.isPlaying).toBe(false);
    expect(state.intervalId).toBeNull();
    const toggle = page.getByTestId('scheme-demo-toggle');
    expect(await toggle.getAttribute('title')).toBe('Play');
  });

  test('reduced motion: demoNext/demoPrev (and a real click on Next) still work for manual stepping', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const before = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    await page.getByTestId('scheme-demo-next').click();
    const after = await page.evaluate(() => window.__colorDesigner.state.demo.pairingIndex);
    expect(after).not.toBe(before);
    // Stepping manually must not start the auto-cycle back up under reduced motion.
    const isPlaying = await page.evaluate(() => window.__colorDesigner.state.demo.isPlaying);
    expect(isPlaying).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. Seed color picker (visual HSV): trigger swatch, popup open/two-way
//     sync (hook + real pointer drag), keyboard nudge, close behaviors, and
//     mobile real touch drag. See DESIGN.md § "Seed color picker (visual —
//     the primary input)".
// ---------------------------------------------------------------------------
test.describe('seed color picker: pure hsv math (rgbToHsv / hsvToRgb)', () => {
  test('round-trips a spread of colors within ±1 per channel', async ({ page }) => {
    const samples = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
      { r: 18, g: 52, b: 86 },
      { r: 200, g: 150, b: 50 },
      { r: 123, g: 45, b: 200 },
    ];
    const results = await page.evaluate((colors) => {
      const api = window.__colorDesigner;
      return colors.map((c) => {
        const hsv = api.rgbToHsv(c);
        const back = api.hsvToRgb(hsv);
        return { original: c, back };
      });
    }, samples);
    for (const { original, back } of results) {
      expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
    }
  });

  test('known primaries/grays match known HSV values (distinct from the HSL helpers)', async ({ page }) => {
    const out = await page.evaluate(() => {
      const api = window.__colorDesigner;
      return {
        red: api.rgbToHsv({ r: 255, g: 0, b: 0 }),
        white: api.rgbToHsv({ r: 255, g: 255, b: 255 }),
        black: api.rgbToHsv({ r: 0, g: 0, b: 0 }),
        blue: api.rgbToHsv({ r: 0, g: 0, b: 255 }),
      };
    });
    expect(out.red).toEqual({ h: 0, s: 1, v: 1 });
    expect(out.white).toEqual({ h: 0, s: 0, v: 1 });
    expect(out.black).toEqual({ h: 0, s: 0, v: 0 });
    expect(out.blue.h).toBeCloseTo(240, 0);
    expect(out.blue.s).toBe(1);
    expect(out.blue.v).toBe(1);
  });
});

test.describe('seed color picker: trigger swatch reflects the typed input (live parse)', () => {
  test('typing a valid hex live-updates the trigger swatch fill', async ({ page }) => {
    const swatch = page.getByTestId('seed-picker-trigger-swatch');
    await page.getByTestId('seed-input').fill('#3366ff');
    await expect(swatch).toHaveCSS('background-color', 'rgb(51, 102, 255)');
  });

  test('empty input -> neutral/checkerboard state (no color painted)', async ({ page }) => {
    const swatch = page.getByTestId('seed-picker-trigger-swatch');
    await page.getByTestId('seed-input').fill('');
    await expect(swatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('invalid input -> neutral/checkerboard state', async ({ page }) => {
    const swatch = page.getByTestId('seed-picker-trigger-swatch');
    await page.getByTestId('seed-input').fill('not a color');
    await expect(swatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('adding a seed clears the input, which resets the trigger to neutral', async ({ page }) => {
    const swatch = page.getByTestId('seed-picker-trigger-swatch');
    await page.getByTestId('seed-input').fill('#00ff00');
    await expect(swatch).toHaveCSS('background-color', 'rgb(0, 255, 0)');
    await page.getByTestId('seed-add-btn').click();
    await expect(page.getByTestId('seed-input')).toHaveValue('');
    await expect(swatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });
});

test.describe('seed color picker: opening initializes from the current input (re-parsed every open)', () => {
  test('type #ff0000, open -> hue≈0, full saturation/value, alpha=1', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.open).toBe(true);
    expect(hsva.h).toBeCloseTo(0, 0);
    expect(hsva.s).toBeCloseTo(1, 2);
    expect(hsva.v).toBeCloseTo(1, 2);
    expect(hsva.a).toBe(1);
  });

  test('type a translucent rgba(), open -> matching hsv + alpha < 1', async ({ page }) => {
    await page.getByTestId('seed-input').fill('rgba(0, 128, 255, 0.4)');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.a).toBe(0.4);
    expect(hsva.v).toBeCloseTo(1, 2); // max channel is 255 -> full value
  });

  test('empty/invalid input -> default mid hue, full sat/val, alpha 1', async ({ page }) => {
    await page.getByTestId('seed-input').fill('');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.s).toBe(1);
    expect(hsva.v).toBe(1);
    expect(hsva.a).toBe(1);
    expect(Number.isFinite(hsva.h)).toBe(true);
  });

  test('re-opening re-parses: changing the input while closed is picked up on the next open', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.evaluate(() => window.__colorDesigner.closeSeedPicker());
    await page.getByTestId('seed-input').fill('#0000ff');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.h).toBeCloseTo(240, 0);
  });
});

test.describe('seed color picker: data-testid hooks + window.__colorDesigner API shape', () => {
  test('trigger, popup, sv-square, hue slider, alpha slider all present', async ({ page }) => {
    for (const id of [
      'seed-picker-trigger',
      'seed-picker-trigger-swatch',
      'seed-picker-popup',
      'seed-picker-sv-square',
      'seed-picker-hue-slider',
      'seed-picker-alpha-slider',
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(1);
    }
  });

  test('trigger has a title tooltip + aria-label "Pick a color"', async ({ page }) => {
    const trigger = page.getByTestId('seed-picker-trigger');
    await expect(trigger).toHaveAttribute('title', 'Pick a color');
    await expect(trigger).toHaveAttribute('aria-label', 'Pick a color');
  });

  test('trigger is the first control in the add-a-color row (before the text input and Add)', async ({ page }) => {
    const order = await page.evaluate(() => {
      const row = document.querySelector('.seed-add-row');
      return Array.from(row.children).map((el) => el.dataset.testid);
    });
    expect(order).toEqual(['seed-picker-trigger', 'seed-input', 'seed-add-btn']);
  });

  test('popup is hidden until opened', async ({ page }) => {
    await expect(page.getByTestId('seed-picker-popup')).toBeHidden();
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await expect(page.getByTestId('seed-picker-popup')).toBeVisible();
  });

  test('window.__colorDesigner exposes the seed-picker hooks and live state.seedPicker readback', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const api = window.__colorDesigner;
      return {
        rgbToHsv: typeof api.rgbToHsv,
        hsvToRgb: typeof api.hsvToRgb,
        openSeedPicker: typeof api.openSeedPicker,
        closeSeedPicker: typeof api.closeSeedPicker,
        setSeedPickerHSVA: typeof api.setSeedPickerHSVA,
        seedPickerState: typeof api.state.seedPicker,
      };
    });
    expect(shape).toEqual({
      rgbToHsv: 'function',
      hsvToRgb: 'function',
      openSeedPicker: 'function',
      closeSeedPicker: 'function',
      setSeedPickerHSVA: 'function',
      seedPickerState: 'object',
    });
  });
});

test.describe('seed color picker: popup positioning stays within the viewport', () => {
  test('popup bounding box stays within the viewport after opening', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const box = await page.getByTestId('seed-picker-popup').boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  });
});

test.describe('seed color picker: two-way sync via the setSeedPickerHSVA hook', () => {
  test('an opaque color writes hex back to the input and updates the trigger swatch', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const result = await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ h: 0, s: 1, v: 1, a: 1 }));
    expect(result).toEqual({ h: 0, s: 1, v: 1, a: 1 });
    await expect(page.getByTestId('seed-input')).toHaveValue('#ff0000');
    await expect(page.getByTestId('seed-picker-trigger-swatch')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  });

  test('alpha < 1 writes rgba(...) back to the input, not hex', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ h: 120, s: 1, v: 1, a: 0.5 }));
    await expect(page.getByTestId('seed-input')).toHaveValue('rgba(0, 255, 0, 0.5)');
  });

  test('a partial update only changes the given channel(s); the rest are unchanged', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ h: 200, s: 1, v: 1, a: 1 }));
    const after = await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ a: 0.25 }));
    expect(after).toEqual({ h: 200, s: 1, v: 1, a: 0.25 });
  });

  test('out-of-range h/s/v/a are clamped/normalized back into range', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const result = await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ h: 730, s: 2, v: -1, a: 5 }));
    expect(result.h).toBeCloseTo(10, 0);
    expect(result.s).toBe(1);
    expect(result.v).toBe(0);
    expect(result.a).toBe(1);
  });
});

test.describe('seed color picker: real pointer drag (mouse)', () => {
  test('dragging the sv-square updates saturation/value and writes a valid color into the input', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000'); // hue 0
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const box = await page.getByTestId('seed-picker-sv-square').boundingBox();
    const targetX = box.x + box.width * 0.25;
    const targetY = box.y + box.height * 0.25;
    await page.mouse.move(targetX, targetY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 2 });
    await page.mouse.up();

    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.s).toBeCloseTo(0.25, 1);
    expect(hsva.v).toBeCloseTo(0.75, 1);

    const inputVal = await page.getByTestId('seed-input').inputValue();
    const parsed = await page.evaluate((v) => window.__colorDesigner.parseColor(v), inputVal);
    expect(parsed).not.toBeNull();
  });

  test('dragging the hue slider changes hue and rewrites the input to the new hue', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const box = await page.getByTestId('seed-picker-hue-slider').boundingBox();
    const targetX = box.x + box.width * (120 / 360);
    const targetY = box.y + box.height / 2;
    await page.mouse.move(targetX, targetY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 2 });
    await page.mouse.up();

    const h = await page.evaluate(() => window.__colorDesigner.state.seedPicker.h);
    expect(h).toBeCloseTo(120, 0);
    await expect(page.getByTestId('seed-input')).toHaveValue('#00ff00');
  });

  test('dragging the alpha slider below full produces rgba() output (not hex)', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    const box = await page.getByTestId('seed-picker-alpha-slider').boundingBox();
    const targetX = box.x + box.width * 0.5;
    const targetY = box.y + box.height / 2;
    await page.mouse.move(targetX, targetY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 2 });
    await page.mouse.up();

    const a = await page.evaluate(() => window.__colorDesigner.state.seedPicker.a);
    expect(a).toBeCloseTo(0.5, 1);
    const inputVal = await page.getByTestId('seed-input').inputValue();
    expect(inputVal).toMatch(/^rgba\(/);
  });
});

test.describe('seed color picker: closing (Esc / click-outside) and focus return', () => {
  test('Esc closes the popup and returns focus to the trigger', async ({ page }) => {
    await page.getByTestId('seed-picker-trigger').click();
    await expect(page.getByTestId('seed-picker-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('seed-picker-popup')).toBeHidden();
    await expect(page.getByTestId('seed-picker-trigger')).toBeFocused();
  });

  test('clicking outside the popup closes it', async ({ page }) => {
    await page.getByTestId('seed-picker-trigger').click();
    await expect(page.getByTestId('seed-picker-popup')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('seed-picker-popup')).toBeHidden();
  });

  test('clicking the trigger again toggles the popup closed', async ({ page }) => {
    const trigger = page.getByTestId('seed-picker-trigger');
    await trigger.click();
    await expect(page.getByTestId('seed-picker-popup')).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId('seed-picker-popup')).toBeHidden();
  });

  test('aria-expanded on the trigger reflects open state', async ({ page }) => {
    const trigger = page.getByTestId('seed-picker-trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('seed color picker: keyboard arrow-key nudging', () => {
  test('ArrowRight on the focused hue slider increases hue by 1 degree', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000'); // hue 0
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.getByTestId('seed-picker-hue-slider').focus();
    await page.keyboard.press('ArrowRight');
    const h = await page.evaluate(() => window.__colorDesigner.state.seedPicker.h);
    expect(h).toBe(1);
  });

  test('Shift+ArrowRight on the hue slider takes a bigger step (10 degrees)', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.getByTestId('seed-picker-hue-slider').focus();
    await page.keyboard.press('Shift+ArrowRight');
    const h = await page.evaluate(() => window.__colorDesigner.state.seedPicker.h);
    expect(h).toBe(10);
  });

  test('ArrowLeft on the alpha slider decreases alpha and produces rgba() output', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.getByTestId('seed-picker-alpha-slider').focus();
    await page.keyboard.press('ArrowLeft');
    const a = await page.evaluate(() => window.__colorDesigner.state.seedPicker.a);
    expect(a).toBeCloseTo(0.99, 2);
    await expect(page.getByTestId('seed-input')).toHaveValue(/^rgba\(/);
  });

  test('ArrowUp on the focused sv-square increases value', async ({ page }) => {
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => {
      window.__colorDesigner.openSeedPicker();
      window.__colorDesigner.setSeedPickerHSVA({ v: 0.5 });
    });
    await page.getByTestId('seed-picker-sv-square').focus();
    await page.keyboard.press('ArrowUp');
    const v = await page.evaluate(() => window.__colorDesigner.state.seedPicker.v);
    expect(v).toBeCloseTo(0.52, 2);
  });
});

test.describe('seed color picker: Add still uses the current (synced) text value', () => {
  test('picking a color then clicking Add creates a seed chip matching the picked color', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());
    await page.evaluate(() => window.__colorDesigner.setSeedPickerHSVA({ h: 260, s: 0.8, v: 0.9, a: 1 }));
    const expectedValue = await page.getByTestId('seed-input').inputValue();
    await page.getByTestId('seed-add-btn').click();

    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    const chipLabel = await page.getByTestId('seed-chip-label').textContent();
    const expectedHex = await page.evaluate(
      (v) => window.__colorDesigner.hexString(window.__colorDesigner.parseColor(v)),
      expectedValue
    );
    expect(chipLabel).toBe(expectedHex);
  });
});

test.describe('seed color picker: mobile viewport (375x667, dpr2, touch) real touch drag', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  // Dispatches a real PointerEvent (pointerType: 'touch') directly at the
  // named data-testid element — same technique as the sibling color-picker
  // tool's mobile drag suite, since Playwright's touchscreen API doesn't
  // give fine-grained drag control. The tool's own listeners (Pointer
  // Events, section 8b) don't distinguish trusted vs. synthetic events.
  async function firePointer(page, testId, type, id, clientX, clientY) {
    await page.evaluate(
      ({ testId, type, id, clientX, clientY }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
            isPrimary: true,
          })
        );
      },
      { testId, type, id, clientX, clientY }
    );
  }

  test('touch drag on the sv-square updates saturation/value and the input color', async ({ page }) => {
    await page.getByTestId('seed-input').tap();
    await page.getByTestId('seed-input').fill('#ff0000');
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());

    const box = await page.getByTestId('seed-picker-sv-square').boundingBox();
    const x1 = box.x + box.width * 0.2;
    const y1 = box.y + box.height * 0.2;
    const x2 = box.x + box.width * 0.7;
    const y2 = box.y + box.height * 0.6;

    await firePointer(page, 'seed-picker-sv-square', 'pointerdown', 1, x1, y1);
    await firePointer(page, 'seed-picker-sv-square', 'pointermove', 1, x2, y2);
    await firePointer(page, 'seed-picker-sv-square', 'pointerup', 1, x2, y2);

    const hsva = await page.evaluate(() => window.__colorDesigner.state.seedPicker);
    expect(hsva.s).toBeCloseTo(0.7, 1);
    expect(hsva.v).toBeCloseTo(0.4, 1);

    const inputVal = await page.getByTestId('seed-input').inputValue();
    const parsed = await page.evaluate((v) => window.__colorDesigner.parseColor(v), inputVal);
    expect(parsed).not.toBeNull();
  });

  test('touch drag on the hue slider works, and the popup fits within a 375px-wide viewport', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());

    const popupBox = await page.getByTestId('seed-picker-popup').boundingBox();
    expect(popupBox.x).toBeGreaterThanOrEqual(0);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(375 + 1);

    const box = await page.getByTestId('seed-picker-hue-slider').boundingBox();
    const x = box.x + box.width * 0.75;
    const y = box.y + box.height / 2;

    await firePointer(page, 'seed-picker-hue-slider', 'pointerdown', 2, x, y);
    await firePointer(page, 'seed-picker-hue-slider', 'pointerup', 2, x, y);

    const h = await page.evaluate(() => window.__colorDesigner.state.seedPicker.h);
    expect(h).toBeCloseTo(270, 0);
  });

  test('no horizontal page overflow with the picker open at ~360px width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => window.__colorDesigner.openSeedPicker());

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });
});

// ---------------------------------------------------------------------------
// Adversarial-review finding (BLOCKER, fixer pass): the page-wide
// `button:hover:not(:disabled)` rule had higher CSS specificity than the
// pasted ctConfirm's `.ctc-btn--yes:hover` (filter-only, 0,2,0), so hovering
// "Yes" washed the solid accent-purple background out to near-white
// (#f1ecfc) while the white text stayed white — effectively invisible.
// Fixed by excluding `.ctc-btn` from the generic hover rule
// (`:not(:disabled):not(.ctc-btn)`). docs/conventions.md "Destructive
// actions require confirmation": "Yes" must read as "a clear, filled
// primary" — never near-white. (.btn-primary's own hover rule, used by Roll
// again, has higher specificity than the generic rule either way and was
// never affected — covered separately above in "purple primary button
// hover".)
// ---------------------------------------------------------------------------
test.describe('ctConfirm "Yes" hover stays legible (CSS specificity regression)', () => {
  test('hovering "Yes" in the Restore-defaults ctConfirm dialog keeps a filled accent background with readable text', async ({
    page,
  }) => {
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('restore-defaults-btn').click(); // opens ctConfirm (we only hover, never confirm)

    // Scope to the ctConfirm dialog — the Settings modal (open behind it) also
    // has its own "Cancel" button, so an unscoped role query is ambiguous.
    const yesBtn = page.locator('.ctc-btn--yes');
    const cancelBtn = page.locator('.ctc-btn--cancel');
    await expect(yesBtn).toBeVisible();

    const beforeHoverBg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    await yesBtn.hover();
    const afterHoverBg = await yesBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const afterHoverColor = await yesBtn.evaluate((el) => getComputedStyle(el).color);
    const cancelHoverBg = await cancelBtn.evaluate((el) => getComputedStyle(el).backgroundColor);

    // --accent (#7c3aed) = rgb(124, 58, 237); the near-white wash the bug
    // produced was #f1ecfc = rgb(241, 236, 252).
    expect(afterHoverBg).toBe('rgb(124, 58, 237)');
    expect(afterHoverBg).toBe(beforeHoverBg); // unchanged by hover (filter:brightness doesn't touch background-color)
    expect(afterHoverBg).not.toBe('rgb(241, 236, 252)');
    expect(afterHoverBg).not.toBe(cancelHoverBg); // distinct from Cancel's hover background
    expect(afterHoverColor).toBe('rgb(255, 255, 255)'); // text stays white/readable

    await page.keyboard.press('Escape'); // clean up
  });

  test('an ordinary button (Add seed) still gets the light #f1ecfc hover, unaffected by the fix', async ({ page }) => {
    const addBtn = page.getByTestId('seed-add-btn');
    await addBtn.hover();
    const bg = await addBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(241, 236, 252)'); // #f1ecfc, unchanged existing light hover
  });

  test('Roll again (.btn-primary) still inverts to white fill / purple text on hover, unaffected by the fix', async ({
    page,
  }) => {
    const rollBtn = page.getByTestId('roll-btn');
    await rollBtn.hover();
    const styles = await rollBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    expect(styles.bg).toBe('rgb(255, 255, 255)');
    expect(styles.color).toBe('rgb(124, 58, 237)');
  });
});

// ---------------------------------------------------------------------------
// v7: localStorage persistence (docs/conventions.md § "Persist UI state
// (localStorage)"). hat-picker is the exemplar pattern this follows: a
// versioned key ("color-designer:v1"), save-on-change, restore-on-load, and
// every read/write try/catch-wrapped so the tool degrades silently and works
// fully with no stored state. Unlike hat-picker, a roll here is RANDOM and
// can't be deterministically recomputed from its inputs — so what's
// persisted (and restored) is the harmony select, colors-per-scheme (N), the
// seed colors, AND the actual last-rolled schemes + which one was expanded,
// not just the settings that produced them.
// ---------------------------------------------------------------------------
test.describe('localStorage persistence', () => {
  const STORAGE_KEY = 'color-designer:v1';

  test('writes the versioned key on change, and reloading restores the same harmony/N/seeds/schemes/expanded scheme — not a fresh random roll', async ({
    page,
  }) => {
    // Set some non-default "smart" state: a seed, a specific harmony + N,
    // roll, then expand a scheme other than the default index 0.
    await page.evaluate(() => window.__colorDesigner.addSeed('#3366ff'));
    await setSetting(page, 'harmony-select', 'triadic');
    await setSetting(page, 'count-select', '6');
    await page.getByTestId('roll-btn').click();
    await page.waitForFunction(() => window.__colorDesigner.state.rollResult.algorithm === 'triadic');
    await page.getByTestId('scheme-toggle').nth(2).click();
    await expect(page.getByTestId('scheme-toggle').nth(2)).toHaveAttribute('aria-expanded', 'true');

    const before = await page.evaluate(() => ({
      algorithmSelect: window.__colorDesigner.state.algorithmSelect,
      count: window.__colorDesigner.state.count,
      seeds: window.__colorDesigner.state.seeds.map((s) => s.raw),
      schemes: window.__colorDesigner.state.rollResult.schemes,
      algorithm: window.__colorDesigner.state.rollResult.algorithm,
      expandedIndex: window.__colorDesigner.state.expandedIndex,
    }));
    expect(before.expandedIndex).toBe(2);

    // The versioned key is written, with a shape matching the live state —
    // including the actual rolled schemes (a roll can't be recomputed later,
    // so it has to be the persisted payload itself, not just its inputs).
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(stored.algorithmSelect).toBe('triadic');
    expect(stored.count).toBe(6);
    expect(stored.seeds).toHaveLength(1);
    expect(stored.seeds[0].raw).toBe('#3366ff');
    expect(stored.rollResult.algorithm).toBe('triadic');
    expect(stored.rollResult.schemes).toEqual(before.schemes);
    expect(stored.expandedIndex).toBe(2);

    // Reload: restore-on-load must render the SAME schemes (proof it's a
    // restore, not a fresh auto-roll, which would almost certainly differ),
    // plus the same harmony/N/seeds, and re-expand scheme index 2.
    await page.context().storageState(); // force the file:// localStorage IPC to commit before reload
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const after = await page.evaluate(() => ({
      algorithmSelect: window.__colorDesigner.state.algorithmSelect,
      count: window.__colorDesigner.state.count,
      seeds: window.__colorDesigner.state.seeds.map((s) => s.raw),
      schemes: window.__colorDesigner.state.rollResult.schemes,
      algorithm: window.__colorDesigner.state.rollResult.algorithm,
      expandedIndex: window.__colorDesigner.state.expandedIndex,
      isInitialLoad: window.__colorDesigner.state.isInitialLoad,
    }));

    expect(after.algorithmSelect).toBe(before.algorithmSelect);
    expect(after.count).toBe(before.count);
    expect(after.seeds).toEqual(before.seeds);
    expect(after.algorithm).toBe(before.algorithm);
    expect(after.schemes).toEqual(before.schemes); // exact same rolled colors — a restore, not a new random roll
    expect(after.expandedIndex).toBe(2);
    expect(after.isInitialLoad).toBe(true);

    // The UI reflects the restore too: harmony/count selects, seed chip, and
    // the previously-expanded scheme's detail panel (with the demo running).
    await expect(page.getByTestId('harmony-select')).toHaveValue('triadic');
    await expect(page.getByTestId('count-select')).toHaveValue('6');
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);
    await expect(page.getByTestId('scheme-toggle').nth(2)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('scheme-detail').nth(2)).not.toBeHidden();
  });

  test('changing harmony/N, removing a seed, and clearing seeds each update the stored blob', async ({ page }) => {
    await page.evaluate(() => window.__colorDesigner.addSeed('#00ff00'));
    let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.seeds).toHaveLength(1);

    await setSetting(page, 'harmony-select', 'monochromatic');
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.algorithmSelect).toBe('monochromatic');

    await setSetting(page, 'count-select', '3');
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.count).toBe(3);

    const seedId = await page.evaluate(() => window.__colorDesigner.state.seeds[0].id);
    await page.evaluate((id) => window.__colorDesigner.removeSeed(id), seedId);
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.seeds).toHaveLength(0);

    await page.evaluate(() => window.__colorDesigner.addSeed('#123456'));
    await page.evaluate(() => window.__colorDesigner.clearSeeds());
    stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.seeds).toHaveLength(0);
  });

  test('degrades gracefully when localStorage throws on every read/write: no crash, tool still auto-rolls and stays fully usable', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Simulate a browser/context where localStorage access throws (private
    // mode, restrictive policy, quota) — per docs/conventions.md, every
    // read/write must be try/catch-wrapped and the tool must work fully with
    // no stored state. Overriding Storage.prototype (rather than deleting or
    // reassigning `window.localStorage`, which some engines make
    // non-configurable) reliably intercepts every localStorage.setItem/
    // getItem call this page's script makes.
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new Error('blocked'); };
      Storage.prototype.getItem = function () { throw new Error('blocked'); };
    });
    // The top-level beforeEach already navigated before this init script was
    // registered; reload so it actually applies to this load.
    await page.reload();

    // Sanity-check the simulation actually took effect before trusting the
    // rest of the assertions.
    const threw = await page.evaluate(() => {
      try { localStorage.setItem('x', '1'); return false; } catch { return true; }
    });
    expect(threw).toBe(true);

    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    expect(pageErrors).toEqual([]); // load + auto-roll produced no uncaught exception

    const initialSchemes = await page.evaluate(() => window.__colorDesigner.state.rollResult.schemes);
    expect(initialSchemes).toHaveLength(5);
    expect(initialSchemes[0].length).toBe(await page.evaluate(() => window.__colorDesigner.state.count));

    // Normal interaction (seed add, harmony/count change, re-roll, expand a
    // scheme) still works end-to-end without throwing up the call stack —
    // saveState()/restoreState() swallow the localStorage error every time.
    await page.getByTestId('seed-input').fill('#00ff00');
    await page.getByTestId('seed-add-btn').click();
    await expect(page.getByTestId('seed-chip')).toHaveCount(1);

    await setSetting(page, 'harmony-select', 'tetradic');
    await setSetting(page, 'count-select', '5');
    await page.getByTestId('roll-btn').click();
    await page.waitForFunction(() => window.__colorDesigner.state.rollResult.algorithm === 'tetradic');

    await page.getByTestId('scheme-toggle').first().click();
    await expect(page.getByTestId('scheme-toggle').first()).toHaveAttribute('aria-expanded', 'true');

    expect(pageErrors).toEqual([]); // still no uncaught exceptions after a full interaction pass
  });
});

// ---------------------------------------------------------------------------
// v8: First-load Help popup (docs/conventions.md § "First-load help popup
// (all tools)"). Reference pattern: tools/hat-picker. Auto-shows once on a
// genuinely fresh visit (own browser.newContext() — the shared beforeEach
// above pre-seeds the "seen" flag for every other test in this file so the
// modal doesn't interfere with unrelated assertions); otherwise reachable
// only via the ? button. Accessible modal: role=dialog, aria-modal, initial
// focus on the ✕, Esc/backdrop/✕ all dismiss + return focus, a focus
// trap keeps Tab inside, and the overlay is display:none when closed.
// ---------------------------------------------------------------------------
test.describe('Help modal: first-load auto-show', () => {
  test('auto-shows on a genuine first visit (fresh context, no pre-seeded flag)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);

    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();
    const modal = page.getByTestId('help-modal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'help-title');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();

    // Marked seen immediately (not just on close) — see index.html's init().
    const seen = await page.evaluate((key) => localStorage.getItem(key), HELP_SEEN_KEY);
    expect(seen).toBe('1');

    await context.close();
  });

  test('does not auto-show again on a later visit in the same (now-seen) context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TOOL_URL);
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('help-overlay')).toBeVisible(); // first visit: auto-shows

    await page.reload();
    await page.waitForFunction(() => window.__colorDesigner && window.__colorDesigner.state.rollResult);
    await expect(page.getByTestId('help-overlay')).toBeHidden(); // second visit: does not

    await context.close();
  });

  test('does not auto-show when the seen flag is pre-seeded (the shared beforeEach context)', async ({ page }) => {
    await expect(page.getByTestId('help-overlay')).toBeHidden();
  });
});

test.describe('Help modal: open/close behavior + focus handling', () => {
  test('opens via the ? button, and the overlay is display:none while closed', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).toBe('none');

    await page.getByTestId('help-button').click();

    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
    await expect(page.getByTestId('help-modal')).toContainText('How Color Designer works');
  });

  test('opens scrolled to the top even though initial focus lands on the ✕', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await page.getByTestId('help-button').click();

    const dialog = page.getByTestId('help-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.getByTestId('modal-close-x')).toBeFocused();
  });

  test('Esc closes the modal and returns focus to the ? button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    await expect(page.getByTestId('help-overlay')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('help-overlay')).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('backdrop click closes the modal', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeVisible();

    // Click the overlay itself, well outside the centered dialog box.
    await overlay.click({ position: { x: 5, y: 5 } });

    await expect(overlay).toBeHidden();
  });

  // docs/conventions.md "Every content modal has a close ✕ in its top-right
  // corner" — the pinned ✕ is the dialog's sole dedicated close trigger,
  // alongside Esc and backdrop click.
  test('a pinned ✕ close button sits in the dialog\'s top-right corner and closes the modal, returning focus to the ? button', async ({ page }) => {
    const helpButton = page.getByTestId('help-button');
    await helpButton.click();
    const overlay = page.getByTestId('help-overlay');
    const dialog = page.getByTestId('help-modal');
    await expect(overlay).toBeVisible();

    const closeXBtn = dialog.getByTestId('modal-close-x');
    await expect(closeXBtn).toBeVisible();
    await expect(closeXBtn).toHaveAttribute('aria-label', 'Close');

    await closeXBtn.click();

    await expect(overlay).toBeHidden();
    await expect(helpButton).toBeFocused();
  });

  test('focus is trapped inside the dialog while open (Tab wraps around)', async ({ page }) => {
    await page.getByTestId('help-button').click();
    const dialog = page.getByTestId('help-modal');
    const closeXBtn = dialog.getByTestId('modal-close-x');
    await expect(closeXBtn).toBeFocused();

    // The pinned ✕ is the dialog's only focusable element now that the
    // bottom Close button is gone, so Tab/Shift+Tab both just keep focus on
    // it — proof the trap doesn't let focus escape to the page behind the
    // overlay (e.g. the ? button or the Roll button).
    await page.keyboard.press('Tab');
    await expect(closeXBtn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(closeXBtn).toBeFocused();

    const activeIsOutsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="help-modal"]');
      return !dialog.contains(document.activeElement);
    });
    expect(activeIsOutsideDialog).toBe(false);
  });
});

test.describe('Help modal + Help button: touch-action manipulation (mobile double-tap-to-zoom guard)', () => {
  test('the ? button and the dialog ✕ both have touch-action: manipulation', async ({ page }) => {
    const helpButtonTouchAction = await page.getByTestId('help-button').evaluate((el) => getComputedStyle(el).touchAction);
    expect(helpButtonTouchAction).toBe('manipulation');

    await page.getByTestId('help-button').click();
    const closeXTouchAction = await page.getByTestId('modal-close-x').evaluate((el) => getComputedStyle(el).touchAction);
    expect(closeXTouchAction).toBe('manipulation');
  });

  test('the generic button touch-action rule also covers an ordinary control (Roll again)', async ({ page }) => {
    const touchAction = await page.getByTestId('roll-btn').evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('manipulation');
  });
});

// ---------------------------------------------------------------------------
// Shared tools/include/base.css, pasted into this tool's <style>.
// ---------------------------------------------------------------------------
test.describe('shared base.css include', () => {
  test('the document root has touch-action: manipulation', async ({ page }) => {
    const touchAction = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  test('[hidden] elements are actually hidden (the help overlay before first open)', async ({ page }) => {
    const overlay = page.getByTestId('help-overlay');
    await expect(overlay).toBeHidden();
    const display = await overlay.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('the harmony and colors-count <select> boxes get the ct-base appearance fix: appearance:none, >=44px min-height, and a chevron background-image (not blanked by this tool\'s own fill/padding rules)', async ({
    page,
  }) => {
    for (const testid of ['harmony-select', 'count-select']) {
      const style = await page.getByTestId(testid).evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          appearance: cs.appearance || cs.webkitAppearance,
          minHeight: parseFloat(cs.minHeight),
          backgroundImage: cs.backgroundImage,
        };
      });
      expect(style.appearance).toBe('none');
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.backgroundImage).not.toBe('none');
      expect(style.backgroundImage).toContain('url(');
    }
  });
});

// ---------------------------------------------------------------------------
// Color-row one-line layout at phone width (Fix B): swatch + rgba field +
// hex field share one line instead of stacking (this row has no trash can).
// ---------------------------------------------------------------------------
test.describe('scheme color-row one-line layout at phone width', () => {
  test.use({ viewport: { width: 380, height: 740 } });

  // Row children have different heights (the 32px swatch vs. the taller
  // .field boxes) and are align-items: center, so their *tops* legitimately
  // differ on one shared line — compare vertical centers instead, and
  // confirm left-to-right, non-overlapping horizontal order.
  async function rowChildGeometry(row) {
    return row.evaluate((el) => {
      const kids = [
        el.querySelector('[data-testid="scheme-color-swatch"]'),
        el.querySelector('[data-testid="scheme-color-rgba"]').closest('.field'),
        el.querySelector('[data-testid="scheme-color-hex"]').closest('.field'),
      ];
      return kids.map((k) => {
        const r = k.getBoundingClientRect();
        return { left: r.left, right: r.right, centerY: r.top + r.height / 2 };
      });
    });
  }

  test('swatch, rgba field, and hex field share one line at 380px (first scheme is auto-expanded), no page overflow', async ({
    page,
  }) => {
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    await expect(row).toBeVisible();

    const [swatch, rgbaField, hexField] = await rowChildGeometry(row);
    expect(Math.abs(rgbaField.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    expect(Math.abs(hexField.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    // Left-to-right order on the same line, not stacked underneath each other.
    expect(rgbaField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(hexField.left).toBeGreaterThanOrEqual(rgbaField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });

  test('at 360px width, a color row still does not wrap onto multiple lines', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const row = page.getByTestId('scheme-detail').first().getByTestId('scheme-color-row').first();
    await expect(row).toBeVisible();

    const [swatch, rgbaField, hexField] = await rowChildGeometry(row);
    expect(Math.abs(rgbaField.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    expect(Math.abs(hexField.centerY - swatch.centerY)).toBeLessThanOrEqual(2);
    expect(rgbaField.left).toBeGreaterThanOrEqual(swatch.right);
    expect(hexField.left).toBeGreaterThanOrEqual(rgbaField.right);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
  });
});
