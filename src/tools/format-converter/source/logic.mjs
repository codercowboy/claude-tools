// =====================================================================
// Format Converter — pure logic (DOM-free, unit-testable).
//
// The structured-data conversion engine (JSON / CSV / TSV / YAML / .properties
// / XML parse+emit registry, detectFormat, convert) now lives in the shared,
// Node-importable module lib/formats/CtFormat.mjs (promoted to jason-code,
// vendored here). This file imports it and re-exports its API unchanged, so the
// unit tests (which read this module's namespace) and app.mjs (which inlines
// this file at build time) see the same surface. The build resolves the import
// and inlines the engine body (stripping each export) so the shipped index.html
// stays dependency-free and file://-openable.
// =====================================================================
import {
  FORMATS,
  parseJSON, emitJSON,
  parseYAML, emitYAML,
  parseCSV, emitCSV,
  parseTSV, emitTSV,
  parseProperties, emitProperties,
  parseXML, emitXML,
  detectFormat,
  convert,
} from '../../../lib/utils/formats/CtFormat.mjs';

export {
  FORMATS,
  parseJSON, emitJSON,
  parseYAML, emitYAML,
  parseCSV, emitCSV,
  parseTSV, emitTSV,
  parseProperties, emitProperties,
  parseXML, emitXML,
  detectFormat,
  convert,
};
