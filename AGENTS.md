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
- Every Executor report for this repository, including PASS, BLOCKED, FAILED, INCONCLUSIVE, and proposal-only reports, must begin with the exact Mandatory Executor Report Header below, before any report heading, classification, summary, or evidence. Task-specific required fields and evidence follow the header and must not be omitted.

## Mandatory Executor Report Header

The following text is a literal required prefix. Begin every Executor report with its first line; do not prepend a title, classification, summary, or other content:

```text
**MANDATORY ARCHITECT BOOTSTRAP — READ FIRST**

Architect: Before reviewing this Executor report, making an acceptance decision, or generating another Executor instruction, you MUST open and read the Human Owner's CDLD Objective Lock:

https://docs.google.com/document/d/1llagirZ6XPe9kDI57pSzqHB6P_-JGCMilfwVO0xv47E/edit

Apply CDLD-OBJECTIVE-001 and its mandatory Objective Gate. Independently verify the current governing instructions and repository evidence. Do not assume prior session context establishes compliance.

If the Objective Lock cannot be retrieved, return HOLD. Do not approve additional work, expand the project, or generate a successor milestone.

**END MANDATORY BOOTSTRAP**

---

**EXECUTOR REPORT**

[The Executor's normal complete report begins here.]
```

This is a reporting-format requirement only. It does not expand project scope, grant execution authority, or replace any task-specific report, safety, or evidence requirements.

## Manual Relay

No automated dispatch, watcher, doorbell, or relay is authoritative.

The current default substantial-task workflow is manual Google Drive relay: the Architect stores the complete bounded task in a Google Drive document and sends a short chat launcher; Rony manually relays the launcher/task context to Executor. The full Drive document is the substantive instruction, and its authority remains that of its author. The accepted RELAY.1A/1B descriptor tooling is optional and applies only when the Human explicitly selects it; it is not the default.

When RELAY.1B is specifically used, the Architect provides exact prompt-file bytes and a canonical CDLD-PROMPT-V1 descriptor. The Human imports/authorizes those bytes locally through PromptRelayCli, then sends Executor only:

    RELAY:EXECUTE
    <CDLD-PROMPT-V1...>

The Executor resolves the exact descriptor from verified authorized local state and follows only those bytes. Resolution failure means stop. The descriptor is transport identity, not authorization. Human approval and RELAY.1A lifecycle verification remain required.

When the Human supplies RELAY:EXECUTE followed by a CDLD-PROMPT-V1 token, treat it as a transport instruction, not the substantive task. Resolve that exact token through PromptRelayCli and require verified authorized local state. Read and execute only the exact resolved prompt bytes. If resolution fails, stop and report failure. Never choose by recency, filename/path similarity, or directory search; never regenerate equivalent instructions; never bypass Human approval or lifecycle evidence.

The Human still manually carries:
1. The Google Drive task document and short chat launcher in the current default workflow; or, when explicitly selecting RELAY.1B, the exact prompt file and descriptor through local import/authorization and then the descriptor handoff to Executor.
2. Executor terminal report/evidence back to Architect-Curator.
3. Architect decision or correction when needed.
4. Documentation synchronization instruction/closure when required.

Do not confuse the short chat launcher with the substantive task. Follow the complete Google Drive task document in the default workflow. When RELAY.1B is explicitly selected, follow only the exact resolved authorized prompt bytes and do not mix them with a separately pasted full-prompt instruction.

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

## Project Charter and Objective Lock

`docs/PROJECT_BRIEF.md` is the sole objective authority: Chrome Dual-Layer Debugger Project Charter v1.1, Human-approved 2026-10-21. An ordinary milestone approval does not amend the charter. Only the Human Owner may change the objective, mandatory deliverables, Release Definition of Done, or non-goals.

