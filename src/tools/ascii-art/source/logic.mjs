
  // =====================================================================
  // ascii-art — pure logic (DOM-free). Unit-tested directly by
  // tests/unit/*.test.mjs and inlined into the shipped app by the build.
  // NO document/window/localStorage here — every canvas / getImageData /
  // FileReader concern lives in app.mjs. This module only transforms a
  // downsampled pixel grid into text art (ASCII / half-block / braille) and
  // serializes it (plain text / HTML / ANSI).
  //
  // Grid contract: { width, height, data } where data holds RGBA bytes,
  // length = width*height*4 — the same shape as a canvas ImageData.
  // A "cell" is { ch, fg, bg } where fg/bg are { r, g, b } or null.
  // =====================================================================

  // ---- Character ramps (each ordered DARK -> LIGHT: ramp[0] = darkest) ----
  const RAMPS = {
    standard: '@%#*+=-:. ',
    detailed: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
    blocks: '█▓▒░ ',            // full / dark / medium / light shade / space
    simple: '#+-. ',
    binary: '# ',
  };
  const DEFAULT_RAMP = RAMPS.standard;

  // ---- Braille (2 wide x 4 tall dots per glyph) --------------------------
  // Unicode braille block base; a glyph = BRAILLE_BASE + OR of raised-dot bits.
  // Dot numbering / bit values (standard braille):
  //     1(0x01) 4(0x08)
  //     2(0x02) 5(0x10)
  //     3(0x04) 6(0x20)
  //     7(0x40) 8(0x80)
  // BRAILLE_BITS[col][row] gives the bit for a dot at (col in 0..1, row in 0..3).
  const BRAILLE_BASE = 0x2800;
  const BRAILLE_BITS = [
    [0x01, 0x02, 0x04, 0x40], // col 0: dots 1,2,3,7
    [0x08, 0x10, 0x20, 0x80], // col 1: dots 4,5,6,8
  ];

  const CHAR_HALF_BLOCK = '▀'; // ▀ upper half block

  const WIDTH_MIN = 8;
  const WIDTH_MAX = 400;

  const MODES = { ascii: 'ascii', halfblock: 'halfblock', braille: 'braille' };

  const DEFAULTS = {
    mode: 'ascii',
    color: false,
    ansiDepth: '256',      // '256' | 'truecolor'
    width: 100,            // output width in characters
    ramp: DEFAULT_RAMP,
    invert: false,
    brightness: 0,         // -100..100 (added, scaled to +/-255)
    contrast: 0,           // -100..100 (scale about 128; +100 => x2)
    gamma: 1,              // 0.1..3
    threshold: 128,        // braille dot on/off, 0..255
    dither: 'none',        // 'none' | 'bayer' | 'floyd'
    charAspect: 2,         // font cell height/width (~2:1)
  };

  // ---- Small numeric helpers ---------------------------------------------
  function clampPlain(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }
  function clamp255(n) { return n < 0 ? 0 : n > 255 ? 255 : n; }

  function pixelAt(grid, x, y) {
    const w = grid.width, h = grid.height;
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    const i = (cy * w + cx) * 4;
    const d = grid.data;
    return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
  }

  // Rec. 601 luma (0..255). Simple, fast, good enough for brightness ramps.
  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // ---- Level adjustment: brightness -> contrast -> gamma -> clamp ---------
  function adjustLevel(v, opts = {}) {
    const brightness = Number(opts.brightness) || 0;   // -100..100
    const contrast = Number(opts.contrast) || 0;       // -100..100
    const gamma = Number.isFinite(opts.gamma) && opts.gamma > 0 ? opts.gamma : 1;

    let x = v + (brightness / 100) * 255;
    const cf = (contrast / 100) + 1;                   // 0..2, 1 = neutral
    x = (x - 128) * cf + 128;
    x = clamp255(x);
    if (gamma !== 1) x = 255 * Math.pow(x / 255, 1 / gamma);
    return clamp255(x);
  }

  // Adjusted, inverted, normalized brightness in [0,1] (0 = dark, 1 = light).
  function normLevel(v, opts = {}) {
    let t = adjustLevel(v, opts) / 255;
    if (opts.invert) t = 1 - t;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  // ---- Ramp mapping ------------------------------------------------------
  function clampRamp(str) {
    const s = String(str == null ? '' : str);
    return s.length > 0 ? s : DEFAULT_RAMP;
  }

  // t in [0,1] -> ramp char. ramp[0] is darkest (t=0), ramp[last] lightest (t=1).
  function charForLevel(t, ramp) {
    const r = clampRamp(ramp);
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    const idx = Math.round(tt * (r.length - 1));
    return r[idx];
  }

  // ---- ASCII cells -------------------------------------------------------
  function toAsciiCells(grid, opts = {}) {
    const ramp = clampRamp(opts.ramp || DEFAULT_RAMP);
    const color = !!opts.color;
    const rows = [];
    for (let y = 0; y < grid.height; y++) {
      const row = [];
      for (let x = 0; x < grid.width; x++) {
        const p = pixelAt(grid, x, y);
        const t = normLevel(luminance(p.r, p.g, p.b), opts);
        row.push({ ch: charForLevel(t, ramp), fg: color ? { r: p.r, g: p.g, b: p.b } : null, bg: null });
      }
      rows.push(row);
    }
    return { width: grid.width, rows };
  }

  // ---- Half-block cells (▀): each glyph = 2 vertically stacked pixels -----
  // Upper half painted with fg (top pixel), lower half is the cell bg
  // (bottom pixel). Always colored — that's the whole point of the mode.
  function toHalfBlockCells(grid, opts = {}) {
    const rows = [];
    for (let y = 0; y < grid.height; y += 2) {
      const row = [];
      for (let x = 0; x < grid.width; x++) {
        const top = pixelAt(grid, x, y);
        const bottom = (y + 1 < grid.height) ? pixelAt(grid, x, y + 1) : top;
        row.push({
          ch: CHAR_HALF_BLOCK,
          fg: { r: top.r, g: top.g, b: top.b },
          bg: { r: bottom.r, g: bottom.g, b: bottom.b },
        });
      }
      rows.push(row);
    }
    return { width: grid.width, rows };
  }

  // ---- Braille cells (2x4 dots): high-resolution monochrome/colored -------
  // packBraille(bits) — bits is a 2x4 array (bits[col][row], col 0..1, row 0..3)
  // of booleans; returns the braille glyph string.
  function packBraille(bits) {
    let code = BRAILLE_BASE;
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 4; row++) {
        if (bits[col] && bits[col][row]) code |= BRAILLE_BITS[col][row];
      }
    }
    return String.fromCharCode(code);
  }

  // 4x4 Bayer ordered-dither matrix, normalized thresholds in 0..255.
  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ].map((r) => r.map((v) => (v + 0.5) * (255 / 16)));

  // Decide a full boolean "ink" map for the grid, honoring the dither mode.
  // ink = dark pixel is on (a dot), unless inverted.
  function inkMap(grid, opts = {}) {
    const w = grid.width, h = grid.height;
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 128;
    const dither = opts.dither || 'none';
    const ink = new Uint8Array(w * h);

    if (dither === 'floyd') {
      // Floyd–Steinberg on the adjusted luma; error diffused on a copy.
      const buf = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = pixelAt(grid, x, y);
          buf[y * w + x] = adjustLevel(luminance(p.r, p.g, p.b), opts);
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const old = buf[i];
          const on = old < 128 ? 255 : 0;         // quantize to black/white
          const newV = 255 - on;                   // 255=white kept, 0=black kept
          const err = old - newV;
          const lit = newV < 128;                  // dark => dot
          ink[i] = (lit !== !!opts.invert) ? 1 : 0;
          if (x + 1 < w) buf[i + 1] += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0) buf[i + w - 1] += err * 3 / 16;
            buf[i + w] += err * 5 / 16;
            if (x + 1 < w) buf[i + w + 1] += err * 1 / 16;
          }
        }
      }
      return { ink, w, h };
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = pixelAt(grid, x, y);
        const v = adjustLevel(luminance(p.r, p.g, p.b), opts);
        const th = dither === 'bayer' ? BAYER4[y & 3][x & 3] : threshold;
        let lit = v < th;                          // dark pixel => dot
        if (opts.invert) lit = !lit;
        ink[y * w + x] = lit ? 1 : 0;
      }
    }
    return { ink, w, h };
  }

  function toBrailleCells(grid, opts = {}) {
    const color = !!opts.color;
    const { ink, w, h } = inkMap(grid, opts);
    const rows = [];
    for (let y = 0; y < h; y += 4) {
      const row = [];
      for (let x = 0; x < w; x += 2) {
        const bits = [[false, false, false, false], [false, false, false, false]];
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let col = 0; col < 2; col++) {
          for (let r = 0; r < 4; r++) {
            const px = x + col, py = y + r;
            if (px >= w || py >= h) continue;
            if (ink[py * w + px]) {
              bits[col][r] = true;
              const p = pixelAt(grid, px, py);
              sr += p.r; sg += p.g; sb += p.b; n++;
            }
          }
        }
        let fg = null;
        if (color) {
          if (n > 0) fg = { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n) };
          else { const p = pixelAt(grid, x, y); fg = { r: p.r, g: p.g, b: p.b }; }
        }
        row.push({ ch: packBraille(bits), fg, bg: null });
      }
      rows.push(row);
    }
    return { width: Math.ceil(w / 2), rows };
  }

  // ---- Dispatch ----------------------------------------------------------
  function renderCells(grid, opts = {}) {
    switch (opts.mode) {
      case 'halfblock': return toHalfBlockCells(grid, opts);
      case 'braille': return toBrailleCells(grid, opts);
      case 'ascii':
      default: return toAsciiCells(grid, opts);
    }
  }

  // ---- Plain-text convenience (used by the self-check) -------------------
  function toAscii(grid, opts = {}) {
    return cellsToText(toAsciiCells(grid, opts).rows);
  }
  function toBraille(grid, opts = {}) {
    return cellsToText(toBrailleCells(grid, opts).rows);
  }

  // ---- Serializers -------------------------------------------------------
  function cellsToText(rows) {
    return rows.map((row) => row.map((c) => c.ch).join('')).join('\n');
  }

  function sameColor(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.r === b.r && a.g === b.g && a.b === b.b;
  }
  function hex2(n) { return clamp255(Math.round(n)).toString(16).padStart(2, '0'); }
  function rgbHex(c) { return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`; }

  function escapeHtmlRun(s) {
    return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
  }

  // Coalesced inline-styled spans inside a <pre>. Consecutive cells sharing
  // fg+bg fold into one span to keep the output compact.
  function cellsToHtml(rows, opts = {}) {
    const bg = opts.background || '#000000';
    const fgDefault = opts.foreground || '#ffffff';
    const fontSize = opts.fontSize || 10;
    let inner = '';
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      let run = '';
      let curFg = undefined, curBg = undefined;
      const flush = () => {
        if (run === '') return;
        const styles = [];
        if (curFg) styles.push(`color:${rgbHex(curFg)}`);
        if (curBg) styles.push(`background:${rgbHex(curBg)}`);
        inner += styles.length ? `<span style="${styles.join(';')}">${escapeHtmlRun(run)}</span>` : escapeHtmlRun(run);
        run = '';
      };
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (curFg === undefined || !sameColor(c.fg, curFg) || !sameColor(c.bg, curBg)) {
          flush();
          curFg = c.fg; curBg = c.bg;
        }
        run += c.ch;
      }
      flush();
      inner += y < rows.length - 1 ? '\n' : '';
    }
    return `<pre style="margin:0;font:${fontSize}px/1 ui-monospace,Menlo,Consolas,monospace;`
      + `color:${fgDefault};background:${bg};padding:8px;white-space:pre;">${inner}</pre>`;
  }

  function htmlDocument(rows, opts = {}) {
    const pre = cellsToHtml(rows, opts);
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
      + '<title>ASCII art</title>\n</head>\n<body style="margin:0;background:'
      + (opts.background || '#000000') + ';">\n' + pre + '\n</body>\n</html>\n';
  }

  // ---- ANSI --------------------------------------------------------------
  // Map an 8-bit-per-channel color to the xterm 256-color cube (16..231) or
  // the 24-step grayscale ramp (232..255) when it's near-neutral.
  function rgbToAnsi256(r, g, b) {
    if (r === g && g === b) {
      if (r < 8) return 16;
      if (r > 248) return 231;
      return Math.round(((r - 8) / 247) * 24) + 232;
    }
    const q = (v) => Math.round(v / 51); // 0..5 across the 6x6x6 cube
    return 16 + 36 * q(r) + 6 * q(g) + q(b);
  }

  const ANSI_RESET = '[0m';
  function ansiFg(c, depth) {
    return depth === 'truecolor'
      ? `[38;2;${c.r};${c.g};${c.b}m`
      : `[38;5;${rgbToAnsi256(c.r, c.g, c.b)}m`;
  }
  function ansiBg(c, depth) {
    return depth === 'truecolor'
      ? `[48;2;${c.r};${c.g};${c.b}m`
      : `[48;5;${rgbToAnsi256(c.r, c.g, c.b)}m`;
  }

  // Emit ANSI escapes. Reset at the end of every line so trailing color never
  // bleeds. Cells with no fg/bg emit the bare character.
  function cellsToAnsi(rows, opts = {}) {
    const depth = opts.ansiDepth === 'truecolor' ? 'truecolor' : '256';
    const out = [];
    for (const row of rows) {
      let line = '';
      let curFg = null, curBg = null;
      for (const c of row) {
        let seq = '';
        if (!sameColor(c.fg, curFg)) { curFg = c.fg; if (c.fg) seq += ansiFg(c.fg, depth); }
        if (!sameColor(c.bg, curBg)) { curBg = c.bg; if (c.bg) seq += ansiBg(c.bg, depth); }
        line += seq + c.ch;
      }
      out.push(line + ANSI_RESET);
    }
    return out.join('\n');
  }

  // ---- Aspect / sample sizing --------------------------------------------
  // Characters are ~2:1 (taller than wide). Given a target output WIDTH in
  // characters, compute the pixel grid to sample so the art keeps the image's
  // aspect ratio. Returns { pixW, pixH, cols, rows }.
  //  - ascii:     1 pixel per char cell (w x charAspect*w) -> rows = cols*(h/w)/charAspect
  //  - halfblock: 2 stacked pixels per char (square pixels at charAspect=2)
  //  - braille:   2x4 dots per char (square dots at charAspect=2)
  function computeSampleSize(mode, imgW, imgH, widthChars, charAspect) {
    const ca = Number.isFinite(charAspect) && charAspect > 0 ? charAspect : 2;
    const iw = imgW > 0 ? imgW : 1;
    const ih = imgH > 0 ? imgH : 1;
    const cols = clampPlain(Math.round(widthChars) || DEFAULTS.width, WIDTH_MIN, WIDTH_MAX);
    const ratio = ih / iw;

    if (mode === 'halfblock') {
      const pixW = cols;
      const pixH = Math.max(2, Math.round(cols * ratio * (2 / ca)));
      const rows = Math.ceil(pixH / 2);
      return { pixW, pixH: rows * 2, cols, rows };
    }
    if (mode === 'braille') {
      const pixW = cols * 2;
      const pixH = Math.max(4, Math.round(pixW * ratio * (2 / ca)));
      const rows = Math.ceil(pixH / 4);
      return { pixW, pixH: rows * 4, cols, rows };
    }
    // ascii
    const rows = Math.max(1, Math.round(cols * ratio / ca));
    return { pixW: cols, pixH: rows, cols, rows };
  }

  export {
    RAMPS,
    DEFAULT_RAMP,
    BRAILLE_BASE,
    BRAILLE_BITS,
    CHAR_HALF_BLOCK,
    MODES,
    DEFAULTS,
    WIDTH_MIN,
    WIDTH_MAX,
    clampPlain,
    clamp255,
    pixelAt,
    luminance,
    adjustLevel,
    normLevel,
    clampRamp,
    charForLevel,
    toAsciiCells,
    toHalfBlockCells,
    toBrailleCells,
    packBraille,
    inkMap,
    renderCells,
    toAscii,
    toBraille,
    cellsToText,
    cellsToHtml,
    htmlDocument,
    rgbToAnsi256,
    cellsToAnsi,
    computeSampleSize,
  };
