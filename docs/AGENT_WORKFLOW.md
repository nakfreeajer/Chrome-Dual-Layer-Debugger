# Agent Workflow

## Model
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is final Human authority. ChatGPT is the current Architect-Curator. This project intentionally omits the automated AMO Orchestrator. The Human Owner performs relay manually.

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
1. Architect freezes one complete bounded milestone as exact prompt bytes and supplies the prompt file plus canonical descriptor.
2. Human imports and authorizes those exact bytes locally using PromptRelayCli and the explicit approval reference.
3. Human transports only the unchanged descriptor to Executor using RELAY:EXECUTE followed by the CDLD-PROMPT-V1 token.
4. Executor resolves the descriptor against fully verified RELAY.1A authorized state; resolution failure means stop. Executor performs only the exact resolved bounded prompt.
5. Executor validates and writes structured terminal report/evidence locally under `.agent-work/`.
6. Human manually returns the report/evidence to Architect-Curator.
7. Architect independently verifies against GitHub and evidence and classifies `ACCEPTED`, `BLOCKED`, `INCONCLUSIVE`, or `NO_NEW_REPORT`.
8. Documentation/publication remain separate authorizations when applicable.

## Accepted bootstrap checkpoint
The initial local workspace bootstrap is closed and accepted:
- local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`;
- repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`;
- branch: `main`;
- accepted bootstrap baseline: `d157bd48ded35c1714d64635539569ca799da72d`;
- `.agent-work/` created locally using `tools/setup-agent-work.ps1`;
- `.agent-work/` verified ignored;
- no tracked/source/debugger implementation changes occurred during the bootstrap.

This checkpoint is a dependency for future milestones and must not be rerun unless direct current evidence shows the workspace contract has failed.

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

The `prompts/` store may be created lazily by relay tooling; workspace bootstrap does not need to be rerun. Prompt bytes live at `.agent-work/prompts/<milestoneId>/<promptSha256>.md`, with immutable manifests and lifecycle records alongside them; `.agent-work/current/executor-prompt.json` is only a mutable recovery locator, not authority. The `bridge/` folder remains only a manual staging/redaction boundary, not authority; no automated synchronization is assumed.

## Documentation closure
There is no automated documentation doorbell. When accepted work materially changes current state, decisions, history, architecture, workflow, validation, lessons, roadmap or handover state, the Architect-Curator performs the bounded documentation synchronization directly after acceptance.

## Non-regression
Accepted closed capabilities become dependencies. Reopen only when direct current evidence shows the documented contract has failed.
