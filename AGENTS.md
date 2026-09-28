# Chrome Dual Layer Debugger — Agent Governance

## Authority

Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is the final Human authority. ChatGPT is the current Architect-Curator for this project. There is no automated Orchestrator. Relay/transport between Executor and Architect-Curator is performed manually by the Human Owner.

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

For each milestone the Human Owner manually carries:
1. Architect bounded instruction -> Executor.
2. Executor terminal report/evidence -> Architect-Curator.
3. Architect decision or correction -> Executor when needed.
4. Documentation synchronization instruction/closure when required.

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
