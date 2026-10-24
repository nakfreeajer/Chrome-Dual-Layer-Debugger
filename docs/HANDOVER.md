# Handover

## Role
Architect-Curator for Chrome-Dual-Layer-Debugger.

## Authority
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is final Human authority. ChatGPT is the Architect-Curator for this project. There is **no automated Orchestrator**. Rony manually relays bounded prompts, Executor reports, correction instructions, and documentation-closure requests.


## External review action register — read on every handover (2026-10-24)

The persistent external-review backlog is [docs/EXTERNAL_REVIEW_ACTION_REGISTER.md](EXTERNAL_REVIEW_ACTION_REGISTER.md) and its nine tracked GitHub Issues [#1–#9](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues). **P0:** [#1 TEST authorization](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/1) and [#2 remote CDP mutation endpoints](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/2) require a full read-only source audit; the reviews and parser spot-checks do not prove complete downstream failure. The next proposed task, `CDLD.TEST.AUTHORIZATION.ENDPOINT.BOUNDARY.AUDIT.1A`, is **not automatically authorized**. Check unresolved issue state before proposing or starting any milestone; preserve the original Charter and do not let tracking artifacts reset F36 INCONCLUSIVE/EXHAUSTED, HISTORICAL_STOP_TRIGGERED, CORE-04 live acceptance, CORE-06/07 or Release 1. Closure requires evidence and an explicit Architect disposition; do not close findings simply because the register exists.

## Read first
1. `AGENTS.md`
2. `docs/PROJECT_BRIEF.md`
3. `docs/CURRENT_STATE.md`
4. `docs/DECISIONS.md`
5. `docs/ARCHITECTURE.md`
6. `docs/ROADMAP.md`
7. `docs/AGENT_WORKFLOW.md`
8. `docs/VALIDATION.md`

## Current accepted baseline
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Project Charter v1.1 was Human-approved 2026-10-21. Alignment baseline: `31a31a4b05fbe46d7d8806ac0fd5e12227fb1583`.
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`.
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.
- Accepted V0.1D implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.
- Accepted V0.1I implementation HEAD: `348dfa6b9c81dbf55233bc87ce05f417973fb61d`.
- Accepted combined V0.1J/V0.1K implementation HEAD: `9e6998488b02e5493f4a4b34e6c0b60b8d193465`.
- Accepted RELAY.1A implementation HEAD: `163b0c008097eb24f1412be31e527f4697d0fc35`.
- Accepted RELAY.1B implementation HEAD: `85310e450705e1671ef9e6af22eeae6d9dbcc519`.
- Current `package.json` pins `gas-remote-debug` to `75462b81c55c6c113e552dcd5544949bd765e90a`; older historical documentation names a different pin and is not authority for current dependency state.

## Objective Lock — session carryover

Use only project Chrome-Dual-Layer-Debugger, repository `nakfreeajer/Chrome-Dual-Layer-Debugger`, and the Human-approved Charter `docs/PROJECT_BRIEF.md@v1.1`; verify the exact current baseline and clean worktree for each bounded task. Every proposed milestone needs the required alignment record: classification, CORE target, measured gap, measurable result, exact acceptance evidence, authorization, stop conditions, and persistent support-streak state.

### Current charter-linked gaps

- CORE-06 Replayable Regression Suites source is present at `309f451b2edad6e844e8c58ba113c7cadc4ea7f9`; formal acceptance remains unresolved. Do not label it accepted from source presence alone.
- CORE-07 remains a Release 1 blocker until authorization, containment, ownership, and cleanup are independently verified for every declared supported execution lifecycle.
- F36 is INCONCLUSIVE / EXHAUSTED. Cause, ownership and cleanup uncertainties remain UNKNOWN. F47–F49 are offline/design evidence only; they do not create live permission or require cloud authorization work.
- CORE-04 Release 1 baseline remains 19 common operations. Double-click, right-click, drag/drop, file input, and cross-backend screenshot parity remain tracked post-release requirements.

The F36–F49 history has triggered STOP/REASSESS. Carry `HISTORICAL_STOP_TRIGGERED`; the consecutive numeric count and five-milestone checkpoint are unverified and must be reconciled, never reset or invented. Approval of charter adoption does not authorize resuming F36→F50, starting a live attempt, or continuing the same investigation. Only new evidence plus explicit Human permission and a bounded stop rule can support an exception.

No session, relay, milestone-name, or project switch resets these records. After each five milestones, including failed/blocked work, the Architect documents independently accepted CORE progress, remaining deliverables, supporting effort, blockers/opportunity cost, and a next recommendation.

## Accepted capability
V0.1A established low-intrusion Playwright browser discovery. V0.1B established safe coexistence with `gas-remote-debug` and deterministic evidence-backed mapping. V0.1C normalized those observations into appendable read-only JSONL. V0.1D adds explicit debugger-run identity so multiple runs can coexist in one JSONL file without ambiguous event identity.

Accepted V0.1D behavior:
- one immutable `runId` per `Timeline`;
- default run IDs from Node `crypto.randomUUID()`;
- deterministic constructor injection available for tests;
- required `TraceEvent.runId` on newly emitted V0.1D events;
- per-run event numbering still starts at `EVENT-000001`;
- `(runId,eventId)` is the unambiguous cross-run event key;
- `Timeline.append()` rejects foreign-run events;
- JSONL format and append behavior remain unchanged;
- historical V0.1C JSONL is not rewritten or migrated;
- CLI prints the active Run ID;
- accepted URL redaction and read-only browser behavior remain intact.

Accepted validation included typecheck, 22/22 tests, clean baseline-to-HEAD diff check, and a live two-run append proof containing 83 valid JSONL events across two distinct run IDs. Each run restarted at `EVENT-000001`, duplicate raw event IDs were expected, duplicate `(runId,eventId)` pairs were zero, every run had one session start/end, browser targets were unchanged, and the endpoint remained responsive.

## Accepted correlation chain - V0.1E through V0.1I
V0.1E found native browser/CDP identity insufficient for deterministic frontend-to-GAS-to-callback correlation. V0.1F proved exact opaque-token propagation in a disposable fixture when paired with the native CDP requestId. V0.1G showed universal transparent runner wrapping can change native `ScriptError` failure semantics. V0.1H therefore qualified explicit cooperative, versioned application participation. V0.1I implemented and published a passive, run-scoped V1 recognizer at `348dfa6b9c81dbf55233bc87ce05f417973fb61d` (52/52 tests).

The recognizer fails closed and assigns `correlationId` only after exact requestId/token/response/transport/completion-marker evidence agrees. Request version 1 and completion-marker version 1 are authoritative; token prefixes do not establish version, and response token equality is required. Ordinary native calls remain untouched and uncorrelated. Explicit application failures are not native `ScriptError` equivalence.

V0.1J/V0.1K now provide opt-in privacy-limited CLI evidence production: Playwright/page-scoped Network request/response/terminal evidence plus raw child/OOPIF Runtime completion markers feed the same V0.1I recognizer. The CLI option is `--observe-v1-ms`; default behavior remains non-observing. `requestId` and `observerScopeId` remain distinct. Playwright Page console is not production marker authority. No browser diagnostic remains pending.

Do not repeat these conclusions or approaches:
- Do not rediscover whether explicit token propagation works.
- Do not attempt universal transparent `google.script.run` wrapping.
- Do not infer correlation from timing, ordering, function names or URL similarity.
- Do not treat a token prefix as contract-version evidence.
- Do not assign `correlationId` before complete proof.

## Architecture baseline
- Project is independent from AFFOTECH and other projects.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS activation remains only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline, run identity and correlation ownership belong to Chrome-Dual-Layer-Debugger.
- Unknown relationships must remain unknown until deterministically proven.

## RELAY.1A durable prompt artifact foundation
RELAY.1A stores exact prompt bytes under ignored `.agent-work/prompts/<milestoneId>/<promptSha256>.md`, with immutable manifests/lifecycle evidence and a mutable current locator. Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`; no transactionId exists, and debugger runId is not workflow identity. Hash and byte length cover exact Buffer bytes without normalization.

Staging is not authorization. Explicit approval references are required. Active authorization cannot be displaced through direct authorization; supersession is explicit, and revocation/supersession/corrupt state are verified fail-closed from durable evidence. The locator is a recovery pointer, not authority. No automatic dispatch or prompt execution is active. Compact descriptor transport remains accepted optional tooling, not the current default handoff.

Current substantial task transport uses a complete Google Drive task document and a short chat launcher. Rony manually relays the task. RELAY.1B descriptor transport may be used when specifically selected; it is not the default. Executor -> Architect report/evidence relay remains manual. No automated dispatcher or prompt execution exists. Transport choices do not change the Human -> Architect-Curator -> bounded Executor authority model.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner transports bounded Executor reports/evidence to the Architect-Curator. Do not require an automated bridge, watcher, doorbell, or orchestrator state.

## What must not be repeated
- Do not recreate the repository or local bootstrap without direct regression evidence.
- Do not rebuild accepted V0.1A browser attachment/discovery absent direct regression evidence.
- Do not duplicate `gas-remote-debug` recursive discovery.
- Do not replace the accepted commit-pinned dependency boundary casually.
- Do not infer Playwright/GAS relationships from timestamps or URL equality alone.
- Do not reopen intentionally unmapped sibling GAS contexts merely because they are unmapped.
- Do not redesign the accepted V0.1C timeline or V0.1D run identity without direct regression evidence.

## Accepted V0.1J/V0.1K closure
The combined producer and raw child/OOPIF marker fusion is accepted and published at `9e6998488b02e5493f4a4b34e6c0b60b8d193465`; validation passed at 178/178 tests. The live Brave diagnostic is complete, cleanup was verified, and no further browser diagnostic is pending. The next work, if any, must come from existing roadmap/governance and a separate bounded authorization; this closure does not invent another milestone.

No automatic dispatch or execution is introduced. The current default is manual Google Drive relay: Architect stores the complete bounded task in Google Drive and sends a short chat launcher; Rony manually relays it to Executor. RELAY.1B compact descriptor transport remains accepted optional tooling and applies only when explicitly selected. Executor -> Architect evidence return remains manual.

Do not jump directly to GUI work, breakpoints, destructive browser controls, broad automation, or unbounded server instrumentation.

## V0.1J/V0.1K implementation boundary
- Playwright/page-scoped Network owns privacy-limited request, response and transport-terminal evidence.
- Raw child/OOPIF Runtime owns exact cooperative completion-marker observation only.
- The existing V0.1I recognizer remains the only correlation proof authority; Page console is diagnostic, not proof.
- Collection is opt-in with `--observe-v1-ms`. Do not correlate by timing, order or frame proximity.

## Charter v1.1 consumer boundary
CDLD is intended as one consumer-facing advanced Playwright-based Chrome/Chromium automation and debugging layer, adding supported GAS/OOPIF access through the existing adapter. Consumer projects own app-specific tests, fixtures, and acceptance. `gas-remote-debug` remains the GAS discovery engine behind `GasAdapter`; consumer projects should not duplicate it without a measured gap and bounded Human-approved exception. The current package is private and has no verified public import/export contract; do not claim drop-in Playwright replacement.

The intended consumer entry point is not yet independently qualified. Existing source/CLI presence is not independent-consumer evidence. Consumer integration qualification and formal CORE-06/CORE-07 acceptance remain pending. The 19 common Release 1 operations and five deferred capabilities are unchanged.

Latest evidence pointers: the PAGE.1D Executor report classifies the overall run `INCONCLUSIVE_CLEANUP` because the complete final target digest set was not retained, despite the reported single PAGE case and assertion passing. The shared Brave 9444 snapshot report says `OBSERVED_READONLY_BASELINE_AWAITING_ARCHITECT_REVIEW`; the approved alignment plan treats it as a baseline reference. It does not prove lifecycle stability or authorize use. F36 remains `INCONCLUSIVE / EXHAUSTED`, with cause/ownership/cleanup uncertainties `UNKNOWN`; `HISTORICAL_STOP_TRIGGERED` remains and numeric checkpoint state is `UNKNOWN`.
