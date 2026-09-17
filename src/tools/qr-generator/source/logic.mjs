// ===== BEGIN PURE-LOGIC (unit-tested by tests/unit/*.test.mjs via
// tests/unit/extract-inline-module.mjs — see docs/conventions.md) =====

// ---- 1a. Total codewords per version (data+EC combined; version-only, not
// EC-level-dependent) ----
const TOTAL_CODEWORDS = [
  0, // unused index 0 (versions are 1-based)
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

// ---- 1b. Remainder bits per version: after interleaving, this many extra
// 0 bits are appended before module placement (some versions' bitstream
// doesn't exactly fill a whole number of modules) ----
const REMAINDER_BITS = [
  0,
  0, 7, 7, 7, 7, 7, 0, 0, 0, 0,
  0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 3, 3, 3,
  3, 3, 3, 3, 0, 0, 0, 0, 0, 0,
];

// ---- 1c. EC codewords-per-block and block counts, per version x EC level.
// Source: Nayuki's QR-Code-generator (MIT) ECC_CODEWORDS_PER_BLOCK /
// NUM_ERROR_CORRECTION_BLOCKS tables. Verified (see PLAN.md worker notes):
// self-consistency across all 160 (version, level) rows against
// TOTAL_CODEWORDS above, the version-1 spot-check row for all 4 levels, a
// known thonky.com v5-Q row (18/2x15+2x16), and the two well-known
// max-byte-capacity spot checks (V1-L=17 bytes, V40-H=1273 bytes) — all
// matched exactly.
const ECC_CODEWORDS_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const NUM_EC_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

// Derives the block-splitting plan (group1 = "short" blocks, group2 =
// "long" blocks, each with 1 extra data codeword) for a version+EC level.
// This is the standard construction: total data codewords D split across
// numBlocks blocks as evenly as possible; if D isn't a multiple of
// numBlocks, the remainder blocks get one extra codeword and are placed
// last (group 2).
function getBlockPlan(version, ecLevel) {
  const ecCodewordsPerBlock = ECC_CODEWORDS_PER_BLOCK[ecLevel][version];
  const numBlocks = NUM_EC_BLOCKS[ecLevel][version];
  const totalDataCodewords = TOTAL_CODEWORDS[version] - ecCodewordsPerBlock * numBlocks;
  const shortLen = Math.floor(totalDataCodewords / numBlocks);
  const numLongBlocks = totalDataCodewords % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;
  return {
    totalDataCodewords,
    ecCodewordsPerBlock,
    numBlocksGroup1: numShortBlocks,
    dataCodewordsGroup1: shortLen,
    numBlocksGroup2: numLongBlocks,
    dataCodewordsGroup2: numLongBlocks > 0 ? shortLen + 1 : 0,
  };
}
function getDataCodewordCount(version, ecLevel) {
  return getBlockPlan(version, ecLevel).totalDataCodewords;
}

// ---- 1d. Alignment pattern center coordinates, computed algorithmically
// (avoids hand-transcribing the ~39-row ISO Annex E table). Verified
// against known-good vectors: v2 -> [6,18], v7 -> [6,22,38],
// v23 -> [6,30,54,78,102], v32 -> [6,34,60,86,112,138] (the special-cased
// step=26 version) — all confirmed against thonky.com's published table and
// round-trip decode.
function getAlignmentPatternPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = (version === 32) ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const positions = [6];
  const last = (4 * version) + 10; // = size - 7
  for (let i = numAlign - 2; i >= 0; i--) positions.push(last - i * step);
  return positions;
}

// ---- 2. UTF-8 + byte-mode segment + padding ----

function utf8Bytes(str) {
  return new TextEncoder().encode(str); // handles all Unicode incl. astral/emoji
}

// Byte-mode character-count-indicator length (ISO/IEC 18004 Table 3): 8
// bits for v1-9, 16 bits for v10-40 (byte mode doesn't change again at v27
// unlike numeric/alphanumeric/kanji).
function charCountBits(version) {
  return version <= 9 ? 8 : 16;
}

