# qr-generator — Implementation Plan

Author: Claude (planner). Implements `DESIGN.md` strictly; if this plan and
DESIGN.md ever conflict, DESIGN.md wins — flag the discrepancy rather than
silently resolving it. The hand-rolled QR encoder is the crux of this tool;
this plan pins down every algorithmic step and constant concretely enough
that the worker should not need to make correctness judgment calls, only
transcribe/wire.

**A warning up front, read this first:** QR encoding is exact-bit-level spec
compliance — there is no "close enough." A single wrong table value, wrong
bit order, or off-by-one in the zig-zag placement produces a matrix that
looks plausible but **will not scan** or **will not round-trip decode**. The
plan below gives you the algorithms precisely and the small tables in full,
but flags the one large table (§3) as something to source from a canonical
reference and self-verify — do not hand-wave it.

Deliverables for the worker: `tools/qr-generator/index.html`,
`tools/qr-generator/README.md`, and `tools/qr-generator/package.json`
(doesn't exist yet — create it; see §12). Tests are a separate agent's job
(not this worker's), but the worker must build every testability hook in §11
so the tester can drive the tool without touching `index.html` again.

---

## 0. Overall file structure

Single `index.html`, in this order:

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR Code Generator</title>
  <!-- OG/Twitter meta tags per docs/conventions.md — see §10 -->
  <style> ... all CSS ... </style>
</head>
<body>
  <header>...title + one-line description...</header>

  <main class="app">
    <section class="input-section" data-testid="input-section">
      ...textarea, capacity hint...
    </section>

    <section class="options-section" data-testid="options-section">
      ...EC level select, scale, quiet zone, fg/bg color, contrast warning...
    </section>

    <section class="output-section" data-testid="output-section">
      ...canvas, caption, download buttons, error message...
    </section>
  </main>

  <!------ Begin Footer HASH: a97df085179a11175786e1d57d6c2a99 ---->
  <style>...</style>
  <footer class="ct-footer">...</footer>
  <!---- end footer -->

  <script type="module">
    // 1. Constants: GF(256) tables, format/version BCH constants, remainder-
    //    bits table, total-codewords-per-version table, the big EC/block
    //    table (§3), char-count-bits table, mask formulas, penalty weights.
    // 2. Bit buffer helper (BitWriter/BitReader-ish pure class/functions).
    // 3. UTF-8 + segment encoding (§2).
    // 4. Reed-Solomon: gfMul, rsGeneratorPoly(n), rsComputeRemainder (§4).
    // 5. Interleaving (§5).
    // 6. Matrix geometry: alignment positions, isFunctionModule, placeFinder,
    //    placeTiming, placeAlignment, placeDarkModule, reserveFormatAreas,
    //    reserveVersionAreas (§6).
    // 7. Data placement zig-zag (§6.6).
    // 8. Masking: 8 mask predicates, 4 penalty rules, applyBestMask (§7).
    // 9. Format/version info bit computation (§6.4/§6.5).
    // 10. Public pure API: encodeToMatrix, plus exposed helpers (§8).
    // 11. Rendering: renderToCanvas, toSVGString, download handlers (§9).
    // 12. UI wiring: DOM refs, debounced re-render, contrast check, error
    //     states, accessibility updates (§10).
    // 13. window.__qr assignment (§11).
  </script>
</body>
</html>
```

One `<style>` block, one `<script type="module">`. No `ctConfirm` needed —
nothing in this tool is destructive (no data to lose; regenerating is free),
so skip the confirm-modal convention entirely.

---

## 1. Terminology & data shapes used throughout this plan

- **Module** — one black/white cell of the QR matrix. `modules: boolean[][]`,
  `true` = dark, indexed `modules[row][col]`, `row`/`col` both `0..size-1`.
- **Codeword** — one byte (0–255). Data is built as a stream of codewords,
  then codewords are split into blocks, then error-correction (EC) codewords
  are computed per block, then everything is interleaved back into one
  stream and turned into a bitstream, MSB-first per byte.
- **Version** — an integer `1..40`. `size = 17 + 4*version` (v1 → 21×21, v40
  → 177×177).
- **EC level** — one of `'L' | 'M' | 'Q' | 'H'` (increasing redundancy,
  decreasing data capacity). Default per DESIGN.md: `'M'`.
- All algorithmic functions in §2–§8 are **pure** — no DOM, no globals beyond
  the module-level constant tables — so they can be unit-tested directly via
  `window.__qr` and so `encodeToMatrix` itself is trivially pure.

---

## 2. Data encoding: UTF-8 bytes → byte-mode segment → padded bitstream

### 2.1 UTF-8 encoding

```js
function utf8Bytes(str) {
  return new TextEncoder().encode(str); // Uint8Array — handles all Unicode incl. astral/emoji
}
```

`TextEncoder` is a standard, non-secure-context-gated browser API — safe to
use directly (unlike `crypto.randomUUID()`; this tool has no
secure-context-only API concerns at all, note that in README/tests if asked,
but no special guard is needed here).

### 2.2 Char-count-indicator bit length (byte mode only — this tool never uses
numeric/alphanumeric/kanji modes)

Per ISO/IEC 18004 Table 3, the byte-mode character-count-indicator length
depends on which version band the chosen version falls in:

```js
function charCountBits(version) {
  if (version <= 9) return 8;
  return 16; // versions 10-40 (byte mode uses 16 for BOTH the 10-26 and 27-40 bands — unlike numeric/alphanumeric/kanji, byte mode does not change again after v9)
}
```

### 2.3 Segment bit construction

```js
// bytes: Uint8Array, version: chosen version (needed for charCountBits)
function buildByteModeSegmentBits(bytes, version) {
  const bits = new BitWriter();
  bits.writeBits(0b0100, 4);                      // mode indicator: byte mode
  bits.writeBits(bytes.length, charCountBits(version)); // char count indicator
  for (const b of bytes) bits.writeBits(b, 8);     // the data itself, byte-aligned already
  return bits;
}
```

`BitWriter` is a small pure helper (push bits MSB-first into a growing
array/Uint8Array-backed buffer; `writeBits(value, n)` writes the low `n` bits
of `value`, most-significant bit first). Expose `bitLength` and a
`toBytes()`/`toBitArray()` finalizer. Keep it dependency-free and trivial —
this is not a place to get clever.

### 2.4 Terminator + padding to the version's data-codeword capacity

Given the target `dataCodewordCount` for the chosen version+EC level (from
the big table, §3):

```js
function padToCapacity(bits, dataCodewordCount) {
  const capacityBits = dataCodewordCount * 8;
  if (bits.bitLength > capacityBits) throw new Error('segment exceeds capacity'); // should never happen — caller already checked (§2.5)

  // 1. Terminator: up to 4 zero bits, but only as many as fit.
  const term = Math.min(4, capacityBits - bits.bitLength);
  bits.writeBits(0, term);

  // 2. Pad with 0 bits to the next byte boundary.
  const padBits = (8 - (bits.bitLength % 8)) % 8;
  bits.writeBits(0, padBits);

  // 3. Pad with alternating 0xEC, 0x11 codewords until capacity is reached.
  let padByte = 0xEC;
  while (bits.bitLength < capacityBits) {
    bits.writeBits(padByte, 8);
    padByte = padByte === 0xEC ? 0x11 : 0xEC;
  }
  return bits;
}
```

### 2.5 Auto-version selection (smallest version that fits)

Rather than maintaining a separate "byte capacity per version" table (a
common source of off-by-one bugs), **derive** the fit check directly from the
segment's actual bit length plus the terminator/padding rule, checked against
each version's `dataCodewordCount` (from §3) in increasing order:

```js
function selectVersion(byteLength, ecLevel) {
  for (let version = 1; version <= 40; version++) {
    const dataCodewordCount = getDataCodewordCount(version, ecLevel); // §3 table lookup
    const headerBits = 4 + charCountBits(version);
    const neededBits = headerBits + byteLength * 8; // terminator/padding always fits if neededBits <= capacity (terminator can be 0-4 bits, padding rounds up to byte — both only ever CONSUME slack, never need extra beyond capacity)
    if (neededBits <= dataCodewordCount * 8) return version;
  }
  return null; // input exceeds V40 capacity at this EC level
}
```

Note this is correct without simulating the terminator/pad exactly: the
terminator adds at most 4 bits and padding then rounds up to a byte boundary
— both operations only consume existing slack up to the byte-aligned
capacity, they never push the total *past* `dataCodewordCount*8` given
`neededBits <= dataCodewordCount*8` already held before terminator/padding.
(If `neededBits` lands exactly on `dataCodewordCount*8`, `padToCapacity`
above correctly writes a 0-bit terminator and 0 pad bits/bytes — verify this
edge case in a test: an input whose exact byte length fills a version's
capacity to precisely zero slack.)

`encodeToMatrix` calls `selectVersion(bytes.length, ecLevel)`; if it returns
`null`, throw a clear error, e.g. `new Error('Input too large for a QR code at EC level ' + ecLevel + ' (exceeds version 40 capacity).')` — the UI (§10) catches this and shows the inline error message.

---

## 3. Capacity/parameter tables

Four things are needed. Three are small and given here **in full**. The
fourth (§3.4) is the one large table — source it carefully.

### 3.1 Total codewords per version (40 values)

Total codewords (data + EC combined) is fixed per version, independent of EC
level — it's purely a function of the matrix's usable module count.

```js
const TOTAL_CODEWORDS = [
  0, // unused index 0
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];
```

### 3.2 Remainder bits per version (40 values)

After interleaving, this many extra `0` bits are appended before placement
(some versions' bitstream doesn't fill a whole number of modules exactly):

```js
const REMAINDER_BITS = [
  0, // unused index 0
  0, 7, 7, 7, 7, 7, 0, 0, 0, 0,
  0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 3, 3, 3,
  3, 3, 3, 3, 0, 0, 0, 0, 0, 0,
];
```

### 3.3 Alignment pattern center coordinates — compute algorithmically, no table

Rather than transcribing the ~39-row alignment-coordinate table by hand
(high error risk for large versions), compute it with the standard
constructive algorithm used by reference open-source QR generators (e.g.
Nayuki's `QR-Code-generator`, MIT licensed — this is the well-known public
algorithm, re-derive it here rather than embedding it as an unattributed
table):

```js
function getAlignmentPatternPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = (version === 32)
    ? 26
    : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const positions = [6];
  const last = (4 * version) + 10; // = size - 7
  for (let i = numAlign - 2; i >= 0; i--) {
    positions.push(last - i * step);
  }
  return positions;
}
```

**Worker: verify this function's output against known-good values before
trusting it**, e.g.: version 2 → `[6, 18]`; version 7 → `[6, 22, 38]`;
version 32 → `[6, 34, 60, 86, 112, 138, 164]`. If your transcription of the
`step`/`last` formula doesn't reproduce these three exactly, fix the formula
before proceeding — do not ship an alignment-pattern function that hasn't
been checked against at least these three vectors (small, medium, and the
one version — 32 — that needs the special-cased `step`).

The alignment-pattern *center* grid is the Cartesian product of this array
with itself; skip any `(row, col)` combination that overlaps a finder
pattern's 8×8 footprint (i.e. skip the three corners: top-left, top-right,
bottom-left) — see §6.3.

### 3.4 THE critical table: data/EC codewords per version × EC level

**Schema** (one row per `(version, ecLevel)` pair, 160 rows total):

| column | meaning |
|---|---|
| `totalDataCodewords` | data codewords available at this version+level (equal to `TOTAL_CODEWORDS[version] - totalEcCodewords`) |
| `ecCodewordsPerBlock` | EC codewords generated per block (same value for every block in both groups, at a given version+level) |
| `numBlocksGroup1`, `dataCodewordsGroup1` | how many blocks in group 1, and data codewords per group-1 block |
| `numBlocksGroup2`, `dataCodewordsGroup2` | how many blocks in group 2 (0 for most rows — many versions have only one group), and data codewords per group-2 block |

**Source this from a canonical, cross-checkable reference** — ISO/IEC
18004:2015 Annex "Error correction characteristics for QR Code" (the table
is also reproduced, and cross-checked against each other by independent
implementers, in: the thonky.com QR code tutorial's "Error Correction Table"
page, Nayuki's `QR-Code-generator` source (`ECC_CODEWORDS_PER_BLOCK` +
`NUM_ERROR_CORRECTION_BLOCKS` tables), and ZXing's `Version.java`
`VERSION_INFO` block). Transcribe from one of these directly — **do not
retype from memory** — then run the self-consistency + spot-check validation
below.

**Self-consistency check (run this over all 160 rows once transcribed, as
part of §12's build checklist, e.g. a throwaway Node script or a quick test):**

```js
for (const level of ['L','M','Q','H']) {
  for (let v = 1; v <= 40; v++) {
    const row = EC_TABLE[v][level];
    const totalData = row.numBlocksGroup1 * row.dataCodewordsGroup1
                     + row.numBlocksGroup2 * row.dataCodewordsGroup2;
    const totalBlocks = row.numBlocksGroup1 + row.numBlocksGroup2;
    console.assert(totalData === row.totalDataCodewords, `v${v}${level} data mismatch`);
    console.assert(
      row.totalDataCodewords + totalBlocks * row.ecCodewordsPerBlock === TOTAL_CODEWORDS[v],
      `v${v}${level} total-codewords mismatch`
    );
  }
}
```

This catches almost every plausible transcription error (swapped columns,
wrong group split, mis-copied EC-per-block) even without knowing the "true"
value in advance, because it checks the table against §3.1 (already
trustworthy) and against itself.

**Spot-check values** (high-confidence, verify your transcription's version-1
row against these exactly before moving on — if version 1 is right the
transcription process is almost certainly sound for the rest):

| version | level | totalData | ecPerBlock | blocks |
|---|---|---|---|---|
| 1 | L | 19 | 7  | 1×19 |
| 1 | M | 16 | 10 | 1×16 |
| 1 | Q | 13 | 13 | 1×13 |
| 1 | H | 9  | 17 | 1×9  |

And these well-known byte-mode **maximum character capacities** (derivable
from `totalDataCodewords` via `floor((totalDataCodewords*8 - 4 - charCountBits(version)) / 8)`,
useful as an independent end-to-end sanity check once §2.5's `selectVersion`
is implemented — feed a byte string of exactly this length at this level and
confirm `selectVersion` returns exactly this version, not one more or one
less):

- Version 1, level L: **17 bytes** max.
- Version 40, level L: **2953 bytes** max.
- Version 40, level H: **1273 bytes** max.

`getDataCodewordCount(version, ecLevel)` (§2.5) is just
`EC_TABLE[version][ecLevel].totalDataCodewords`. `getBlockPlan(version,
ecLevel)` (§5) returns the full row for interleaving.

---

## 4. Reed-Solomon error correction (GF(256))

### 4.1 GF(256) log/antilog tables

QR uses the primitive polynomial `x^8 + x^4 + x^3 + x^2 + 1` (`0x11D`) and
primitive element `2`:

```js
const GF_EXP = new Uint8Array(512); // extra room so gfMul can index without modulo
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D; // reduce mod the primitive polynomial
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; // mirror, avoids a modulo in gfMul
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]; // sum is at most 254+254=508 < 512, mirror table handles it
}
```

### 4.2 Generator polynomial for `n` EC codewords

```js
function rsGeneratorPoly(n) {
  let poly = [1]; // coefficients, highest degree first
  for (let i = 0; i < n; i++) {
    // multiply poly by (x - GF_EXP[i])  [subtraction == XOR == addition in GF(2^8)]
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly; // length n+1, poly[0] === 1 always
}
```

Cache generator polynomials by `n` (a small `Map`) — the same block sizes
(7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30) recur across many
version/level combinations within one `encodeToMatrix` call and across
calls.

### 4.3 Computing EC codewords for one block

```js
function rsComputeRemainder(dataCodewords, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const result = new Uint8Array(dataCodewords.length + ecCount);
  result.set(dataCodewords);
  for (let i = 0; i < dataCodewords.length; i++) {
    const coef = result[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      result[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return result.slice(dataCodewords.length); // the trailing ecCount bytes ARE the remainder/EC codewords
}
```

This is the standard "polynomial long division via LFSR" approach — no need
for anything more elaborate.

---

## 5. Splitting into blocks + interleaving

### 5.1 Split the padded data codeword stream into blocks

Using the row from §3.4 (`numBlocksGroup1`/`dataCodewordsGroup1`/
`numBlocksGroup2`/`dataCodewordsGroup2`), slice the data codeword array (from
`padToCapacity`'s finished bitstream, converted to bytes — it's already
exactly `dataCodewordCount` bytes by construction) into
`numBlocksGroup1 + numBlocksGroup2` contiguous chunks, group 1's blocks
first (each `dataCodewordsGroup1` bytes), then group 2's (each
`dataCodewordsGroup2` bytes; group 2 is empty for versions with only one
group — `numBlocksGroup2 === 0`).

For each block, compute its EC codewords via `rsComputeRemainder(block,
ecCodewordsPerBlock)`.

### 5.2 Interleave data codewords

Data codewords are interleaved **by index across blocks**, group 1 and group
2 blocks treated uniformly (group 2's blocks are simply longer by 1
codeword in every version that has two groups — the interleave naturally
handles the length difference by skipping blocks once exhausted):

```js
function interleave(blocks) { // blocks: [{data: Uint8Array, ec: Uint8Array}, ...]
  const out = [];
  const maxData = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  const maxEc = Math.max(...blocks.map(b => b.ec.length)); // all equal in practice (ecCodewordsPerBlock is uniform across both groups) but loop generically
  for (let i = 0; i < maxEc; i++) {
    for (const b of blocks) if (i < b.ec.length) out.push(b.ec[i]);
  }
  return out; // array of codeword bytes, data codewords first, then EC codewords
}
```

### 5.3 Append remainder bits

Convert `out` (bytes) to a bit array (MSB-first per byte), then append
`REMAINDER_BITS[version]` zero bits. This final bit array is exactly what
gets placed into the matrix in §6.6, one bit per non-function module in
zig-zag order.

---

## 6. Matrix construction

`size = 17 + 4 * version`. Initialize `modules: (boolean|null)[][]` of
`size×size`, all `null` (not-yet-set) — this lets `isFunctionModule` be
implemented simply as "was this cell set by anything other than the data
placement step," by tracking a **parallel** `isFunction: boolean[][]` grid
set `true` wherever a function pattern/reserved area writes, checked before
data placement writes to a cell. (Two parallel grids is simpler and less
bug-prone than one grid with a subtractive "figure out later which cells
were function cells" reconstruction.)

### 6.1 Finder patterns + separators

Three 7×7 finder patterns at top-left `(0,0)`, top-right `(0, size-7)`,
bottom-left `(size-7, 0)`. Each is:

```
█████████
█▓▓▓▓▓▓▓█   outer ring: dark (7x7 border)
█▓███▓▓█    ring:       light (1-module inset)
█▓███▓▓█    center:      dark (3x3)
█▓███▓▓█
█▓▓▓▓▓▓▓█
█████████
```
i.e., for local coordinates `(r,c)` in `0..6`: dark if `r===0 || r===6 ||
c===0 || c===6` (outer ring) or `(2<=r<=4 && 2<=c<=4)` (center 3×3);
otherwise light. Mark **every** module in the 7×7 area (dark or light) as a
function module — both are fixed, neither is data.

Separator: the 1-module-wide all-light border immediately surrounding each
finder pattern, on the side(s) facing the matrix interior (for top-left:
row/col index `7` along both the 8th row and 8th column within the finder's
8×8 corner footprint, and the finder's own edge at index `-1` is off-matrix
so only the interior-facing separator exists). Simplest correct
implementation: for each of the three finder corners, mark the **entire 8×8
footprint** (7×7 finder + 1-module separator ring on the interior sides) as
function modules, explicitly setting the separator ring's modules to light
(`false`). Because the finder corners sit at the matrix edges, the 8×8
footprint naturally clips to the modules that exist (e.g. top-left's
footprint is rows/cols `0..7`, all in-bounds; top-right's is rows `0..7`,
cols `size-8..size-1`).

### 6.2 Timing patterns

Row 6 and column 6, alternating dark/light starting **dark** at the first
non-finder position and continuing to the last non-finder position:

```js
for (let i = 8; i <= size - 9; i++) {
  const dark = i % 2 === 0;
  setFunctionModule(6, i, dark);
  setFunctionModule(i, 6, dark);
}
```

(Position 8 is the first module past the top-left finder+separator's 8×8
footprint; `size-9` is the last before the top-right/bottom-left
finder+separator's 8×8 footprint — this range is correct because it starts
right after column/row 7, which is the separator, and stops right before
`size-8`, the start of the next finder's footprint.)

### 6.3 Alignment patterns

For every `(row, col)` in the Cartesian product of `getAlignmentPatternPositions(version)`
with itself (§3.3), **skip** it if it overlaps any finder's 8×8 footprint —
concretely: skip if `(row <= 7 && col <= 7)` (top-left), `(row <= 7 && col
>= size-8)` (top-right), or `(row >= size-8 && col <= 7)` (bottom-left).
Otherwise place a 5×5 alignment pattern centered at `(row, col)`: for local
offsets `(dr, dc)` in `-2..2`, dark if `max(|dr|,|dc|) !== 1` (i.e. dark
border ring at distance 2, light ring at distance 1, dark single center) —
equivalently: dark unless exactly one of `|dr|,|dc|` equals `1` and the
other is `<=1`... simplest correct form:

```js
function alignmentModuleDark(dr, dc) {
  const d = Math.max(Math.abs(dr), Math.abs(dc));
  return d !== 1; // d===0 (center) dark, d===1 (ring) light, d===2 (border) dark
}
```

Version 1 has no alignment patterns (`getAlignmentPatternPositions(1)` is
`[]`, so this loop is a no-op).

### 6.4 Dark module

A single always-dark module at `(4 * version + 9, 8)` (fixed regardless of
mask/format — this is separate from, and not part of, the format-info
bitstream, though it sits adjacent to it in the layout).

### 6.5 Reserve format-info and version-info areas (write later, in §7)

**Format info** (15 bits, written **twice** for redundancy) occupies:
- Around the top-left finder: row `8`, columns `0..5` and `7..8` (column 6
  skipped — timing pattern), **and** column `8`, rows `0..5` and `7..8` (row
  6 skipped) — 15 modules total in this L-shape (the corner module `(8,8)`
  is part of it too, counted once).
- A second copy split across the other two finders: row `8`, columns
  `size-8..size-1` (8 modules, next to top-right finder), and column `8`,
  rows `size-7..size-1` (7 modules, next to bottom-left finder) — 15 modules
  total.

Mark **all** of these as function modules now (value doesn't matter yet,
they get overwritten with real bits in §7.4 after masking is chosen — but
they must be excluded from data placement in §6.6, so reserve them here).

**Version info** (18 bits, versions `>= 7` only) occupies two 3×6 blocks:
- Rows `size-11..size-9`, columns `0..5` (above the bottom-left finder).
- Rows `0..5`, columns `size-11..size-9` (left of the top-right finder).

Reserve these too (versions `< 7`: no-op, nothing reserved, those modules
are ordinary data-eligible modules for small versions).

### 6.6 Data placement (zig-zag, skipping function modules)

Given the final bit array from §5.3, walk the matrix in the standard QR
"upward/downward 2-column zig-zag starting from the bottom-right corner,
skipping column 6 entirely":

```js
function placeData(modules, isFunction, bits, size) {
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // never place in the timing column, shift left instead
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (isFunction[row][col]) continue; // skip finder/separator/timing/alignment/format/version/dark-module cells
        const bit = bitIndex < bits.length ? bits[bitIndex] : 0; // pad with 0 if we somehow run short (shouldn't happen — remainder bits account for exactly this)
        modules[row][col] = !!bit;
        bitIndex++;
      }
    }
    upward = !upward;
  }
  // bitIndex should now equal bits.length exactly (all data + EC + remainder bits consumed, all non-function modules filled) — assert this in dev/tests.
}
```

At this point every module is set: function modules from §6.1–6.5 (fixed,
pre-mask), data modules from this step (pre-mask, "raw" bits). §7 applies
masking **only to non-function modules** and finalizes format/version info.

---

## 7. Masking

### 7.1 The 8 mask formulas

Given a module's `(row, col)`, mask `i` flips the bit (XOR) wherever the
formula evaluates true — applied **only** to non-function (data) modules,
never to finder/separator/timing/alignment/format/version/dark-module cells:

```js
const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
```

### 7.2 Applying a mask (on a copy, non-destructively, so all 8 can be scored)

```js
function applyMask(rawModules, isFunction, maskIndex, size) {
  const maskFn = MASK_FNS[maskIndex];
  const out = rawModules.map(row => row.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFunction[r][c]) continue;
      if (maskFn(r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}
```

### 7.3 Penalty scoring (4 rules, sum = total penalty; lower is better)

**Rule 1 — runs of 5+ same-color modules, per row then per column:**
for each run of `n >= 5` consecutive same-color modules in a line, add
`3 + (n - 5)`.

**Rule 2 — 2×2 blocks of same color:** for every `2x2` block (top-left
corner at every `(r,c)` for `r,c` in `0..size-2`) where all 4 modules share
the same color, add `3` (note: overlapping 2×2 blocks each count
separately — a 3×2 solid block contributes 2 separate penalty hits, not 1).

**Rule 3 — finder-like patterns:** in every row and every column, for each
position, check for the bit pattern `dark,light,dark,dark,dark,light,dark`
(`1011101`) **immediately preceded by 4 light modules OR immediately
followed by 4 light modules** (i.e. `0000 1011101` or `1011101 0000`, either
side satisfies it, both would double-count if literally both match — but
per spec this is evaluated as: does the 11-bit window `0000` + the 7-bit
pattern, OR the 7-bit pattern + `0000`, occur starting at this offset). Each
match (evaluated independently, overlapping matches all count) adds `40`.
Implement as: for every horizontal/vertical run of 11 consecutive modules
matching `00001011101` or `10111010000`, add 40 per match, scanning with a
sliding window (allow the "4 light modules" to extend past the matrix edge
by treating out-of-bounds as light/`false`, which several reference
implementations do — verify against the round-trip decoder in tests rather
than debating this edge case further; it only affects a handful of penalty
points near matrix borders, never correctness of the encoded data itself).

**Rule 4 — dark module proportion:** let `darkPercent = 100 * darkCount /
(size*size)`. Find the two multiples of 5 nearest `darkPercent` (i.e.
`floor(darkPercent/5)*5` and that `+5`), compute `min(|that-50|,
|that+5-50|) / 5`, add `that * 10`. Equivalently:

```js
function rule4Penalty(darkCount, totalCount) {
  const percent = (darkCount * 100) / totalCount;
  const prevMultipleOf5 = Math.floor(percent / 5) * 5;
  const a = Math.abs(prevMultipleOf5 - 50) / 5;
  const b = Math.abs(prevMultipleOf5 + 5 - 50) / 5;
  return Math.min(a, b) * 10;
}
```

Total penalty = rule1 + rule2 + rule3 + rule4. This scoring runs on the
**fully finalized** matrix including format-info bits already written for
that candidate mask (per spec, format info participates in the penalty
scan) — so compute in this order per candidate mask `m`: apply mask to data
→ write format info for `(ecLevel, m)` (§7.4) → write version info if `v>=7`
(§7.4, mask-independent, same for all 8 candidates) → score. This matters:
scoring before format info is written under-penalizes/over-penalizes
slightly differently than the real spec process — do it in the order above.

### 7.4 Format info + version info bit computation (BCH, algorithmic — no lookup table)

**EC level indicator bits** (2 bits — note this is NOT alphabetical/capacity
order, it's the spec's fixed mapping, get this exact or every downstream
consumer/decoder disagrees with you):

```js
const EC_LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
```

**Format info (15 bits total: 5 data bits + 10 BCH bits, then XORed with a
fixed mask constant):**

```js
function computeFormatBits(ecLevel, maskIndex) {
  const data = (EC_LEVEL_BITS[ecLevel] << 3) | maskIndex; // 5 bits
  let rem = data << 10;
  const GEN = 0b10100110111; // generator polynomial, degree 10 (0x537), 11 bits incl. leading 1
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (10 + i)) & 1) rem ^= GEN << i;
  }
  const bch = (data << 10) | (rem & 0x3FF);
  return bch ^ 0b101010000010010; // fixed XOR mask, 0x5412
}
```

Write these 15 bits (MSB first, bit 14 down to bit 0) into the two reserved
format-info locations from §6.5, in the exact standard order:
- **Copy A** (around top-left finder): bits 14→0 go into, in order: `(8,0),
  (8,1), ..., (8,5), (8,7), (8,8), (7,8), (5,8), (4,8), ..., (0,8)` — i.e.
  along row 8 left-to-right skipping col 6, then up column 8 skipping row 6.
  (Verify this exact ordering against a reference implementation/the spec
  diagram before finalizing — this is one of the two or three places in the
  whole encoder most likely to have a subtle off-by-one; a wrong format-info
  bit ordering still often *looks* like a valid QR code visually but fails
  to decode, which is exactly the class of bug the round-trip decoder tests
  exist to catch.)
- **Copy B** (split near top-right/bottom-left): bits 14→7 go along row 8,
  columns `size-1` down to `size-8` (right to left); bits 6→0 go down column
  8, rows `size-7` to `size-1` (top to bottom).

**Version info (18 bits total: 6 data bits + 12 BCH bits, no XOR mask,
versions >= 7 only):**

```js
function computeVersionBits(version) {
  let rem = version << 12;
  const GEN = 0b1111100100101; // degree 12 (0x1F25), 13 bits incl. leading 1
  for (let i = 5; i >= 0; i--) {
    if ((rem >> (12 + i)) & 1) rem ^= GEN << i;
  }
  return (version << 12) | (rem & 0xFFF);
}
```

Write into both reserved 3×6 blocks from §6.5 — standard orientation: for
the block at rows `0..5`, columns `size-11..size-9`, bit `(row*3 + colOffset)`... 
**do not hand-derive this indexing from scratch under time pressure** — use
the well-known standard mapping: version info bit `k` (0 = LSB .. 17 = MSB)
maps to `(row, col) = (k % 3, floor(k/3))` relative to the block's
top-left-ish anchor, placed into **both** blocks (one is the transpose of
the other — rows/cols swapped — since one block is oriented horizontally-3-
wide/6-tall and the other vertically). Cross-check this placement the same
way as format info: get a version-7-or-larger matrix decoding correctly via
the round-trip decoder test (§11) — if the bit ordering is wrong, the
decoder will report a version mismatch or fail entirely, which is an
unambiguous, easy-to-spot test failure pointing straight back here.

### 7.5 Selecting the best mask

```js
function selectBestMask(rawModules, isFunction, size, version, ecLevel) {
  let best = null;
  for (let m = 0; m < 8; m++) {
    const candidate = applyMask(rawModules, isFunction, m, size);
    writeFormatInfo(candidate, isFunction, ecLevel, m, size);
    if (version >= 7) writeVersionInfo(candidate, version, size); // identical for every m, but writing it before scoring matters (see 7.3)
    const penalty = scorePenalty(candidate, size);
    if (best === null || penalty < best.penalty) { // strict <, so ties keep the LOWEST mask index (0 wins ties naturally since we scan in order)
      best = { mask: m, modules: candidate, penalty };
    }
  }
  return { mask: best.mask, modules: best.modules };
}
```

---

## 8. Public pure API

```js
function encodeToMatrix(text, ecLevel = 'M') {
  if (!['L', 'M', 'Q', 'H'].includes(ecLevel)) throw new Error('invalid ecLevel: ' + ecLevel);
  const bytes = utf8Bytes(text ?? '');
  if (bytes.length === 0) throw new Error('empty input'); // caller (UI, §10) should short-circuit before calling this for empty textarea, but the function itself stays strict
  const version = selectVersion(bytes.length, ecLevel);
  if (version === null) throw new Error(`Input too large for a QR code at EC level ${ecLevel} (exceeds version 40 capacity).`);

  const segmentBits = buildByteModeSegmentBits(bytes, version);
  const dataCodewordCount = getDataCodewordCount(version, ecLevel);
  padToCapacity(segmentBits, dataCodewordCount);
  const dataCodewords = segmentBits.toBytes(); // exactly dataCodewordCount bytes

  const blockPlan = getBlockPlan(version, ecLevel); // §3.4 row
  const blocks = splitIntoBlocks(dataCodewords, blockPlan).map(block => ({
    data: block,
    ec: rsComputeRemainder(block, blockPlan.ecCodewordsPerBlock),
  }));
  const interleaved = interleave(blocks);
  const finalBits = bytesToBits(interleaved).concat(zeros(REMAINDER_BITS[version]));

  const size = 17 + 4 * version;
  const { modules: rawModules, isFunction } = buildFunctionPatterns(size, version); // §6.1-6.5, all non-data modules set + reserved
  placeData(rawModules, isFunction, finalBits, size); // §6.6

  const { mask, modules } = selectBestMask(rawModules, isFunction, size, version, ecLevel); // §7

  return { version, mask, size, modules }; // modules: boolean[][], true = dark
}
```

**Helpers also exposed** (for direct unit-testing per DESIGN.md's
Testability section): `utf8Bytes`, `charCountBits`, `getAlignmentPatternPositions`,
`gfMul`, `rsGeneratorPoly`, `rsComputeRemainder`, `computeFormatBits`,
`computeVersionBits`, `MASK_FNS`, `selectVersion`, `getDataCodewordCount`.
All pure, all listed again in §11's `window.__qr` shape.

---

## 9. Rendering: canvas, PNG, SVG

### 9.1 Canvas rendering

```js
function renderToCanvas(canvas, matrixResult, options) {
  const { size, modules } = matrixResult;
  const { scale = 8, quietZone = 4, fg = '#000000', bg = '#ffffff' } = options;
  const total = size + quietZone * 2;
  canvas.width = total * scale;
  canvas.height = total * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        ctx.fillRect((c + quietZone) * scale, (r + quietZone) * scale, scale, scale);
      }
    }
  }
}
```

Integer `scale` (module px size) keeps every module a crisp, unblurred
square; `imageSmoothingEnabled = false` matters if the canvas is later CSS-
scaled for display (e.g. `max-width: 100%` on narrow screens) — the
*backing* pixel data stays crisp, only CSS-scaled display softens (which is
expected/acceptable; the download still uses full backing resolution).

### 9.2 PNG download

```js
downloadPngBtn.addEventListener('click', () => {
  const url = canvas.toDataURL('image/png');
  triggerDownload(url, `qr-code-v${matrixResult.version}-${ecLevel}.png`);
});
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

