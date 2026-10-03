# Pre-task receipt — Phase 09 · ctmarkdown

Pre-task — ship round: CtMarkdown unit tests (p09-ctmarkdown/PRD.md)

① Roster — serial: builder · shipping · sonnet → verifier · verifier · sonnet
   ↳ on FAIL only: verify ↔ bug-fixer · sonnet · cap 2
② DoD — per p09 PRD: CtMarkdown.test.mjs green; cover all 5 exports (mdToHtml, parseInline,
   escapeHtmlForMarkdown, escapeAttrForMarkdown, sanitizeUrl); EXACT-output assertions per construct —
   block (headings incl trailing #, paragraphs, blank-line sep, hr, nested blockquotes, fenced code
   +lang class, indented code, ordered/unordered/nested/loose-vs-tight lists, tables+alignment if
   supported, setext if supported), inline (bold/italic/bold-italic */_ , inline code, links +titles,
   autolinks, images, line breaks two-space/backslash, backslash escapes); SAFETY as explicit assertions
   (raw HTML always escaped per header; sanitizeUrl blocks javascript:/vbscript:/data: except data:image/
   for images under allowImage; < & escaping in text); edges (empty, trailing newline, CRLF, unicode,
   deep nesting, malformed→graceful deterministic); determinism (same MD→byte-identical HTML);
   test-all + build-all 10/10; handoff construct-coverage matrix + the exact raw-HTML/URL safety policy.
③ Paths — in: p09 PRD · src/lib/utils/formats/CtMarkdown.mjs (read) ·
   out: src/lib/tests/unit/CtMarkdown.test.mjs

Advanced: time 2h · scope task-folder · TEST-ONLY. HIGH-size module — table-driven, one focused test per
construct. If genuinely too large for THOROUGH coverage in one round, STOP and propose a split (block vs
inline+safety) rather than shipping shallow tests. A renderer that looks UNSAFE (raw HTML passed through,
a dangerous URL scheme surviving) is a SURFACE-to-user, never a test to weaken. No lib edits.

## User response
Pre-authorized at the 2026-10-03 kickoff gate: **"Run all 13 autonomously"** (sonnet, verify-loop cap 2).

**Accepted:** all defaults except sonnet models + verify-loop cap 2 (epic-wide, per execution-plan.md)
