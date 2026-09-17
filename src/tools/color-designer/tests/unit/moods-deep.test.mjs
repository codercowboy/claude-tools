// Moods — deeper coverage than moods.test.mjs. Locks in the *behavioral*
// promises the mood layer makes on top of moods.test.mjs's shape checks:
//   - hue-arc containment for EVERY themed mood (not just ocean/sunset),
//     including wrapped arcs and the multi-arc selection branch;
//   - sat/light/roleScale actually move the output in the documented
//     direction (pastel lighter + less saturated than deep; bigger roleScale
//     => bigger in-scheme lightness swing);
//   - spread=0 collapses every harmony to a single hue (monochrome);
//   - a seed's base hue is honored for hue-free (tone) moods but overridden
//     by a themed mood's arc;
//   - 'surprise' never resolves to 'any' across a large rng sweep;
//   - MOOD_ANY === omitting mood across many algorithms x counts.
// All pure — node --test, no browser/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadColorDesigner, seqRng } from './_helpers.mjs';

const {
  anchorHues, ALGORITHMS, norm360,
  MOODS, MOOD_MAP, MOOD_ANY, SURPRISE_POOL, moodBaseHue,
  generateScheme, roll, rgbToHsl,
} = await loadColorDesigner();

// Themed moods = every mood that stakes out a hue neighborhood (hueArcs set).
const THEMED = MOODS.filter((m) => m.hueArcs);
// Algorithms whose FIRST anchor offset is 0, so the scheme's first color sits
// on the base hue itself for any spread — lets us assert a generated color is
// inside the mood arc without re-deriving each algorithm's offsets. (Analogous
// starts at H-30, so it's excluded from the generated-color arc check.)
const OFFSET0_ALGOS = ['complementary', 'triadic', 'splitComplementary', 'tetradic', 'monochromatic'];

// True if hue h (degrees) falls inside any of the mood's arcs, honoring the
// end<start wrap (e.g. [335,45] spans 335..360 and 0..45). Small epsilon
// absorbs the 8-bit RGB round-trip when checking generated colors.
function hueInArcs(h, arcs, eps = 0) {
  const hh = norm360(h);
  return arcs.some(([a, b]) => {
    if (b >= a) return hh >= a - eps && hh <= b + eps;
    // wrapped arc: inside if above start OR below end
    return hh >= a - eps || hh <= b + eps;
  });
}

test('moodBaseHue: stays inside its arc for EVERY themed mood, across a fine rng sweep', () => {
  const ts = Array.from({ length: 51 }, (_, i) => i / 50 - 1e-9).map((t) => Math.max(0, t));
  for (const mood of THEMED) {
    for (const t of ts) {
      const h = moodBaseHue(mood, seqRng([t]));
      assert.ok(
        hueInArcs(h, mood.hueArcs),
        `${mood.key}: base hue ${h.toFixed(2)} outside ${JSON.stringify(mood.hueArcs)} for t=${t}`,
      );
    }
  }
});

test('moodBaseHue: wrapped arcs (warm 330->60, sunset 335->45) cross 360 correctly', () => {
  // t=0 lands on the arc start exactly.
  assert.equal(moodBaseHue(MOOD_MAP.warm, seqRng([0])), 330);
  assert.equal(moodBaseHue(MOOD_MAP.sunset, seqRng([0])), 335);
  // A midpoint draw walks past 360 and wraps: warm span 330..420, t=0.5 -> 375 -> 15.
  assert.ok(Math.abs(moodBaseHue(MOOD_MAP.warm, seqRng([0.5])) - 15) < 1e-9);
  // sunset span 335..405, t=0.5 -> 370 -> 10.
  assert.ok(Math.abs(moodBaseHue(MOOD_MAP.sunset, seqRng([0.5])) - 10) < 1e-9);
  // Every result is normalized into [0,360).
  for (const t of [0, 0.2, 0.5, 0.8, 0.999]) {
    const h = moodBaseHue(MOOD_MAP.sunset, seqRng([t]));
    assert.ok(h >= 0 && h < 360, `sunset hue ${h} not normalized for t=${t}`);
  }
});