// Minimal MSB-first bit buffer.
class BitWriter {
  constructor() { this.bits = []; }
  get bitLength() { return this.bits.length; }
  writeBits(value, n) {
    for (let i = n - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  toBytes() {
    const out = new Uint8Array(this.bits.length / 8);
    for (let i = 0; i < out.length; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | this.bits[i * 8 + j];
      out[i] = b;
    }
    return out;
  }
  toBitArray() { return this.bits.slice(); }
}

function buildByteModeSegmentBits(bytes, version) {
  const bits = new BitWriter();
  bits.writeBits(0b0100, 4); // mode indicator: byte mode
  bits.writeBits(bytes.length, charCountBits(version));
  for (const b of bytes) bits.writeBits(b, 8);
  return bits;
}

// Appends terminator (up to 4 zero bits), pads to a byte boundary, then
// pads with alternating 0xEC/0x11 codewords until the segment exactly fills
// the version's data-codeword capacity.
function padToCapacity(bits, dataCodewordCount) {
  const capacityBits = dataCodewordCount * 8;
  if (bits.bitLength > capacityBits) throw new Error('segment exceeds capacity');
  const term = Math.min(4, capacityBits - bits.bitLength);
  bits.writeBits(0, term);
  const padBits = (8 - (bits.bitLength % 8)) % 8;
  bits.writeBits(0, padBits);
  let padByte = 0xEC;
  while (bits.bitLength < capacityBits) {
    bits.writeBits(padByte, 8);
    padByte = padByte === 0xEC ? 0x11 : 0xEC;
  }
  return bits;
}

// Picks the smallest version (1..40) whose data-codeword capacity fits the
// byte-mode segment at the given EC level. Terminator/padding only ever
// consume slack up to the byte-aligned capacity, so this bit-length check
// alone (without simulating terminator/padding) is sufficient.
function selectVersion(byteLength, ecLevel) {
  for (let version = 1; version <= 40; version++) {
    const dataCodewordCount = getDataCodewordCount(version, ecLevel);
    const headerBits = 4 + charCountBits(version);
    const neededBits = headerBits + byteLength * 8;
    if (neededBits <= dataCodewordCount * 8) return version;
  }
  return null; // exceeds V40 capacity at this EC level
}

// ---- 3. Reed-Solomon error correction over GF(256) ----
// Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), primitive element 2.

const GF_EXP = new Uint8Array(512); // double-length so gfMul can index without a modulo
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

const genPolyCache = new Map();
function rsGeneratorPoly(n) {
  if (genPolyCache.has(n)) return genPolyCache.get(n);
  let poly = [1]; // coefficients, highest degree first
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  genPolyCache.set(n, poly);
  return poly;
}

// Polynomial long division via LFSR: returns the ecCount-byte remainder,
// i.e. the error-correction codewords for one data block.
function rsComputeRemainder(dataCodewords, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const result = new Uint8Array(dataCodewords.length + ecCount);
  result.set(dataCodewords);
  for (let i = 0; i < dataCodewords.length; i++) {
    const coef = result[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) result[i + j] ^= gfMul(gen[j], coef);
  }
  return result.slice(dataCodewords.length);
}

// ---- 4. Block splitting + interleaving ----

function splitIntoBlocks(dataCodewords, plan) {
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < plan.numBlocksGroup1; i++) {
    blocks.push(dataCodewords.slice(offset, offset + plan.dataCodewordsGroup1));
    offset += plan.dataCodewordsGroup1;
  }
  for (let i = 0; i < plan.numBlocksGroup2; i++) {
    blocks.push(dataCodewords.slice(offset, offset + plan.dataCodewordsGroup2));
    offset += plan.dataCodewordsGroup2;
  }
  return blocks;
}

// Interleaves data codewords by index across blocks, then EC codewords by
// index across blocks (blocks that run out simply stop contributing).
function interleave(blocks) {
  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  const maxEc = Math.max(...blocks.map((b) => b.ec.length));
  for (let i = 0; i < maxEc; i++) {
    for (const b of blocks) if (i < b.ec.length) out.push(b.ec[i]);
  }
  return out;
}

function bytesToBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}

// ---- 5. Matrix construction ----

