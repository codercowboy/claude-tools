
  // =====================================================================
  // social-card-maker — pure logic (DOM-free). Unit-tested directly by
  // tests/unit/*.test.mjs and inlined into the shipped app by the build. NO
  // document/window/localStorage here — all canvas / toBlob / FileReader /
  // persistence work lives in app.mjs.
  //
  // Anything that needs to measure text takes an injected `measure` function
  // `(str) => number` (the pixel width of `str` at the current font), so the
  // engine never touches a real canvas and tests can pass a deterministic fake.
  // =====================================================================

  // ---- Human file size (shared Node-importable module) -------------------
  // Imported instead of a local copy; the single-file build inlines its body
  // into the shipped index.html (stripping the `export`), so runtime stays
  // dependency-free. Re-exported via the export block below so tests/unit see it.
  import { formatBytes } from '../../../lib/utils/CtByteUtil.mjs';
  import { wrapText, slugify, clamp, num } from '../../../lib/utils/CtUtil.mjs';

  // ---- Formats the browser canvas can natively encode --------------------
  // PNG (lossless), JPEG (lossy, no alpha), WebP (lossy, alpha). AVIF is absent
  // (canvas.toBlob has no cross-browser AVIF encoder). The shared Node-importable
  // registry (shared lib utils/image/CtImageUtil.mjs); the build inlines its body here and
  // strips the export. Re-exported via the export block below so tests/unit see it.
  import { FORMATS, mimeForFormat, formatSupportsQuality, coverRect } from '../../../lib/utils/image/CtImageUtil.mjs';

  const DEFAULT_QUALITY = 0.92;
  function clampQuality(q) {
    const v = Number(q);
    if (!Number.isFinite(v)) return DEFAULT_QUALITY;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }
  function percentToQuality(p) {
    const v = Number(p);
    if (!Number.isFinite(v)) return DEFAULT_QUALITY;
    return clampQuality(v / 100);
  }
  function qualityToPercent(q) {
    return Math.round(clampQuality(q) * 100);
  }

  // ---- Small numeric / string guards -------------------------------------
  // clamp / num are CtUtil's (imported above) — the same bodies this file used to carry locally (proved identical in the R12 harness).
  // Accepts "#rgb" or "#rrggbb" (case-insensitive).
  function hexOk(str) {
    return typeof str === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str.trim());
  }
  // Escape a string for safe use inside an HTML double-quoted attribute value.
  function escapeAttrNullSafe(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- Curated system fonts (the dropdown) -------------------------------
  // System fonts ONLY — no bundled faces (repo decision). Each pick carries a
  // generic fallback so an absent face still renders something sensible. There
  // is no vanilla API to enumerate installed fonts, hence a curated list plus a
  // free-text custom field (see resolveFontFamily).
  const CURATED_FONTS = [
    { name: 'System UI',       stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    { name: 'Helvetica',       stack: 'Helvetica, Arial, sans-serif' },
    { name: 'Arial',           stack: 'Arial, Helvetica, sans-serif' },
    { name: 'Arial Black',     stack: '"Arial Black", Gadget, sans-serif' },
    { name: 'Verdana',         stack: 'Verdana, Geneva, sans-serif' },
    { name: 'Trebuchet MS',    stack: '"Trebuchet MS", Tahoma, sans-serif' },
    { name: 'Tahoma',          stack: 'Tahoma, Geneva, sans-serif' },
    { name: 'Georgia',         stack: 'Georgia, "Times New Roman", serif' },
    { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
    { name: 'Palatino',        stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
    { name: 'Courier New',     stack: '"Courier New", Courier, monospace' },
    { name: 'Impact',          stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  ];
  const CURATED_BY_NAME = new Map(CURATED_FONTS.map((f) => [f.name, f]));

  // The custom family (if any) wins; otherwise the curated pick's stack; a
  // generic fallback is always appended so an unknown name degrades gracefully.
  function resolveFontFamily(spec) {
    const custom = (spec && spec.customFont ? String(spec.customFont) : '').trim();
    if (custom) {
      const quoted = /[\s"']/.test(custom) ? `"${custom.replace(/"/g, '')}"` : custom;
      return `${quoted}, ${CURATED_FONTS[0].stack}`;
    }
    const pick = CURATED_BY_NAME.get(spec && spec.family);
    return pick ? pick.stack : CURATED_FONTS[0].stack;
  }

  // Canvas font shorthand: "<weight> <size>px <family-stack>".
  function canvasFontString(spec) {
    const size = Math.max(1, num(spec && spec.fontSize, 16));
    const weight = clamp(spec && spec.fontWeight, 100, 900) || 400;
    return `${weight} ${size}px ${resolveFontFamily(spec)}`;
  }

  // ---- Text wrapping -----------------------------------------------------
  // Greedy word-wrap to a max width (explicit newlines honored as hard breaks;
  // an over-wide word kept whole; `measure(str)->number` injected at the call
  // site): the shared lib helper. The build inlines this module body
  // into the shipped page (stripping the export); re-exported below for tests.
  // (See the shared-lib import at the top of this file.)

  // ---- Output size presets ----------------------------------------------
  const PRESETS = [
    { key: 'og',     label: 'OG landscape (1200×630)', width: 1200, height: 630 },
    { key: 'square', label: 'Square (1200×1200)',      width: 1200, height: 1200 },
    { key: 'story',  label: 'Story (1080×1920)',       width: 1080, height: 1920 },
    { key: 'custom', label: 'Custom',                  width: 1200, height: 630 },
  ];
  const PRESET_BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));
  function presetByKey(key) {
    return PRESET_BY_KEY.get(key) || PRESETS[0];
  }

  const MIN_SIDE = 64;
  const MAX_SIDE = 4096;
  function clampSize(w, h) {
    return {
      width: Math.round(clamp(w, MIN_SIDE, MAX_SIDE)),
      height: Math.round(clamp(h, MIN_SIDE, MAX_SIDE)),
    };
  }

  // ---- Gradient geometry -------------------------------------------------
  // CSS linear-gradient angle convention: 0deg points UP (to the top), 90deg
  // points RIGHT. Returns the gradient-line endpoints (through the box center)
  // sized so the line covers the box corners — feed to createLinearGradient.
  function gradientLineCoords(angleDeg, w, h) {
    const angle = ((num(angleDeg, 0) % 360) + 360) % 360;
    const rad = angle * Math.PI / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const cx = num(w, 0) / 2;
    const cy = num(h, 0) / 2;
    const half = (Math.abs(num(w, 0) * dx) + Math.abs(num(h, 0) * dy)) / 2;
    return {
      x0: cx - dx * half,
      y0: cy - dy * half,
      x1: cx + dx * half,
      y1: cy + dy * half,
    };
  }

  // ---- Cover-fit crop ----------------------------------------------------
  // coverRect (center-crop "cover" source sub-rect) is the shared helper from
  // CtImageUtil (imported with the FORMATS line above); re-exported below.

  // ---- Logo sizing -------------------------------------------------------
  // Draw size for a logo given a target height, preserving aspect ratio.
  function scaleLogoBox(natW, natH, targetH) {
    const w0 = Math.max(1, num(natW, 1));
    const h0 = Math.max(1, num(natH, 1));
    const th = Math.max(1, num(targetH, 1));
    return { w: (w0 / h0) * th, h: th };
  }

  // ---- Layout ------------------------------------------------------------
  // The core layout math. Positions an optional logo box plus an ordered list
  // of pre-wrapped text blocks within a padded content box, honoring horizontal
  // and vertical alignment. Everything is measured for a `textBaseline:'top'`
  // draw model, so each returned line carries its TOP-LEFT-anchored draw
  // position and the canvas textAlign to use.
  //
  // spec = {
  //   width, height, padding,
  //   hAlign: 'left'|'center'|'right',
  //   vAlign: 'top'|'middle'|'bottom',
  //   logo: { w, h } | null,     // draw size (already scaled)
  //   logoGap,                    // gap below the logo, px
  //   blocks: [ { key, lines:[str], fontSize, lineHeight, gapAfter } ],
  // }
  // returns {
  //   contentBox: { x, y, w, h },
  //   textAlign: 'left'|'center'|'right',
  //   anchorX,                    // x to pass to fillText for each line
  //   logoRect: { x, y, w, h } | null,
  //   blocks: [ { key, fontSize, lineHeight, lines:[ { text, x, y } ] } ],
  //   stackHeight,
  // }
  function composeLayout(spec = {}) {
    const width = Math.max(1, num(spec.width, 1200));
    const height = Math.max(1, num(spec.height, 630));
    const padding = Math.max(0, num(spec.padding, 0));
    const hAlign = spec.hAlign === 'left' || spec.hAlign === 'right' ? spec.hAlign : 'center';
    const vAlign = spec.vAlign === 'top' || spec.vAlign === 'bottom' ? spec.vAlign : 'middle';

    const cx = padding;
    const cy = padding;
    const cw = Math.max(1, width - padding * 2);
    const ch = Math.max(1, height - padding * 2);
    const contentBox = { x: cx, y: cy, w: cw, h: ch };

    const logo = spec.logo && num(spec.logo.h, 0) > 0 ? spec.logo : null;
    const logoGap = logo ? Math.max(0, num(spec.logoGap, 0)) : 0;

    const rawBlocks = Array.isArray(spec.blocks) ? spec.blocks : [];
    const measured = rawBlocks.map((b) => {
      const lines = Array.isArray(b.lines) ? b.lines : [];
      const fontSize = Math.max(1, num(b.fontSize, 16));
      const lineHeight = num(b.lineHeight, 1.2) || 1.2;
      const h = lines.length * fontSize * lineHeight;
      return { key: b.key, lines, fontSize, lineHeight, gapAfter: Math.max(0, num(b.gapAfter, 0)), h };
    });

    // Total stack height: logo (+ its gap) then each block plus inter-block gaps.
    let stackHeight = 0;
    if (logo) stackHeight += num(logo.h, 0) + logoGap;
    measured.forEach((b, i) => {
      stackHeight += b.h;
      if (i < measured.length - 1) stackHeight += b.gapAfter;
    });

    // Vertical start of the stack within the content box.
    let top;
    if (vAlign === 'top') top = cy;
    else if (vAlign === 'bottom') top = cy + ch - stackHeight;
    else top = cy + (ch - stackHeight) / 2;

    // Horizontal anchor + canvas textAlign.
    let anchorX;
    if (hAlign === 'left') anchorX = cx;
    else if (hAlign === 'right') anchorX = cx + cw;
    else anchorX = cx + cw / 2;

    let cursorY = top;
    let logoRect = null;
    if (logo) {
      const lw = num(logo.w, 0);
      const lh = num(logo.h, 0);
      let lx;
      if (hAlign === 'left') lx = cx;
      else if (hAlign === 'right') lx = cx + cw - lw;
      else lx = cx + (cw - lw) / 2;
      logoRect = { x: lx, y: cursorY, w: lw, h: lh };
      cursorY += lh + logoGap;
    }

    const blocks = measured.map((b, i) => {
      const lines = b.lines.map((text, li) => ({
        text,
        x: anchorX,
        y: cursorY + li * b.fontSize * b.lineHeight,
      }));
      cursorY += b.h;
      if (i < measured.length - 1) cursorY += b.gapAfter;
      return { key: b.key, fontSize: b.fontSize, lineHeight: b.lineHeight, lines };
    });

    return {
      contentBox,
      textAlign: hAlign,
      anchorX,
      logoRect,
      blocks,
      stackHeight,
    };
  }

  // ---- Meta snippet ------------------------------------------------------
  // Assemble the og:* / twitter:* meta-tag block reflecting the composed card.
  // All content values are attribute-escaped. Empty title/description lines are
  // omitted. imageUrl defaults to the repo's preview.png convention.
  function buildMetaSnippet(opts = {}) {
    const title = String(opts.title == null ? '' : opts.title).trim();
    const description = String(opts.description == null ? '' : opts.description).trim();
    const imageUrl = String(opts.imageUrl == null ? '' : opts.imageUrl).trim() || 'preview.png';
    const siteName = String(opts.siteName == null ? '' : opts.siteName).trim();
    const twitterCard = String(opts.twitterCard || 'summary_large_image').trim() || 'summary_large_image';
    const width = num(opts.width, 0);
    const height = num(opts.height, 0);

    const lines = [];
    if (title) lines.push(`<meta property="og:title" content="${escapeAttrNullSafe(title)}">`);
    if (description) lines.push(`<meta property="og:description" content="${escapeAttrNullSafe(description)}">`);
    lines.push(`<meta property="og:type" content="website">`);
    if (siteName) lines.push(`<meta property="og:site_name" content="${escapeAttrNullSafe(siteName)}">`);
    lines.push(`<meta property="og:image" content="${escapeAttrNullSafe(imageUrl)}">`);
    if (width > 0) lines.push(`<meta property="og:image:width" content="${Math.round(width)}">`);
    if (height > 0) lines.push(`<meta property="og:image:height" content="${Math.round(height)}">`);
    lines.push(`<meta name="twitter:card" content="${escapeAttrNullSafe(twitterCard)}">`);
    if (title) lines.push(`<meta name="twitter:title" content="${escapeAttrNullSafe(title)}">`);
    if (description) lines.push(`<meta name="twitter:description" content="${escapeAttrNullSafe(description)}">`);
    lines.push(`<meta name="twitter:image" content="${escapeAttrNullSafe(imageUrl)}">`);
    return lines.join('\n');
  }

  // ---- Filenames ---------------------------------------------------------
  // slugify() is the shared lib helper (imported at the top of this file,
  // re-exported below for the unit tests; inlined into the shipped page by build).
  function outputFilename(title, fmt) {
    const f = FORMATS[String(fmt).toLowerCase()] || FORMATS.png;
    const base = slugify(title) || 'social-card';
    return `${base}.${f.ext}`;
  }

  export {
    FORMATS,
    mimeForFormat,
    formatSupportsQuality,
    clampQuality,
    percentToQuality,
    qualityToPercent,
    DEFAULT_QUALITY,
    clamp,
    num,
    hexOk,
    escapeAttrNullSafe,
    CURATED_FONTS,
    CURATED_BY_NAME,
    resolveFontFamily,
    canvasFontString,
    wrapText,
    PRESETS,
    presetByKey,
    clampSize,
    MIN_SIDE,
    MAX_SIDE,
    gradientLineCoords,
    coverRect,
    scaleLogoBox,
    composeLayout,
    buildMetaSnippet,
    slugify,
    outputFilename,
    formatBytes,
  };
