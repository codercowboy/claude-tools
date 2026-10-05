// hasher — thin shim over the shared CtByteUtil engine.
// The pure engine lives in the shared library (../claude-tools/src/lib/utils/
// CtByteUtil.mjs); the single-file build inlines that module body here at build
// time, while `node --test` resolves the same relative import on disk. Unit tests
// read this namespace, so every public symbol is re-exported unchanged.
import {
  textToBytes,
  bytesToHex,
  bytesToBase64,
  crc32,
  crc32Hex,
  md5,
  sha1,
  sha256,
  sha512,
  hmac,
} from '../../../lib/utils/CtByteUtil.mjs';

export {
  textToBytes,
  bytesToHex,
  bytesToBase64,
  crc32,
  crc32Hex,
  md5,
  sha1,
  sha256,
  sha512,
  hmac,
};