// Builds every function pattern (finders + separators, timing, alignment,
// dark module) and reserves the format-info/version-info areas, tracked in
// a parallel isFunction grid so data placement (§6) knows what to skip.
function buildFunctionPatterns(size, version) {
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  function setF(r, c, dark) {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  }

  // Finder pattern (7x7, dark border ring + dark 3x3 center) plus its
  // 1-module light separator ring. Looping dr/dc over -1..7 and clipping
  // out-of-bounds cells naturally produces the correct 8x8 footprint at
  // every one of the three matrix corners (the off-matrix side of each
  // corner's separator ring is simply clipped away).
  function placeFinder(topR, topC) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr, c = topC + dc;
        let dark;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          dark = (dr === 0 || dr === 6 || dc === 0 || dc === 6) || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        } else {
          dark = false; // separator: always light
        }
        setF(r, c, dark);
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns: row 6 / column 6, alternating dark/light starting dark,
  // spanning the gap between the finder+separator footprints.
  for (let i = 8; i <= size - 9; i++) {
    const dark = i % 2 === 0;
    setF(6, i, dark);
    setF(i, 6, dark);
  }

  // Alignment patterns: 5x5 (dark ring at distance 2, light ring at
  // distance 1, dark center), skipping any center that overlaps a finder's
  // 8x8 footprint. Placed after timing so alignment correctly overrides the
  // timing track where the two overlap (matches the spec).
  const aligns = getAlignmentPatternPositions(version);
  for (const row of aligns) {
    for (const col of aligns) {
      if (row <= 7 && col <= 7) continue; // top-left finder
      if (row <= 7 && col >= size - 8) continue; // top-right finder
      if (row >= size - 8 && col <= 7) continue; // bottom-left finder
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const d = Math.max(Math.abs(dr), Math.abs(dc));
          setF(row + dr, col + dc, d !== 1);
        }
      }
    }
  }

  // Dark module: always dark, fixed position, independent of mask/format.
  setF(4 * version + 9, 8, true);

  // Reserve format-info areas (15 bits, written twice) — value doesn't
  // matter yet, just excluded from data placement; real bits are written
  // per-candidate-mask in writeFormatInfo().
  for (let i = 0; i <= 5; i++) setF(8, i, false);
  setF(8, 7, false);
  setF(8, 8, false);
  setF(7, 8, false);
  for (let i = 0; i <= 5; i++) setF(i, 8, false);
  for (let i = size - 8; i <= size - 1; i++) setF(8, i, false);
  for (let i = size - 7; i <= size - 1; i++) setF(i, 8, false);

  // Reserve version-info areas (18 bits, two 3x6 blocks), versions >= 7 only.
  if (version >= 7) {
    for (let r = size - 11; r <= size - 9; r++) for (let c = 0; c <= 5; c++) setF(r, c, false);
    for (let r = 0; r <= 5; r++) for (let c = size - 11; c <= size - 9; c++) setF(r, c, false);
  }

  return { modules, isFunction };
}

// Places the final bitstream into every non-function module, walking the
// standard upward/downward 2-column zig-zag from the bottom-right corner,
// skipping the timing column (6) entirely.
function placeData(modules, isFunction, bits, size) {
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (isFunction[row][col]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
        modules[row][col] = !!bit;
        bitIndex++;
      }
    }
    upward = !upward;
  }
  return bitIndex;
}

// ---- 6. Masking ----

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

