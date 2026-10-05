# Design
- `source/logic.mjs`: pure encoders returning `{symbology, modules, text, checkDigit, error}` (module string, no quiet zones), `layout` (shared geometry) and `toSvg`. Check digits are hand-rolled.
- `source/app.mjs`: DOM only. The preview parses the same SVG string the export uses (DOMParser, no innerHTML). PNG is drawn on a canvas at an integer scale with smoothing off; never SVG-to-Image.
- Code 128 auto mode is greedy: start in C for a leading run of >= 4 digits, switch to C inside text for runs >= 6 (>= 4 at the end), leave an odd digit in the previous set, A only for control characters.
- Fleet build rule: no top-level binding is declared in both logic.mjs and app.mjs (logic is inlined into app).