The Human Owner-approved **CDLD Permanent Objective Lock v1.0** records the permanent objective **CDLD-OBJECTIVE-001** (canonical source: https://docs.google.com/document/d/1llagirZ6XPe9kDI57pSzqHB6P_-JGCMilfwVO0xv47E/edit):

> Integrate Playwright with the existing GAS Remote Debugger so users can perform supported Playwright-equivalent browser testing and debugging operations through one CDLD interface on both ordinary Chrome web applications and Google Apps Script applications running inside GAS/OOPIF contexts.

This Objective Lock records and operationalizes the approved project objective; it does not amend or supersede Charter v1.1 or waive its mandatory CORE/Release deliverables. If a specific Objective Lock gate appears to conflict with a Charter obligation, stop and report the conflict for Human/Architect resolution; do not silently override either authority. CDLD remains an integration layer, not a new browser engine or replacement for Playwright.

### Mandatory objective-alignment gate

Before proposing or executing a task, identify the demonstrated supported-capability gap, inspect the relevant current implementation, and establish what Playwright and the existing GAS Remote Debugger already provide. Reuse those capabilities wherever sufficient, then choose the smallest necessary integration. Convenience, technical interest, hypothetical requirements, or additional testing alone do not justify expansion. If objective alignment or required source review is unresolved, hold the task and report the blocker.

Every Architect -> Executor prompt must carry this alignment record:

```text
PROJECT=Chrome-Dual-Layer-Debugger
REPO=nakfreeajer/Chrome-Dual-Layer-Debugger
CHARTER=docs/PROJECT_BRIEF.md@v1.1
OBJECTIVE=CDLD-OBJECTIVE-001 (unchanged)
ALIGNMENT=CORE|BLOCKER|OPTIONAL|DRIFT
TARGET=CORE-01..CORE-07
BASELINE=<exact verified HEAD>
GAP=<specific unsupported capability or demonstrated indispensable blocker>
REUSE=<existing Playwright and GAS Remote Debugger capabilities sufficient to reuse>
MINIMUM_ACTION=<smallest necessary integration or correction>
OUTCOME_TEST=<PROOF: observable result + exact evidence + pass/fail rule>
DECISION=IN_SCOPE|BLOCKED|REJECTED|HUMAN_SCOPE_APPROVAL_REQUIRED
NECESSITY=<why required for the named CORE/BLOCKER>
SIMPLER_ALTERNATIVE=<considered alternative and why insufficient>
SUPPORT_STREAK=<count or HISTORICAL_STOP_TRIGGERED>
FIVE_MILESTONE_CHECKPOINT=<verified state or UNKNOWN>
AUTHORIZATION_TYPE=READ_ONLY|IMPLEMENTATION|LIVE|CHARTER_AMENDMENT|DOCUMENTATION_ONLY
AUTHORIZATION=<specific Human-permitted scope>
STOP=<conditions>
```

For CORE/BLOCKER work, TARGET identifies the directly supported charter deliverable. If a truthful CORE target cannot be identified, classify the proposal as DRIFT and stop rather than dispatching it. OPTIONAL work requires separate prioritization; DRIFT requires Human charter amendment. `DECISION` records the pre-task scope gate; it does not replace `ALIGNMENT` or the Architect's later review classification.

Before every Executor prompt, the Architect freshly verifies exact GitHub `AGENTS.md`, `docs/PROJECT_BRIEF.md`, and `docs/HANDOVER.md`, plus repository identity and HEAD. The Executor independently reads the Objective Lock and verifies that the task directly advances CDLD-OBJECTIVE-001 or resolves a demonstrated indispensable blocker; existing Playwright and GAS Remote Debugger capabilities are reused wherever sufficient; the proposed action is the smallest necessary; no unrelated system, framework, service, launcher, or infrastructure is introduced; and target authorization and proportional safety controls remain intact. The Executor also verifies project/repository identity, Charter revision, baseline, CORE linkage, evidence gap, and permission before work. Identity mismatch returns `PROJECT_ID_MISMATCH`; objective contradiction or unsupported CORE/BLOCKER linkage returns `BLOCKED_OBJECTIVE_DRIFT`. The Executor does not accept its own work or amend the Charter.

After one support-only/BLOCKER milestone without measurable CORE progress, do not automatically authorize another support-only milestone. Directly authorized CORE work remains possible under its own authorization, subject to `HISTORICAL_STOP_TRIGGERED` and any active STOP/REASSESS gate. Further support-only work is allowed only within an already Human-approved bounded batch or a separate explicit Human-approved bounded exception, each with its own attempt budget and fallback. Continue the same investigation only with new evidence and a stopping rule. The existing hard STOP/REASSESS trigger after two consecutive BLOCKER milestones without independently verified CORE advancement remains in force as an additional trigger; after it fires, continuation requires new evidence and a separate explicit Human-approved finite exception with its own attempt budget and fallback. Neither rule waives Charter obligations or existing release restrictions. Names, split stages, reclassification, session changes, and chat handovers never reset the support streak. After every five milestones, including failures/blocked attempts, the Architect records accepted CORE progress, remaining deliverables, supporting effort, blockers/opportunity cost, and next recommendation. Counters persist across handovers.

The historical F36–F49 sequence has already triggered the governance STOP/REASSESS condition. Record `HISTORICAL_STOP_TRIGGERED` until the Human authorizes a separate bounded exception or independently verified CORE progression closes the stop condition. Do not invent a numeric streak or reset. Approval of this charter-adoption task does not authorize resuming F36–F50, a live trial, or another milestone.

One Architect session covers one repository, charter revision, and evidence scope. Work and evidence from another project never become CDLD authority by implication.

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

## Consumer boundary

CDLD is the intended single consumer-facing Chrome/Chromium automation and debugging contract for ordinary Playwright semantics plus supported GAS/OOPIF capabilities, only where each contract is qualified. Playwright and `gas-remote-debug` are internal components. Consumer projects own their application logic, fixtures, test definitions, and business acceptance; they must not duplicate recursive GAS/OOPIF raw-CDP discovery by default. No full Playwright API compatibility or ready public SDK is claimed: `package.json` remains private and a stable external import contract is not yet qualified. A measured gap, bounded alternative, and Human permission are required before any consumer-side raw-CDP exception.
