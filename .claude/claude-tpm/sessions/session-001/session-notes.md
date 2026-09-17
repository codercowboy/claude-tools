# SESSION 001 — 2026-09-16 — (untitled)

## RESUME
**Where we are:** claude-tools: 9 vanilla tools migrated from ../claude-tools-dev, all built+tested green; both galleries reconciled; package.json polished to v1.0.0 + LICENSE. Tasks #1000/#1002/#1004 done. Oriented to jbc-voice; located jason-code/conventions/project-structure docs.
**Next action:** #1001 write docs (README/install/technical/alternatives) in jbc-voice, grounded in jason-code conventions/project-structure — likely a workflow. Then #1003 vendor carve-out. Verify pkg repo URL guess.
**In flight:** Nothing in flight.

## Open items
None open.

## Decisions
- **Decided:** jbc-voice doc set to point workflow subagents at (for #1001 docs / any prose) — Under ${JBC_HOME}/jason-voice/ : voice-profile.md (the analysis), jason-voice-instructions.md (how it sounds), jason-voice-conventions.md (how it's built: README skeleton, docs/alternatives.md, docs/technical.md, LICENSE+disclaimer, credit=Claude code/docs + Jason 'ideas guy'), jason-voice-antipatterns.md (Claudisms to cut — scan drafts against it), samples/ (real Jason READMEs for calibration). Read via Read tool (${JBC_HOME} hook), never Bash cat.

## Log
- [NOTE] 2026-09-16T22:19:25.702Z — Located jason-code conventions/project-structure/ docs: README, repo-layout.md, build-pipeline.md, testing.md, dev-setup.md, sync-protocol.md (+ sibling convention sets html-single-file/, tools/, games/, screensavers/). Source-of-truth for the structure/build we copied; grounding for #1001 docs.