function applyMask(rawModules, isFunction, maskIndex, size) {
  const maskFn = MASK_FNS[maskIndex];
  const out = rawModules.map((row) => row.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFunction[r][c]) continue;
      if (maskFn(r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}

// 4 penalty rules (ISO/IEC 18004 §7.8.3). Lower total is better.
function scorePenalty(modules, size) {
  let penalty = 0;

  // Rule 1: runs of 5+ same-color modules, per row then per column.
  function runPenalty(getVal) {
    let total = 0;
    for (let i = 0; i < size; i++) {
      let runLen = 1;
      let prev = getVal(i, 0);
      for (let j = 1; j < size; j++) {
        const v = getVal(i, j);
        if (v === prev) {
          runLen++;
        } else {
          if (runLen >= 5) total += 3 + (runLen - 5);
          runLen = 1;
          prev = v;
        }
      }
      if (runLen >= 5) total += 3 + (runLen - 5);
    }
    return total;
  }
  penalty += runPenalty((i, j) => modules[i][j]); // rows
  penalty += runPenalty((i, j) => modules[j][i]); // columns

  // Rule 2: every 2x2 block of same-color modules (overlapping blocks each
  // count separately).
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) penalty += 3;
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns (1011101) with 4 light modules
  // on one side (0000 1011101 or 1011101 0000), scanned as an 11-wide
  // sliding window per row/column. Out-of-bounds treated as light.
  const patternDarkFirst = [true, false, true, true, true, false, true, false, false, false, false];
  const patternLightFirst = [false, false, false, false, true, false, true, true, true, false, true];
  function getRow(r, c) { return c < 0 || c >= size ? false : modules[r][c]; }
  function getCol(c, r) { return r < 0 || r >= size ? false : modules[r][c]; }
  function matches(getFn, fixed, start, pattern) {
    for (let k = 0; k < 11; k++) if (getFn(fixed, start + k) !== pattern[k]) return false;
    return true;
  }
  for (let r = 0; r < size; r++) {
    for (let start = -4; start <= size - 7; start++) {
      if (matches(getRow, r, start, patternDarkFirst)) penalty += 40;
      if (matches(getRow, r, start, patternLightFirst)) penalty += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let start = -4; start <= size - 7; start++) {
      if (matches(getCol, c, start, patternDarkFirst)) penalty += 40;
      if (matches(getCol, c, start, patternLightFirst)) penalty += 40;
    }
  }

  // Rule 4: proportion of dark modules, penalized the further it strays
  // from 50%.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  const prevMultipleOf5 = Math.floor(percent / 5) * 5;
  const a = Math.abs(prevMultipleOf5 - 50) / 5;
  const b = Math.abs(prevMultipleOf5 + 5 - 50) / 5;
  penalty += Math.min(a, b) * 10;

  return penalty;
}

// ---- 7. Format info / version info (BCH codes) ----
// Both verified byte-for-byte against the published ISO/IEC 18004 Annex C/D
// reference tables (all 32 format strings, all 34 version strings, v7-40).

const EC_LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }; // fixed spec mapping, not alphabetical

function computeFormatBits(ecLevel, maskIndex) {
  const data = (EC_LEVEL_BITS[ecLevel] << 3) | maskIndex; // 5 bits
  let rem = data << 10;
  const GEN = 0b10100110111; // degree-10 generator polynomial
  for (let i = 4; i >= 0; i--) if ((rem >> (10 + i)) & 1) rem ^= GEN << i;
  const bch = (data << 10) | (rem & 0x3ff);
  return bch ^ 0b101010000010010; // fixed XOR mask
}

function computeVersionBits(version) {
  let rem = version << 12;
  const GEN = 0b1111100100101; // degree-12 generator polynomial
  for (let i = 5; i >= 0; i--) if ((rem >> (12 + i)) & 1) rem ^= GEN << i;
  return (version << 12) | (rem & 0xfff);
}

// Writes the 15-bit format info twice, in the two standard L-shaped
// locations flanking the finders.
function writeFormatInfo(modules, ecLevel, maskIndex, size) {
  const bits15 = computeFormatBits(ecLevel, maskIndex);
  const bitAt = (k) => (bits15 >> k) & 1; // k: 14 (MSB) down to 0

  // Copy A: row 8 cols 0-5, then (8,7), (8,8), (7,8), then col 8 rows 5-0.
  const copyACoords = [];
  for (let c = 0; c <= 5; c++) copyACoords.push([8, c]);
  copyACoords.push([8, 7]);
  copyACoords.push([8, 8]);
  copyACoords.push([7, 8]);
  for (let r = 5; r >= 0; r--) copyACoords.push([r, 8]);
  for (let idx = 0; idx < 15; idx++) {
    const [r, c] = copyACoords[idx];
    modules[r][c] = !!bitAt(14 - idx);
  }

  // Copy B: bits 14->7 along row 8, cols size-1 down to size-8 (right to
  // left); bits 6->0 down column 8, rows size-7 to size-1 (top to bottom).
  let idx2 = 0;
  for (let c = size - 1; c >= size - 8; c--) {
    modules[8][c] = !!bitAt(14 - idx2);
    idx2++;
  }
  for (let r = size - 7; r <= size - 1; r++) {
    modules[r][8] = !!bitAt(14 - idx2);
    idx2++;
  }
}

