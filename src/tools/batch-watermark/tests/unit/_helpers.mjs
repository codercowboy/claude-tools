// Tool-specific test-only helpers for tests/unit/*.test.mjs. Dev/test-only —
// never referenced by index.html.
//
// The shared memoized logic loader now lives in the shared test-support module
// (../../../../lib/test-support/unit.mjs); this file re-exports it under the tool's
// historical name and keeps the tool-specific ZIP/CRC fixture helpers below.
import { loadLogic as loadSharedLogic } from '../../../../lib/test-support/unit.mjs';

// loadLogic() -> Promise of source/logic.mjs's module namespace (memoized).
export function loadLogic() {
  return loadSharedLogic(import.meta.url);
}

// Little-endian readers over a Uint8Array, for asserting the binary containers.
export function u16le(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8);
}
export function u32le(bytes, off) {
  return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

// Encode an ASCII/UTF-8 string to bytes (file names in the ZIP tests).
export function ascii(str) {
  return new TextEncoder().encode(str);
}

// An INDEPENDENT CRC-32 (ISO-3309 / PNG polynomial), written from scratch here
// so the ZIP tests never lean on logic.mjs's own crc32 to "verify" itself.
// Bit-reflected, table-free reference implementation.
export function refCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xedb88320) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// An INDEPENDENT store-ZIP reader: walk the End-Of-Central-Directory record and
// every central-directory header, follow each entry's local-header offset, and
// return a normalized view of every entry (with the payload extracted and its
// CRC recomputed via refCrc32). Throws on any structural inconsistency, so a
// malformed archive fails the test rather than passing silently.
const LFH_SIG = 0x04034b50;  // PK\x03\x04
const CDH_SIG = 0x02014b50;  // PK\x01\x02
const EOCD_SIG = 0x06054b50; // PK\x05\x06

export function readStoreZip(bytes) {
  const dec = new TextDecoder();
  // EOCD is the final 22 bytes when there is no archive comment.
  const eocdOff = bytes.length - 22;
  if (u32le(bytes, eocdOff) !== EOCD_SIG) throw new Error('missing EOCD signature');
  const totalRecords = u16le(bytes, eocdOff + 10);
  const cdSize = u32le(bytes, eocdOff + 12);
  const cdOffset = u32le(bytes, eocdOff + 16);
  if (cdOffset + cdSize !== eocdOff) throw new Error('central directory not flush against EOCD');

  const entries = [];
  let cd = cdOffset;
  for (let i = 0; i < totalRecords; i++) {
    if (u32le(bytes, cd) !== CDH_SIG) throw new Error(`central header ${i} bad signature`);
    const method = u16le(bytes, cd + 10);
    const crcStored = u32le(bytes, cd + 16);
    const compSize = u32le(bytes, cd + 20);
    const uncompSize = u32le(bytes, cd + 24);
    const nameLen = u16le(bytes, cd + 28);
    const extraLen = u16le(bytes, cd + 30);
    const commentLen = u16le(bytes, cd + 32);
    const localOff = u32le(bytes, cd + 42);
    const name = dec.decode(bytes.subarray(cd + 46, cd + 46 + nameLen));

    // Follow the local-header offset and cross-check.
    if (u32le(bytes, localOff) !== LFH_SIG) throw new Error(`local header for ${name} bad signature`);
    const lMethod = u16le(bytes, localOff + 8);
    const lCrc = u32le(bytes, localOff + 14);
    const lCompSize = u32le(bytes, localOff + 18);
    const lNameLen = u16le(bytes, localOff + 26);
    const lExtraLen = u16le(bytes, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(dataStart, dataStart + lCompSize);

    entries.push({
      name, method, lMethod,
      crcStored, lCrc,
      compSize, uncompSize, lCompSize,
      recomputedCrc: refCrc32(data),
      data,
      commentLen, extraLen,
    });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return { totalRecords, cdOffset, cdSize, entries };
}