test('moodBaseHue: a multi-arc mood picks one arc (first draw) then a hue inside it (second draw)', () => {
  const twoArc = { key: 'multi', hueArcs: [[0, 10], [200, 210]], spread: 1, sat: [0.5, 0.5], light: [0.5, 0.5], roleScale: 1 };
  // first draw 0.9 -> floor(0.9*2)=1 -> arc [200,210]; second draw 0.5 -> 205.
  assert.ok(Math.abs(moodBaseHue(twoArc, seqRng([0.9, 0.5])) - 205) < 1e-9);
  // first draw 0.1 -> arc [0,10]; second draw 0.5 -> 5.
  assert.ok(Math.abs(moodBaseHue(twoArc, seqRng([0.1, 0.5])) - 5) < 1e-9);
});

test('generateScheme: every themed mood keeps its first (base-hue) color inside the arc, all offset-0 harmonies', () => {
  for (const mood of THEMED) {
    for (const algo of OFFSET0_ALGOS) {
      const scheme = generateScheme(algo, [], 4, seqRng([0.6, 0.4, 0.5, 0.3, 0.7]), mood);
      const h0 = rgbToHsl(scheme[0]).h;
      assert.ok(
        hueInArcs(h0, mood.hueArcs, 3),
        `${mood.key}/${algo}: first color hue ${h0.toFixed(1)} outside ${JSON.stringify(mood.hueArcs)}`,
      );
    }
  }
});

test('sat/light ranges: pastel is lighter AND less saturated than deep for the same rng draws', () => {
  // No seeds + hue-free mood => rng draws are exactly [H, S, L]; role "base"
  // (slot 1) applies zero delta, so slot 1's HSL == the mood's base S/L.
  const seq = [0.5, 0.5, 0.5];
  const pastel = generateScheme('monochromatic', [], 2, seqRng(seq), MOOD_MAP.pastel);
  const deep = generateScheme('monochromatic', [], 2, seqRng(seq), MOOD_MAP.deep);
  const pBase = rgbToHsl(pastel[1]);
  const dBase = rgbToHsl(deep[1]);
  assert.ok(pBase.l > dBase.l, `pastel L ${pBase.l} should exceed deep L ${dBase.l}`);
  assert.ok(pBase.s < dBase.s, `pastel S ${pBase.s} should be below deep S ${dBase.s}`);
});

test('roleScale: a larger roleScale widens the in-scheme lightness swing (custom moods isolate the field)', () => {
  // Collapsed sat/light ranges pin baseS/baseL constant, so the ONLY thing that
  // varies between these two custom moods is roleScale.
  const base = { hueArcs: null, spread: 1, sat: [0.7, 0.7], light: [0.5, 0.5] };
  const gentle = { key: 'g', ...base, roleScale: 0.5 };
  const stark = { key: 's', ...base, roleScale: 1 };
  const seq = [0.5, 0.5, 0.5];
  // slot 0 = "shade" role (dL -0.28); slot 1 = "base" role (dL 0). The lightness
  // gap between them is |dL| * roleScale, so stark's gap must exceed gentle's.
  const g = generateScheme('monochromatic', [], 2, seqRng(seq), gentle);
  const s = generateScheme('monochromatic', [], 2, seqRng(seq), stark);
  const gGap = Math.abs(rgbToHsl(g[1]).l - rgbToHsl(g[0]).l);
  const sGap = Math.abs(rgbToHsl(s[1]).l - rgbToHsl(s[0]).l);
  assert.ok(sGap > gGap + 0.05, `stark swing ${sGap.toFixed(3)} should exceed gentle ${gGap.toFixed(3)}`);
});

test('spread=0 collapses every harmony to a single base hue (anchorHues)', () => {
  for (const { key } of ALGORITHMS) {
    const hues = anchorHues(key, 137, 0);
    for (const h of hues) assert.equal(h, 137, `${key} at spread 0 should be all-137, got ${hues}`);
  }
});