// Writes the 18-bit version info into both reserved 3x6 blocks
// (versions >= 7 only). Bit k (0=LSB..17=MSB) maps to (row=k%3, col=k/3)
// in the bottom-left block, and the transpose in the top-right block.
function writeVersionInfo(modules, version, size) {
  if (version < 7) return;
  const bits18 = computeVersionBits(version);
  const bitAt = (k) => (bits18 >> k) & 1;
  for (let k = 0; k < 18; k++) {
    const row = k % 3;
    const col = Math.floor(k / 3);
    modules[size - 11 + row][col] = !!bitAt(k);
  }
  for (let k = 0; k < 18; k++) {
    const row = Math.floor(k / 3);
    const col = k % 3;
    modules[row][size - 11 + col] = !!bitAt(k);
  }
}

// Tries all 8 masks (writing format+version info into each candidate before
// scoring, per spec), returns the lowest-penalty one. Ties keep the lowest
// mask index (scan order + strict `<`).
function selectBestMask(rawModules, isFunction, size, version, ecLevel) {
  let best = null;
  for (let m = 0; m < 8; m++) {
    const candidate = applyMask(rawModules, isFunction, m, size);
    writeFormatInfo(candidate, ecLevel, m, size);
    if (version >= 7) writeVersionInfo(candidate, version, size);
    const penalty = scorePenalty(candidate, size);
    if (best === null || penalty < best.penalty) best = { mask: m, modules: candidate, penalty };
  }
  return { mask: best.mask, modules: best.modules };
}

// ---- 8. Public pure API ----
//
// encodeToMatrix(text, ecLevel) -> { version, mask, size, modules }
// modules: boolean[][], true = dark. Pure — no DOM access, safe to call
// from tests. Auto-picks the smallest version that fits; throws a clear
// Error for empty input or input exceeding V40 capacity.
function encodeToMatrix(text, ecLevel = 'H') {
  if (!['L', 'M', 'Q', 'H'].includes(ecLevel)) throw new Error('invalid ecLevel: ' + ecLevel);
  const bytes = utf8Bytes(text ?? '');
  if (bytes.length === 0) throw new Error('empty input');
  const version = selectVersion(bytes.length, ecLevel);
  if (version === null) {
    throw new Error(`Input too large for a QR code at EC level ${ecLevel} (exceeds version 40 capacity).`);
  }

  const segmentBits = buildByteModeSegmentBits(bytes, version);
  const dataCodewordCount = getDataCodewordCount(version, ecLevel);
  padToCapacity(segmentBits, dataCodewordCount);
  const dataCodewords = segmentBits.toBytes(); // exactly dataCodewordCount bytes

  const blockPlan = getBlockPlan(version, ecLevel);
  const blocks = splitIntoBlocks(dataCodewords, blockPlan).map((block) => ({
    data: block,
    ec: rsComputeRemainder(block, blockPlan.ecCodewordsPerBlock),
  }));
  const interleaved = interleave(blocks);
  const finalBits = bytesToBits(interleaved).concat(new Array(REMAINDER_BITS[version]).fill(0));

  const size = 17 + 4 * version;
  const { modules: rawModules, isFunction } = buildFunctionPatterns(size, version);
  const consumed = placeData(rawModules, isFunction, finalBits, size);
  if (consumed !== finalBits.length) {
    // Structural invariant — should never happen if the tables above are
    // correct; surfaced loudly rather than silently producing a bad matrix.
    throw new Error(`internal error: placed ${consumed} bits, expected ${finalBits.length}`);
  }

  const { mask, modules } = selectBestMask(rawModules, isFunction, size, version, ecLevel);
  return { version, mask, size, modules };
}

export {
  encodeToMatrix,
  utf8Bytes,
  charCountBits,
  selectVersion,
  getDataCodewordCount,
  getBlockPlan,
  getAlignmentPatternPositions,
  buildByteModeSegmentBits,
  padToCapacity,
  BitWriter,
  gfMul,
  rsGeneratorPoly,
  rsComputeRemainder,
  splitIntoBlocks,
  interleave,
  bytesToBits,
  buildFunctionPatterns,
  placeData,
  applyMask,
  computeFormatBits,
  computeVersionBits,
  writeFormatInfo,
  writeVersionInfo,
  selectBestMask,
  MASK_FNS,
  scorePenalty,
  TOTAL_CODEWORDS,
  REMAINDER_BITS,
  ECC_CODEWORDS_PER_BLOCK,
  NUM_EC_BLOCKS,
};
// ===== END PURE-LOGIC =====
