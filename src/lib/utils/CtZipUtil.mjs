/* ============================================================================
 * CtZipUtil.mjs — hand-rolled STORE-only (uncompressed) ZIP writer.
 *
 * Promoted VERBATIM from the byte-identical copies in favicon-kit,
 * srcset-builder and sprite-packer (`storeZip` + the little-endian writers).
 * Import-inlined by the single-file build (the `export` keyword is stripped),
 * so shipped pages stay dependency-free. Depends only on `crc32` from
 * CtByteUtil.mjs.
 * ==========================================================================*/
import { crc32 } from './CtByteUtil.mjs';

/* ----------------------------------------------------------------------
 * Little-endian writers over a DataView. Both ICO and ZIP are little-endian.
 * ------------------------------------------------------------------- */
export function u16le(view, offset, value) { view.setUint16(offset, value & 0xffff, true); }
export function u32le(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

/* ----------------------------------------------------------------------
 * storeZip(files) — hand-rolled STORE-only (uncompressed) ZIP archive.
 *
 * files: [{ name, bytes }]. PNGs/ICO are already compressed, so STORE (method
 * 0) keeps the writer tiny and dependency-free while producing a standard,
 * universally-openable .zip. Structure (all multi-byte fields little-endian):
 *   for each file: Local File Header (PK\x03\x04) + name + payload
 *   Central Directory: one record per file (PK\x01\x02) + name
 *   End Of Central Directory record (PK\x05\x06)
 *
 * DOS date/time are written as 0 (a fixed, valid-enough timestamp) so the
 * output is deterministic — this tool has no real clock dependency.
 * ------------------------------------------------------------------- */
export function storeZip(files) {
  const enc = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = enc.encode(f.name);
    const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
    // Set general-purpose bit 11 (0x0800) when the name has non-ASCII bytes, declaring it UTF-8 so
    // extractors don't mangle it (names are always TextEncoder/UTF-8 here) (#1014-O).
    const flag = nameBytes.some((b) => b > 0x7f) ? 0x0800 : 0;
    return { nameBytes, data, crc: crc32(data), offset: 0, flag };
  });

  // Local sections
  const locals = [];
  let offset = 0;
  for (const e of entries) {
    const header = new Uint8Array(30 + e.nameBytes.length);
    const v = new DataView(header.buffer);
    u32le(v, 0, 0x04034b50);          // local file header signature
    u16le(v, 4, 20);                  // version needed to extract (2.0)
    u16le(v, 6, e.flag);              // general purpose bit flag (bit 11 = UTF-8 name)
    u16le(v, 8, 0);                   // compression method: 0 = store
    u16le(v, 10, 0);                  // last mod file time
    u16le(v, 12, 0);                  // last mod file date
    u32le(v, 14, e.crc);              // crc-32
    u32le(v, 18, e.data.length);      // compressed size (= uncompressed for store)
    u32le(v, 22, e.data.length);      // uncompressed size
    u16le(v, 26, e.nameBytes.length); // file name length
    u16le(v, 28, 0);                  // extra field length
    header.set(e.nameBytes, 30);
    e.offset = offset;
    locals.push(header, e.data);
    offset += header.length + e.data.length;
  }

  // Central directory
  const centrals = [];
  let centralSize = 0;
  for (const e of entries) {
    const rec = new Uint8Array(46 + e.nameBytes.length);
    const v = new DataView(rec.buffer);
    u32le(v, 0, 0x02014b50);          // central file header signature
    u16le(v, 4, 20);                  // version made by
    u16le(v, 6, 20);                  // version needed to extract
    u16le(v, 8, e.flag);              // general purpose bit flag (bit 11 = UTF-8 name)
    u16le(v, 10, 0);                  // compression method
    u16le(v, 12, 0);                  // last mod file time
    u16le(v, 14, 0);                  // last mod file date
    u32le(v, 16, e.crc);              // crc-32
    u32le(v, 20, e.data.length);      // compressed size
    u32le(v, 24, e.data.length);      // uncompressed size
    u16le(v, 28, e.nameBytes.length); // file name length
    u16le(v, 30, 0);                  // extra field length
    u16le(v, 32, 0);                  // file comment length
    u16le(v, 34, 0);                  // disk number start
    u16le(v, 36, 0);                  // internal file attributes
    u32le(v, 38, 0);                  // external file attributes
    u32le(v, 42, e.offset);           // relative offset of local header
    rec.set(e.nameBytes, 46);
    centrals.push(rec);
    centralSize += rec.length;
  }
  const centralOffset = offset;

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32le(ev, 0, 0x06054b50);           // end of central dir signature
  u16le(ev, 4, 0);                    // number of this disk
  u16le(ev, 6, 0);                    // disk where central directory starts
  u16le(ev, 8, entries.length);       // central dir records on this disk
  u16le(ev, 10, entries.length);      // total central dir records
  u32le(ev, 12, centralSize);         // size of central directory
  u32le(ev, 16, centralOffset);       // offset of central directory
  u16le(ev, 20, 0);                   // comment length

  // Concatenate everything
  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of locals) { out.set(chunk, pos); pos += chunk.length; }
  for (const chunk of centrals) { out.set(chunk, pos); pos += chunk.length; }
  out.set(eocd, pos);
  return out;
}
