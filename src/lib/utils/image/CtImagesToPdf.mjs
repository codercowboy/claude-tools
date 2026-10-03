// ===== Begin jbcImagesToPdf (ES module) =====
/*
 * jbcImagesToPdf — hand-rolled minimal multipage PDF writer.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module and zero-dependency PDF-1.4 assembler.
 * It takes already-encoded JPEG bytes plus pixel dimensions and returns a
 * complete multi-page PDF as a Uint8Array (each image embedded via DCTDecode).
 * Also exports the page-geometry math (points / mm units, page sizes,
 * orientation, contain / cover / actual / fit placement) and small numeric
 * helpers. No document / window / canvas — all image encoding stays in the
 * caller; this module only lays out and serialises the bytes.
 *
 * A tool whose pure, unit-tested source/logic.mjs builds PDFs imports this
 * module directly (so node --test can load it); the single-file build inlines
 * this module body into the shipped index.html — stripping each export — so the
 * shipped tool stays dependency-free and file://-openable. See the consuming
 * repo's build docs (import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

// The human byte-size readout is the shared logic-layer formatBytes, imported
// from the sibling module and re-exported (below) so this engine stays the one
// source of truth. Same pattern as hasher.mjs importing crc32.mjs. The build
// inlines the formatBytes body once per page (hoisting it ahead of first use),
// so a tool importing this engine never gets a duplicate declaration.
import { formatBytes } from '../CtByteUtil.mjs';

// ---- Units & page sizes ------------------------------------------------
// 1 pt = 1/72 inch. Page sizes below are in PDF points (portrait).
const MM_TO_PT = 72 / 25.4;
const PT_PER_PX = 1; // "actual size" / fit-to-image map pixels at 72 dpi.

const PAGE_SIZES_PT = {
  a4:     { w: 595.276, h: 841.890 },
  a3:     { w: 841.890, h: 1190.551 },
  letter: { w: 612,     h: 792 },
  legal:  { w: 612,     h: 1008 },
};

function mmToPt(mm) { return (Number(mm) || 0) * MM_TO_PT; }
function ptToMm(pt) { return (Number(pt) || 0) / MM_TO_PT; }

// ---- PDF number / string formatting ------------------------------------
// PDF reals must be plain decimals (no exponent). Trim trailing zeros so the
// content streams stay compact and deterministic.
function pdfNumber(n) {
  let v = Number(n);
  if (!Number.isFinite(v)) v = 0;
  let s = v.toFixed(4);
  // toFixed switches to exponential notation at |v| >= 1e21; at that
  // magnitude the fractional part is already unrepresentable in a double,
  // so emit the full integer decimal instead (a PDF real must never carry
  // an exponent, or the file is corrupt).
  if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
    s = BigInt(Math.round(v)).toString();
  } else if (s.indexOf('.') >= 0) {
    s = s.replace(/\.?0+$/, '');
  }
  if (s === '-0') s = '0';
  return s;
}

// Escape a JS string for use inside a PDF literal string, ( ... ).
function pdfEscapeString(str) {
  return String(str == null ? '' : str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\b]/g, '\\b')
    .replace(/\f/g, '\\f');
}

function pad10(n) {
  return String(Math.max(0, Math.round(Number(n) || 0))).padStart(10, '0');
}

// Encode an ASCII/Latin1 string to bytes (PDF syntax is Latin1; binary
// streams are pushed as raw Uint8Array, never through this).
function strToBytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

// ---- Quality helpers ---------------------------------------------------
const DEFAULT_QUALITY = 0.85;

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

// formatBytes is imported from ../CtByteUtil.mjs (top of module) and re-exported
// in the export block below — the embedded copy was byte-identical to the shared
// default, proven over the full vector set.

// ---- Page orientation & size -------------------------------------------
// Given a base page {w,h} apply an orientation. 'auto' matches the image's
// own aspect (landscape when wider than tall).
function applyOrientation(base, orientation, imgW, imgH) {
  let w = base.w > 0 ? base.w : PAGE_SIZES_PT.a4.w;
  let h = base.h > 0 ? base.h : PAGE_SIZES_PT.a4.h;
  let target = orientation;
  if (target === 'auto') {
    target = (Number(imgW) > Number(imgH)) ? 'landscape' : 'portrait';
  }
  if (target === 'landscape') {
    if (w < h) { const t = w; w = h; h = t; }
  } else { // portrait (default)
    if (w > h) { const t = w; w = h; h = t; }
  }
  return { w, h };
}

// Resolve the media-box size (points) for one image + the current options.
function orientedPageSize(opts) {
  const {
    pageSize, orientation = 'auto', imgW, imgH,
    marginPt = 0, customWpt = 0, customHpt = 0,
  } = opts || {};

  if (pageSize === 'fit') {
    return {
      w: imgW * PT_PER_PX + 2 * marginPt,
      h: imgH * PT_PER_PX + 2 * marginPt,
    };
  }
  const base = pageSize === 'custom'
    ? { w: customWpt, h: customHpt }
    : (PAGE_SIZES_PT[pageSize] || PAGE_SIZES_PT.a4);
  return applyOrientation(base, orientation, imgW, imgH);
}

// ---- Placement rectangle -----------------------------------------------
// Compute where the image is drawn on the page (PDF coords, origin
// bottom-left) for a given fit mode, plus a clip rectangle = the content
// box (page minus margins) so cover/actual overflow is cropped, not spilled.
function computePlacement(opts) {
  const { pageW, pageH, imgW, imgH, margin = 0, fitMode = 'contain' } = opts || {};
  const iw = imgW > 0 ? imgW : 1;
  const ih = imgH > 0 ? imgH : 1;
  const boxX = margin;
  const boxY = margin;
  const boxW = Math.max(1, pageW - 2 * margin);
  const boxH = Math.max(1, pageH - 2 * margin);

  let w;
  let h;
  if (fitMode === 'actual') {
    w = iw * PT_PER_PX;
    h = ih * PT_PER_PX;
  } else if (fitMode === 'cover') {
    const scale = Math.max(boxW / iw, boxH / ih);
    w = iw * scale;
    h = ih * scale;
  } else { // contain (default)
    const scale = Math.min(boxW / iw, boxH / ih);
    w = iw * scale;
    h = ih * scale;
  }
  const x = boxX + (boxW - w) / 2;
  const y = boxY + (boxH - h) / 2;
  return { x, y, w, h, clip: { x: boxX, y: boxY, w: boxW, h: boxH } };
}

// ---- Content stream ----------------------------------------------------
// Draw the single image XObject (/Im0) into its placement rectangle. The
// XObject occupies a unit square, so the cm matrix scales/translates it.
function buildContentStream(image) {
  const { x, y, w, h, clip } = image;
  let s = 'q\n';
  if (clip) {
    s += `${pdfNumber(clip.x)} ${pdfNumber(clip.y)} ${pdfNumber(clip.w)} ${pdfNumber(clip.h)} re W n\n`;
  }
  s += `${pdfNumber(w)} 0 0 ${pdfNumber(h)} ${pdfNumber(x)} ${pdfNumber(y)} cm\n`;
  s += '/Im0 Do\n';
  s += 'Q';
  return s;
}

// ---- Plan pages --------------------------------------------------------
// images: [{ jpegBytes: Uint8Array, width, height }]
// options: { pageSize, orientation, marginMm, fitMode, customWmm, customHmm }
function planPages(images, options) {
  const o = options || {};
  const marginPt = mmToPt(o.marginMm);
  const customWpt = mmToPt(o.customWmm);
  const customHpt = mmToPt(o.customHmm);

  return (images || []).map((im) => {
    const size = orientedPageSize({
      pageSize: o.pageSize,
      orientation: o.orientation,
      imgW: im.width,
      imgH: im.height,
      marginPt,
      customWpt,
      customHpt,
    });
    const pageWidth = size.w;
    const pageHeight = size.h;

    let placement;
    if (o.pageSize === 'fit') {
      const w = im.width * PT_PER_PX;
      const h = im.height * PT_PER_PX;
      placement = { x: marginPt, y: marginPt, w, h, clip: { x: marginPt, y: marginPt, w, h } };
    } else {
      placement = computePlacement({
        pageW: pageWidth,
        pageH: pageHeight,
        imgW: im.width,
        imgH: im.height,
        margin: marginPt,
        fitMode: o.fitMode,
      });
    }

    return {
      pageWidth,
      pageHeight,
      image: {
        bytes: im.jpegBytes,
        width: im.width,
        height: im.height,
        x: placement.x,
        y: placement.y,
        w: placement.w,
        h: placement.h,
        clip: placement.clip,
      },
    };
  });
}

// ---- PDF assembly ------------------------------------------------------
// pages: output of planPages. Returns a complete PDF as a Uint8Array.
// Object numbering: 1 Catalog, 2 Pages, 3 Info; page i -> 4+3i (Page),
// 5+3i (Contents), 6+3i (Image). numObjects = 3 + 3*N.
function assemblePdf(pages, meta) {
  const list = pages || [];
  const title = (meta && meta.title) || '';

  const chunks = [];
  let length = 0;
  const offsets = []; // offsets[objNum] = byte offset of that object

  const push = (chunk) => {
    const b = (chunk instanceof Uint8Array) ? chunk : strToBytes(chunk);
    chunks.push(b);
    length += b.length;
  };
  const startObj = (num) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
  };

  // Header + a binary-marker comment (tells tools the file is binary).
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog
  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  const kids = list.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
  startObj(2);
  push(`<< /Type /Pages /Kids [${kids}] /Count ${list.length} >>\nendobj\n`);

  // 3: Info
  startObj(3);
  let info = '<< /Producer (images-to-pdf)';
  if (title) info += ` /Title (${pdfEscapeString(title)})`;
  info += ' >>\nendobj\n';
  push(info);

  // Per page: Page, Contents, Image XObject.
  list.forEach((pg, i) => {
    const pageNum = 4 + i * 3;
    const contentNum = 5 + i * 3;
    const imgNum = 6 + i * 3;
    const im = pg.image;

    const contentBytes = strToBytes(buildContentStream(im));

    startObj(pageNum);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pg.pageWidth)} ${pdfNumber(pg.pageHeight)}]` +
      ` /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );

    startObj(contentNum);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push('\nendstream\nendobj\n');

    startObj(imgNum);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height}` +
      ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`
    );
    push(im.bytes);
    push('\nendstream\nendobj\n');
  });

  // Cross-reference table. Each entry is exactly 20 bytes (offset(10) SP
  // gen(5) SP type(1) SP LF).
  const numObjects = 3 + list.length * 3;
  const total = numObjects + 1;
  const xrefOffset = length;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n <= numObjects; n++) {
    xref += `${pad10(offsets[n])} 00000 n \n`;
  }
  push(xref);

  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  // Concatenate.
  const out = new Uint8Array(length);
  let o = 0;
  for (const b of chunks) { out.set(b, o); o += b.length; }
  return out;
}

// Convenience: plan + assemble in one call.
//   images:  [{ jpegBytes: Uint8Array, width, height }]
//   options: { pageSize, orientation, marginMm, fitMode, customWmm, customHmm, title }
function buildPdf(images, options) {
  const o = {
    pageSize: 'a4',
    orientation: 'auto',
    marginMm: 10,
    fitMode: 'contain',
    customWmm: 210,
    customHmm: 297,
    ...(options || {}),
  };
  const pages = planPages(images, o);
  return assemblePdf(pages, { title: o.title });
}

export {
  MM_TO_PT,
  PT_PER_PX,
  PAGE_SIZES_PT,
  DEFAULT_QUALITY,
  mmToPt,
  ptToMm,
  pdfNumber,
  pdfEscapeString,
  pad10,
  strToBytes,
  clampQuality,
  percentToQuality,
  qualityToPercent,
  formatBytes,
  applyOrientation,
  orientedPageSize,
  computePlacement,
  buildContentStream,
  planPages,
  assemblePdf,
  buildPdf,
};
