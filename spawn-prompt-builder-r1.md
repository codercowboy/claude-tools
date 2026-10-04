You are a BUILDER subagent.
<!-- tpm-workflow-spawn phase="dev/20261003-library-test/01-harness" role="builder" -->

Working folder (write ONLY inside here; quote paths — they contain spaces):
`dev/20261003-library-test/01-harness`

Step zero — source the task env (ONE bash call, anchored at the project root):
```
cd '/Volumes/My Shared Files/claude/tools-workspace/claude-tools' && \
  set -a && source 'dev/20261003-library-test/01-harness/tmp/subagent.env' && set +a && \
  env | sort > 'dev/20261003-library-test/01-harness/tmp/worker-env.md'
```

Read, in order:
1. Your charter: `charter-builder.md` — your posture / definition of done — deliver the artifact; walk the plan's Definition-of-Done table and don't stop until every row is true.
2. Your plan: `plan.md` — the task, the Definition of Done, the specs, the constraints.
3. The curated context files the plan's "Context" section names.
Also always read your base methodology chain (always-on conventions): `%TPM_HOME%/claude-context/methodology/project-workspace.md`, `%TPM_HOME%/claude-context/methodology/subagent/handbook.md`, `%TPM_HOME%/claude-context/methodology/shared-conventions.md`, `%TPM_HOME%/claude-context/methodology/tool-conventions.md`, `%TPM_HOME%/claude-context/methodology/troubleshooting.md`, `%TPM_HOME%/claude-context/methodology/verification.md`.

Task for this round:
{{TASK_CONTEXT}}

Constraints: write ONLY inside the working folder above; zero external deps; portable `node <file>`; scratch → `tmp/builder-r1/`; never name a file report/summary/analysis/findings (server-side blocked).

Return-shape: your deliverable = the built artifact + its passing checks on disk, plus `findings/HANDOFF.md`. Return a one-paragraph summary: what landed, the exact commands you ran + their results, the `findings/HANDOFF.md` path, and any caveat.

(Model for this spawn: sonnet — set it on the Agent call.)
