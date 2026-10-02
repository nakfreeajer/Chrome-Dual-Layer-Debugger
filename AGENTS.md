# Chrome Dual Layer Debugger — Agent Governance

## Authority

Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is the final Human authority. ChatGPT is the current Architect-Curator for this project. There is no automated Orchestrator, watcher, doorbell, background dispatcher, network relay service, automatic Executor start, or automatic prompt execution. Human relay remains manual.

## Roles

### Architect-Curator
- Owns architecture, synthesis, milestone design, independent verification, and official documentation curation.
- Must independently verify Executor claims against authoritative repository state and evidence before acceptance.
- Uses exactly these review classifications unless the Human changes them: `ACCEPTED`, `BLOCKED`, `INCONCLUSIVE`, `NO_NEW_REPORT`.
- Must update all and only relevant official project documents after accepted work requires institutional-memory closure.
- Must not reopen accepted closed work without direct current regression evidence.

### Executor
- Performs bounded implementation, repository inspection, tests, browser/CDP validation, Git operations, and evidence production only within explicit authorization.
- Must stop and report when authoritative source/tests/runtime evidence contradict the Architect instruction.
- Never accepts its own work.
- Must not silently expand scope.

## Manual Relay

No automated dispatch, watcher, doorbell, or relay is authoritative.

For normal Architect -> Executor transport, the Architect provides exact prompt-file bytes and a canonical CDLD-PROMPT-V1 descriptor. The Human imports/authorizes those bytes locally through PromptRelayCli, then sends Executor only:

    RELAY:EXECUTE
    <CDLD-PROMPT-V1...>

The Executor resolves the exact descriptor from verified authorized local state and follows only those bytes. Resolution failure means stop. The descriptor is transport identity, not authorization. Human approval and RELAY.1A lifecycle verification remain required.

When the Human supplies RELAY:EXECUTE followed by a CDLD-PROMPT-V1 token, treat it as a transport instruction, not the substantive task. Resolve that exact token through PromptRelayCli and require verified authorized local state. Read and execute only the exact resolved prompt bytes. If resolution fails, stop and report failure. Never choose by recency, filename/path similarity, or directory search; never regenerate equivalent instructions; never bypass Human approval or lifecycle evidence.

The Human still manually carries:
1. Architect prompt file and descriptor to the local importer, then the descriptor handoff to Executor.
2. Executor terminal report/evidence back to Architect-Curator.
3. Architect decision or correction when needed.
4. Documentation synchronization instruction/closure when required.

A full prompt may be copied into Executor chat only as an explicit fallback when compact relay is unavailable or under repair; do not mix the fallback text with a descriptor-authorized execution.

The Human transport role does not change authority: transported content keeps the authority of its author.

## Sources of truth

- GitHub: committed source, tests, official docs, commit/branch/tag identity.
- Local `.agent-work/`: raw working evidence, transcripts, temporary validation, discovery working records.
- Manual relay packet: bounded evidence being transported between roles; never a second source of truth.
- `docs/`: accepted institutional memory.

Do not duplicate authority. Raw evidence does not become accepted project history until Architect-Curator verification.

## Scope discipline

One bounded milestone at a time. Every Executor task must define objective, authorized paths, exclusions, acceptance criteria, tests, stop conditions, and withheld authorizations.

New ideas raised during implementation are captured under the idea system and do not change active scope without explicit Human/Architect authorization.

## Read-first order

For a fresh Architect-Curator session:
1. `AGENTS.md`
2. `docs/PROJECT_BRIEF.md`
3. `docs/CURRENT_STATE.md`
4. `docs/HANDOVER.md`
5. `docs/DECISIONS.md`
6. `docs/ARCHITECTURE.md`
7. `docs/ROADMAP.md`
8. `docs/AGENT_WORKFLOW.md`
9. `docs/PROTECTED_AREAS.md`
10. `docs/VALIDATION.md`

For a bounded Executor task, read `AGENTS.md` plus only the project docs and source required by the current instruction.

## Current accepted foundation

The local workspace bootstrap at `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger` is accepted. The workspace was cloned from `nakfreeajer/Chrome-Dual-Layer-Debugger`, `.agent-work/` was created locally and verified ignored, and no debugger implementation occurred during bootstrap. Do not repeat that setup absent direct evidence of failure.

## Project-specific permanent rules

- Keep this project independent from AFFOTECH unless the Human explicitly authorizes integration.
- Playwright is the primary semantic interaction layer.
- CDP is the low-level observation/verification layer.
- GAS mode detection for v0.1 is exactly: URL starts with `https://script.google.com/macros/` -> `BROWSER_PLUS_GAS`; otherwise -> `BROWSER_ONLY`.
- `gas-remote-debug` owns GAS-specific browser-root/OOPIF runtime discovery; do not duplicate its recursive discovery engine without demonstrated need.
- Prefer observability before mutation and deterministic evidence before inference.
- Do not close, navigate, or mutate an existing debug browser unless the active milestone explicitly authorizes it.
