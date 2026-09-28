# Agent Workflow

## Model
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

This project intentionally omits the automated AMO Orchestrator. The Human Owner performs relay manually.

## Discovery loop
- Human and Architect may explore freely.
- Exploratory statements are not requirements by default.
- Candidate ideas go to `docs/IDEA_INBOX.md` and/or local `.agent-work/ideas/`.
- Architect synthesizes accepted intent before architecture or milestone freeze.

## Planning loop
Before implementation, the Architect should be able to explain:
- what is being built and why;
- who it serves;
- which Human decisions are accepted;
- unresolved questions and assumptions;
- required foundation/dependencies;
- explicit exclusions;
- evidence that will prove the milestone complete.

## Execution loop
1. Architect defines one bounded milestone.
2. Human manually relays the exact instruction to Executor.
3. Executor captures baseline and works only within the authorized mutation envelope.
4. Executor validates and writes a structured terminal report/evidence locally under `.agent-work/`.
5. Human manually relays the bounded report/evidence to Architect-Curator.
6. Architect independently verifies against GitHub and evidence.
7. Architect classifies `ACCEPTED`, `BLOCKED`, `INCONCLUSIVE`, or `NO_NEW_REPORT`.
8. If accepted work changes institutional memory, Architect-Curator updates all and only relevant official docs.
9. Commit/push/tag/deploy remain separate authorizations when applicable.

## Evidence challenge rule
If source, tests, runtime behavior, or repository history contradicts the instruction, Executor stops the affected path and reports the contradiction. It must not force compliance or silently work around the evidence.

## Manual relay packet
For ordinary milestones, the Human should relay at minimum:
- milestone ID/objective;
- exact Executor terminal report;
- changed paths and repository identity;
- tests/validation performed;
- blockers/uncertainty;
- patch or commit/compare evidence when needed for independent review.

No automated handoff ID, watcher state, doorbell, or relay receipt is required in this project.

## Local `.agent-work/` layout
Created locally by `tools/setup-agent-work.ps1` and ignored by Git:

```text
.agent-work/
├── current/
├── discovery/
│   ├── sessions/
│   ├── research/
│   ├── decisions/
│   └── open-questions/
├── ideas/
│   ├── open/
│   ├── accepted/
│   ├── rejected/
│   └── implemented/
├── milestones/
├── transcripts/
│   ├── architect/
│   └── executor/
├── reports/
│   ├── architect/
│   └── executor/
├── artifacts/
├── bridge/
│   ├── outbox/
│   └── readback/
├── cache/
├── temp/
└── private/
```

The `bridge/` folder is only a manual staging/redaction boundary here; no automated synchronization is assumed.

## Non-regression
Accepted closed capabilities become dependencies. Reopen only when direct current evidence shows the documented contract has failed.