### 9.3 SVG generation + download

```js
function toSVGString(matrixResult, options) {
  const { size, modules } = matrixResult;
  const { quietZone = 4, fg = '#000000', bg = '#ffffff' } = options;
  const total = size + quietZone * 2;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) path += `M${c + quietZone},${r + quietZone}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 8}" height="${total * 8}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${bg}"/>` +
    `<path d="${path}" fill="${fg}"/>` +
    `</svg>`;
}

downloadSvgBtn.addEventListener('click', () => {
  const svg = toSVGString(matrixResult, currentOptions());
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `qr-code-v${matrixResult.version}-${ecLevel}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 1000); // release after the click has been processed
});
```

One `<path>` combining every dark module (`M x,y h1 v1 h-1 z` per module) —
compact, one fill color, crisp at any zoom (vector). `shape-rendering:
crispEdges` avoids anti-aliased seams between adjacent module rects in
viewers that render at non-integer zoom.

---

## 10. UI layer: options, debounce, errors, accessibility, OG tags

### 10.1 Controls

- **Input textarea** (`data-testid="qr-input"`): free text/URL, no hard
  length limit in the `<textarea>` itself (capacity is enforced by the
  encoder, not by `maxlength`, since capacity depends on the *selected* EC
  level, not a fixed number).
- **Capacity hint** (`data-testid="capacity-hint"`), updated on every
  re-render: on success, something like `"Version 5 of 40 · Level M"`; on
  capacity-overflow, the hint area is superseded by the error message
  (§10.3) instead — don't show both.
- **EC level `<select>`** (`data-testid="ec-level-select"`): options
  `L`/`M`/`Q`/`H`, default `M`, labelled with a plain-language hint per
  option (e.g. "M — Medium (~15% recovery)").
- **Scale** (`data-testid="scale-input"`): `<input type="number" min="1"
  max="40">`, default e.g. `8` (px per module).
- **Quiet zone** (`data-testid="quiet-zone-input"`): `<input type="number"
  min="0" max="20">`, default `4` (per DESIGN.md/spec recommendation).
- **Foreground/background color** (`data-testid="fg-color-input"` /
  `"bg-color-input"`): `<input type="color">`, defaults `#000000`/`#ffffff`.
- **Contrast warning** (`data-testid="contrast-warning"`): computed via the
  same WCAG relative-luminance/contrast-ratio formulas as
  `color-designer`/`color-converter` (reuse the formulas, re-implement
  locally — single-file rule, no cross-tool import):

```js
function relLuminance(hex) { /* same formula as color-designer §3.5, applied to a hex-parsed {r,g,b} */ }
function contrastRatio(hex1, hex2) { /* same formula */ }
```

  Threshold: if `contrastRatio(fg, bg) < 3`, show the warning text ("Low
  contrast between foreground and background — this code may not scan
  reliably.") in the `contrast-warning` element; otherwise clear it. `3` is
  a deliberately looser bar than WCAG text-contrast guidance (AA text is
  4.5) since QR scanners are more tolerant than human reading — 3:1 is a
  reasonable "this will probably still fail to scan below this" line. Does
  **not** block rendering/download — it's advisory only, the QR still
  renders/downloads at any contrast (worst case: pure white-on-white or
  identical colors, which the encoder still happily renders — just useless
  as a scannable code, and the warning should make that obvious).
- **Canvas** (`data-testid="qr-canvas"`), `aria-label` set dynamically to
  `"QR code for: " + truncated(text, ~60 chars)`.
- **Caption** (`data-testid="qr-caption"`): "Version {v} · Level {ecLevel}".
- **Download buttons** (`data-testid="download-png-btn"` /
  `"download-svg-btn"`), each an icon+label button with `title` +
  `aria-label` per the icon-only-button tooltip convention (these have
  visible text labels too, "Download PNG"/"Download SVG", so a `title` is a
  nice-to-have for consistency but not strictly required since they're not
  icon-only — include it anyway for consistency with the rest of the repo).
  **Disabled** whenever there's no valid matrix to export (empty input or
  capacity error).
- **Error message** (`data-testid="error-message"`, `role="alert"`): shown
  for capacity-overflow; canvas is cleared/hidden and downloads disabled
  while an error is showing.

### 10.2 Debounced live re-render

```js
let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 150);
}
[inputEl, ecLevelEl, scaleEl, quietZoneEl, fgEl, bgEl].forEach(el =>
  el.addEventListener('input', scheduleRender)
);
```

One shared debounce for every control (simplicity — DESIGN.md says
"debounced," doesn't require the debounce to apply only to the textarea).
150ms feels responsive without recomputing on every keystroke of a fast
typist. `doRender()` is the single function that: reads current input +
options, handles empty/oversized (§10.3), otherwise calls
`encodeToMatrix`, renders to canvas, updates caption/capacity-hint/aria-label,
enables downloads, recomputes the contrast warning.

### 10.3 Empty / oversized handling

```js
function doRender() {
  const text = inputEl.value;
  const ecLevel = ecLevelEl.value;
  clearError();
  if (text.trim() === '') {
    clearCanvas();
    disableDownloads();
    captionEl.textContent = '';
    capacityHintEl.textContent = 'Enter text or a URL above to generate a QR code.';
    currentMatrix = null;
    return;
  }
  try {
    currentMatrix = encodeToMatrix(text, ecLevel);
  } catch (err) {
    clearCanvas();
    disableDownloads();
    showError(err.message); // capacity-overflow message straight from encodeToMatrix's thrown Error
    capacityHintEl.textContent = '';
    return;
  }
  renderToCanvas(canvasEl, currentMatrix, currentOptions());
  captionEl.textContent = `Version ${currentMatrix.version} · Level ${ecLevel}`;
  capacityHintEl.textContent = `Version ${currentMatrix.version} of 40 · Level ${ecLevel}`;
  canvasEl.setAttribute('aria-label', `QR code for: ${truncate(text, 60)}`);
  enableDownloads();
  updateContrastWarning();
}
```

Empty input is **not** an error (no red error banner) — just a neutral
empty state, per DESIGN.md item 5's "clear inline message (no broken
render)" covering both cases distinctly: empty → quiet placeholder text,
oversized → `role="alert"` error message.

### 10.4 Accessibility

- Every control is a real labelled `<input>`/`<select>`/`<textarea>`/
  `<button>`; visible `:focus-visible` ring, not stripped.
- Canvas `aria-label` set per §10.1/10.3 (a canvas has no inherent text
  alternative, this is the substitute).
- `error-message` uses `role="alert"` (assertive, appropriate since it's a
  direct response to input the user just typed).
- `contrast-warning` uses `role="status"`/`aria-live="polite"` (advisory,
  non-blocking).
- No essential motion; the live re-render is instant (a redraw), not an
  animation — nothing to gate behind `prefers-reduced-motion`.
- Responsive: `.output-section` canvas wrapper gets `overflow-x: auto;
  max-width: 100%;` and the canvas itself `max-width: 100%; height: auto;`
  (CSS-scales down on narrow screens without horizontal page overflow —
  backing resolution stays full per §9.1). Controls stack in a single
  column under a breakpoint (e.g. `@media (max-width: 600px)`); tap targets
  (`<select>`, number inputs, buttons) sized to ~44px min-height.

### 10.5 Footer + OG placeholders

Paste `tools/include/footer.html` verbatim (sentinels included) at the
bottom of `<body>`, before the module `<script>`. In `<head>`, add the
standard OG block per `docs/conventions.md`:

```html
<meta property="og:title" content="QR Code Generator">
<meta property="og:description" content="Generate a QR code from text or a URL — hand-rolled encoder, no library, download as PNG or SVG.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="claude-tools">
<meta property="og:image" content="preview.png">
<meta name="twitter:card" content="summary_large_image">
```

`preview.png` itself is **not** this worker's job unless asked separately —
note its absence doesn't block anything else; the meta tag can reference it
even before the file exists (matches other tools' pattern of writing the tag
first, adding the actual PNG in a later pass). Also add `tools/index.html`'s
gallery card for this tool if the worker is touching the landing page as
part of this change (check whether a card already exists before adding a
duplicate).

---

## 11. Testability hooks

### 11.1 `data-testid` — full list

- `qr-input` — textarea
- `capacity-hint` — version/capacity hint under the textarea
- `ec-level-select`
- `scale-input`
- `quiet-zone-input`
- `fg-color-input`
- `bg-color-input`
- `contrast-warning`
- `qr-canvas`
- `qr-caption` — "Version N · Level X"
- `download-png-btn`
- `download-svg-btn`
- `error-message`

### 11.2 `window.__qr` namespace

```js
window.__qr = {
  // primary correctness surface (§8):
  encodeToMatrix,
  // encoding internals:
  utf8Bytes,
  charCountBits,
  selectVersion,
  getDataCodewordCount,
  getBlockPlan,
  // geometry:
  getAlignmentPatternPositions,
  // GF(256)/RS:
  gfMul,
  rsGeneratorPoly,
  rsComputeRemainder,
  // BCH:
  computeFormatBits,
  computeVersionBits,
  // masking:
  MASK_FNS,
  scorePenalty,
  // rendering (so tests can generate SVG/PNG output without simulating clicks, in addition to real click-driven download tests):
  renderToCanvas,
  toSVGString,
  // read-only snapshot of the currently-rendered result, or null:
  get currentMatrix() { return currentMatrix ? { ...currentMatrix, modules: currentMatrix.modules.map(r => r.slice()) } : null; },
};
```

Unconditional assignment (inert for normal users, purely additive), same
convention as every other tool's `window.__<tool>` namespace.

### 11.3 Dev-only round-trip decode testing (tester agent's responsibility, noted here for the worker's awareness)

Per DESIGN.md, the **tester** (a separate build-pipeline stage, not this
worker) will add a **dev-only** QR decoder as a devDependency (e.g. `jsqr`
or equivalent — a pure-JS decoder that reads pixel/ImageData and returns
decoded text) used **only** inside `tests/`, never referenced by
`index.html`. The worker's job here is just to make sure `renderToCanvas`
and `toSVGString` are both reachable from `window.__qr` (done, §11.2) so the
tester can render a matrix off-DOM (an offscreen `<canvas>`) and feed its
`ImageData`/`getContext('2d')` pixels straight to the decoder without going
through file downloads.

---

## 12. `package.json`

Doesn't exist yet — create it following the shape every other tool uses
(see `tools/hat-picker/package.json` / `tools/color-designer/package.json`
for the exact template):

```json
{
  "name": "@codercowboy/qr-generator",
  "groupId": "com.codercowboy",
  "version": "0.1.0",
  "description": "Single-file HTML QR code generator: hand-rolled encoder (no library), download as PNG or SVG.",
  "type": "module",
  "license": "MIT",
  "author": "Claude (Anthropic) <noreply@anthropic.com>",
  "contributors": [
    "Jason <jason@onejasonforsale.com> (design / project lead)"
  ],
  "engines": { "node": ">=20" },
  "main": "index.html",
  "files": ["index.html", "README.md", "preview.png"],
  "scripts": {
    "test": "node --test",
    "test:e2e": "playwright test --config=tests/playwright.config.mjs"
  },
  "keywords": ["qr", "qr-code", "generator", "encoder", "barcode", "web-tool"],
  "devDependencies": {
    "@playwright/test": "^1.62.1"
  }
}
```

Leave `devDependencies` at just Playwright — the tester agent adds the
dev-only QR-decoding package (§11.3) when it writes the test suite, not this
worker.

---

## 13. Build checklist (ordered)

1. Scaffold `index.html`'s DOM skeleton (§0) with every `data-testid` from
   §11.1 in place up front, plus the OG meta block (§10.5) and the pasted
   footer (§10.5) — get the non-behavioral shell right first.
2. Implement the bit-buffer helper (`BitWriter`, §2.3) and `utf8Bytes` — no
   dependencies, easy to sanity-check in isolation (e.g. encode a known
   short ASCII string, inspect the bits by hand).
3. Transcribe the three small tables (§3.1, §3.2) verbatim from this plan.
4. Implement `getAlignmentPatternPositions` (§3.3) and **verify it against
   the three spot-check vectors given there** (v2, v7, v32) before moving
   on — do not proceed on faith.
5. Transcribe the big EC/block table (§3.4) from a canonical source (not
   from memory), then **run the self-consistency check script** from §3.4
   over all 160 rows, and confirm the version-1 spot-check row exactly.
   This is the single highest-risk step in the whole plan — do not skip the
   verification.
6. Implement `charCountBits`, `buildByteModeSegmentBits`, `padToCapacity`,
   `selectVersion`, `getDataCodewordCount` (§2). Sanity-check `selectVersion`
   against the two byte-mode capacity spot-checks in §3.4 (V1-L=17 bytes,
   V40-H=1273 bytes: an input of exactly that many bytes should select
   exactly that version at that level, and one byte more should select the
   next version up or, at V40-H, throw).
7. Implement GF(256) tables + `gfMul` + `rsGeneratorPoly` + `rsComputeRemainder`
   (§4). Sanity-check with a tiny known example if convenient (e.g. compute
   EC codewords for a trivial all-zero data block and confirm the result is
   also all zero — a zero polynomial's remainder mod anything is zero,
   cheap smoke test).
8. Implement block splitting + `interleave` + remainder-bit append (§5).
9. Implement matrix geometry: `buildFunctionPatterns` covering finder
   patterns + separators (§6.1), timing (§6.2), alignment (§6.3), dark
   module (§6.4), and format/version-info reservation (§6.5) — all writing
   into the parallel `isFunction` grid. Render a raw matrix (no data, no
   mask) to a canvas and **visually eyeball it** for a version around 7-10
   (has alignment patterns + version info) — the finder/timing/alignment
   pattern shapes should look immediately recognizable as "a QR code
   skeleton" before writing a single line of data-placement code.
10. Implement `placeData` (§6.6) zig-zag. Feed it a simple all-1s bit array
    of the right length and confirm every non-function module gets set,
    with `bitIndex === bits.length` at the end (assert this).
11. Implement the 8 mask formulas (§7.1), `applyMask` (§7.2), all 4 penalty
    rules (§7.3), `computeFormatBits`/`computeVersionBits` (§7.4, verify the
    generator-polynomial constants match exactly what's written above — a
    transposed bit or wrong constant here is invisible until decode-testing
    catches it), and `selectBestMask`/`writeFormatInfo`/`writeVersionInfo`
    (§7.5).
12. Wire up `encodeToMatrix` (§8) end to end. At this point, generate a
    matrix for a short known string (e.g. `"HELLO"`) at level M, render it
    to a canvas, and try scanning it with an actual phone camera or any
    online/offline QR reader as a first manual gut-check before the
    automated round-trip tests exist — this is the fastest way to catch a
    gross ordering/placement bug early, well before the tester agent runs.
13. Implement `renderToCanvas`, `toSVGString`, and the PNG/SVG download
    handlers (§9).
14. Wire the UI layer: controls, debounced `scheduleRender`/`doRender`
    (§10.2), empty/oversized handling (§10.3), contrast warning, canvas
    `aria-label`, capacity hint, caption (§10.1/10.4).
15. Responsive/mobile CSS pass (§10.4): narrow-viewport check, no horizontal
    overflow, controls stack, tap targets ~44px.
16. Assign `window.__qr` (§11.2).
17. Manual smoke test across EC levels (L/M/Q/H), a plain short string, a
    URL, a Unicode/emoji string, an empty textarea, and a deliberately huge
    paste (paste enough text to exceed V40-H's ~1273-byte capacity) to
    confirm the error path renders cleanly with downloads disabled.
18. Create `tools/qr-generator/package.json` (§12).
19. Write `tools/qr-generator/README.md`: what it is, how to open it, a
    short usage walkthrough (paste text → adjust EC level/colors/quiet zone
    → download), and a one-line note that the encoder is hand-rolled (no
    library) with a pointer to `DESIGN.md`/`PLAN.md` for anyone curious
    about the algorithm, ending in the standard README footer
    (`tools/include/readme-footer.md`).
20. Final pass against DESIGN.md's Testability/Accessibility sections
    line-by-line: every `data-testid` present, `window.__qr` complete,
    canvas `aria-label` present and updates live, contrast warning fires,
    empty/oversized both handled distinctly and cleanly, responsive at a
    mobile viewport width.

---

## Open decisions the worker should just make (not worth blocking on)

- Exact color palette/typography for the chrome around the QR output —
  DESIGN.md has no visual-identity requirement beyond "good contrast,
  legible controls."
- Exact debounce delay (plan suggests 150ms) — tune to taste, stay under
  ~300ms so it still reads as "live."
- Exact default `scale` value (plan suggests 8px/module) and its input's
  min/max bounds — any reasonable range that keeps small-version codes
  legible and large-version (v40) codes from producing an absurdly huge
  canvas is fine.
- Whether the EC-level `<select>` options show a numeric recovery
  percentage in their label (L≈7%, M≈15%, Q≈25%, H≈30%) — a nice touch,
  not required by DESIGN.md.
- Rule 3 penalty's exact out-of-bounds convention (noted in §7.3) — the
  round-trip decode tests are the real correctness backstop for the encoded
  *data*; penalty-score edge-case exactness only affects which of two
  otherwise-valid masks gets picked, never whether the code decodes.