test('spread=0 mood: a multi-anchor harmony produces one tightly-clustered hue in the generated colors', () => {
  const flat = { key: 'flat', hueArcs: null, spread: 0, sat: [0.8, 0.8], light: [0.5, 0.5], roleScale: 1 };
  const scheme = generateScheme('tetradic', [], 6, seqRng([0.25, 0.5, 0.5]), flat);
  const hues = scheme.map((c) => rgbToHsl(c).h);
  const hi = Math.max(...hues), lo = Math.min(...hues);
  // High, fixed saturation keeps hue stable through the RGB round-trip; with
  // spread 0 there is no hue rotation at all, only role-driven S/L variation.
  assert.ok(hi - lo < 4, `spread-0 hues should be near-identical, spanned ${lo.toFixed(1)}..${hi.toFixed(1)}`);
});

test('seed base hue: honored for a hue-free (tone) mood, overridden by a themed arc', () => {
  const redSeed = { r: 255, g: 0, b: 0, a: 1 }; // hue 0
  // First draw < 0.5 => seedBaseWanted; hue-free mood => useSeedBase true, so
  // the base hue comes from the seed (0). Later slots (not the injected one)
  // are drawn at that base hue. Use monochromatic so every anchor == base hue.
  const seqTone = [0.1, /*seed idx*/ 0.0, /*S*/ 0.5, /*L*/ 0.5, /*k*/ 0.0, /*pick*/ 0.0];
  const tone = generateScheme('monochromatic', [redSeed], 4, seqRng(seqTone), MOOD_MAP.deep);
  // The seed occupies one slot; at least one other slot must sit on the red base.
  const nonSeedHues = tone
    .filter((c) => !(c.r === 255 && c.g === 0 && c.b === 0))
    .map((c) => rgbToHsl(c).h);
  assert.ok(
    nonSeedHues.some((h) => Math.min(h, 360 - h) < 6),
    `deep (tone) should honor the red seed's base hue; non-seed hues were ${nonSeedHues.map((h) => h.toFixed(1))}`,
  );
  // Themed mood (ocean): the arc wins, the seed does NOT become the base hue.
  // ocean has hueArcs, so useSeedBase is false regardless of the first draw.
  const seqTheme = [0.1, /*base hue in arc*/ 0.5, /*S*/ 0.5, /*L*/ 0.5, /*k*/ 0.0, /*pick*/ 0.0];
  const themed = generateScheme('monochromatic', [redSeed], 4, seqRng(seqTheme), MOOD_MAP.ocean);
  const themedNonSeed = themed
    .filter((c) => !(c.r === 255 && c.g === 0 && c.b === 0))
    .map((c) => rgbToHsl(c).h);
  for (const h of themedNonSeed) {
    assert.ok(h >= 172 && h <= 233, `ocean base hue ${h.toFixed(1)} should ignore the red seed and stay in-arc`);
  }
});

test("roll: 'surprise' always resolves to 'any' (no mood persuasion) across a large rng sweep", () => {
  for (let i = 0; i < 400; i++) {
    const first = i / 400; // 0 .. ~0.9975, spans the whole [0,1) selector range
    const result = roll({ algorithm: 'triadic', seeds: [], count: 3, rng: seqRng([first, 0.2, 0.5, 0.4]), mood: 'surprise' });
    assert.equal(result.mood, 'any', `surprise should be no-persuasion, got ${result.mood} at first=${first}`);
  }
});

test('MOOD_ANY: passing it explicitly === omitting mood, across every algorithm and several counts', () => {
  for (const { key: algo } of ALGORITHMS) {
    for (const n of [2, 4, 7, 10]) {
      const seq = [0.42, 0.1, 0.9, 0.33, 0.7, 0.2, 0.6, 0.4, 0.8, 0.15, 0.55, 0.28];
      const omitted = generateScheme(algo, [], n, seqRng(seq));
      const explicit = generateScheme(algo, [], n, seqRng(seq), MOOD_ANY);
      assert.deepEqual(explicit, omitted, `${algo} n=${n}: MOOD_ANY diverged from the default`);
    }
  }
});
