# Roadmap

Only accepted near-term sequencing belongs here. Exploratory ideas remain in `IDEA_INBOX.md`.

## Foundation — COMPLETE
- Establish AMO-inspired manual-relay governance and filesystem.
- Keep project architecture/docs authoritative in GitHub.
- Keep raw working evidence under ignored `.agent-work/`.

## V0.1A — Browser Attachment & Read-Only Discovery — ACCEPTED
- Attach read-only to an already-running Chromium-family browser through configurable Playwright `connectOverCDP()`.
- Enumerate contexts/pages/URLs/frames and public page/frame CDP evidence.
- Preserve stable debugger-local identities and low-intrusion disconnect behavior.

Accepted implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

## V0.1B — GAS Dual-Layer Coexistence / Integration Proof — ACCEPTED
- Compose the accepted Playwright path with commit-pinned `gas-remote-debug` at `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`.
- Preserve dependency-native target/session/frame/execution-context evidence.
- Promote only deterministic cross-layer mappings and keep unsupported relationships explicitly unmapped.
- Preserve the V0.1A read-only safety contract.

Accepted implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

## V0.1C — Read-Only Unified Timeline — ACCEPTED
- Normalize accepted browser and GAS observations into the shared `TraceEvent` model.
- Assign deterministic per-run event IDs and strictly increasing sequence ordering.
- Preserve wall-clock timestamps and source monotonic timestamps where actually available.
- Normalize browser, GAS, proven-mapping and explicit-unmapped evidence without synthesizing unsupported identities.
- Write appendable UTF-8 JSONL, one event per line.
- Redact URL query values and Apps Script deployment path tokens from persisted/CLI evidence.
- Preserve the V0.1A/V0.1B read-only browser safety contract.

Accepted implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.

## V0.1D — Run / Trace Identity — ACCEPTED
- Add one explicit immutable `runId` per debugger Timeline/run.
- Generate default run IDs with Node `crypto.randomUUID()` while allowing deterministic injection for tests.
- Require `runId` on newly generated trace events.
- Preserve per-run `EVENT-000001` numbering rather than creating global counters.
- Define `(runId,eventId)` as the unambiguous event identity across appended runs.
- Reject foreign-run events when appended to a Timeline.
- Keep JSONL append format unchanged and leave historical V0.1C evidence untouched.
- Preserve accepted redaction, mapping and browser/GAS read-only behavior.

Accepted implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.

## V0.1E - Google.script.run Correlation Discovery - ACCEPTED / CLOSED
- Native browser/CDP identity did not deterministically link frontend invocation, GAS execution and callback.
- Timing, ordering, function name and URL similarity were rejected as correlation authority.
- Conclusion: `PROPAGATED_CORRELATION_ID_REQUIRED`.

## V0.1F - Disposable Correlation-Token Fixture Proof - ACCEPTED / CLOSED
- A disposable fixture proved exact opaque-token propagation through client invocation, CDP request/response, dedicated GAS execution and callback, with native CDP requestId pairing.
- Success and controlled failure were proven without timing/order inference.
- Conclusion: `PROPAGATED_TOKEN_END_TO_END_PROVEN`.

## V0.1G - Opt-In Instrumentation Compatibility Proof - ACCEPTED / CLOSED
- Transparent wrapping could correlate concurrent calls but changed failure behavior relative to native Apps Script `ScriptError` semantics.
- Universal transparent wrapping was rejected as semantically unsafe.
- Conclusion: `CORRELATION_WORKS_BUT_SEMANTICS_UNSAFE`.

## V0.1H - Explicit Token-Aware Application Contract - ACCEPTED / CLOSED
- Qualified an explicit cooperative, versioned contract; ordinary native calls remain untouched and non-opted-in calls remain uncorrelated.
- Explicit application failure does not claim native `ScriptError` equivalence.
- Conclusion: `EXPLICIT_CONTRACT_PROVEN_WITH_LIMITATIONS`.

## V0.1I - Passive V1 Correlation Recognizer - ACCEPTED / CLOSED
- Implemented run-scoped exact evidence joining with fail-closed finalization and privacy-reduced inputs.
- `correlationId` is assigned only after request, response, transport completion and completion marker agree; ordinary traffic remains quiet and uncorrelated.
- Accepted implementation HEAD: `348dfa6b9c81dbf55233bc87ce05f417973fb61d`.
- Accepted validation: typecheck passed; 52/52 tests passed; `git diff --check` passed; disposable live proof covered success, explicit failure and an ordinary uncorrelated call.

## V0.1J - Privacy-Limited V1 Evidence Producer - ACCEPTED / CLOSED
- Added opt-in CLI production of privacy-reduced V1 request/response/transport evidence and Timeline correlation events.
- Accepted as part of the combined V0.1J/V0.1K implementation at `9e6998488b02e5493f4a4b34e6c0b60b8d193465`.

## V0.1K - Raw Child/OOPIF Marker Fusion - ACCEPTED / CLOSED
- Added exact raw child/OOPIF Runtime completion-marker observation and fused it with Playwright Network evidence through the same V0.1I recognizer.
- Live validation passed with explicit fixture gating, four ready controls, two exact proofs, quiet ordinary native traffic, stable target identity and verified cleanup.
- Combined validation: `npm run check` PASS; `npm test` 178/178 PASS; `git diff --check` PASS.
- No browser diagnostic remains pending. Further work must follow existing roadmap governance and receive separate bounded authorization.

## Product objective - Debugger + Active Test System

CDLD is intended to become a cross-layer debugger and active browser/GAS testing system. Passive observation is the safety default, not the final product boundary. Active mutation must run only under an explicitly authorized test mode against a designated test target.

The active-testing track builds on the accepted V0.1 evidence architecture rather than bypassing it. Playwright performs semantic actions; existing Network/RAW-CDP/GAS evidence remains responsible for explaining what each action caused.

## TEST.1A - Dual-Backend Capability Contract and Parity Foundation - ACCEPTED / CLOSED

TEST.1A implemented one reusable CDLD action/assertion contract across Playwright and GAS/OOPIF. On a disposable local OOPIF in Brave 9444, the same 31-step scenario was run through both backends with equivalent normalized outcomes, expected fixture effects and passing/failing assertion behavior.

Capability matrix: 19 common operations `PASS`; four `GAP` (double-click, right-click, drag/drop, file input); screenshot `BACKEND_SPECIFIC` for Playwright and `GAP` for GAS_OOPIF. TEST.1A did not deliver monkey generation, production/business testing, or generalized fixture management.

## TEST.1B - Controlled Smoke Scenario Runner - ACCEPTED / CLOSED

- Published implementation: `9f54b116f20fa56246546602b26d47eb519ac77a` (parent `37fba3c5dcc1f904c7333d72ea989b85853b3374`), `feat(testing): add controlled smoke scenario runner`.
- Adds strict declarative `schemaVersion: 1` scenarios, explicit CLI/backend/endpoint/approval, complete scenario validation before mutation, runner-owned page/session, exact PAGE or FRAME scope, ordered Timeline results, stop-on-first-failure, and cleanup.
- Approval and TEST intent are validated before page creation/navigation; target-bound authorization remains enforced after exact selection. PAGE uses `PAGE-*`; FRAME uses the selected public Playwright Frame with a unique accepted normalized identity or stable debugger-local `PLAYWRIGHT-FRAME-*` (not a protocol FrameId). GAS_OOPIF remains bound to exact dependency-native target/session/context.
- Validation: `npm run check` PASS; `npm test` 214/214 PASS; `git diff --check` PASS.
- Accepted Brave 9444 live matrix: PLAYWRIGHT and GAS_OOPIF pass each completed 8 steps and exited 0; deterministic assertion failures exited 2 before the later click. Existing target stayed unchanged, runner pages closed, local fixture server stopped, ports 4558/4564 closed, temporary fixture removed, and Timeline privacy checks passed.
- Only the capability matrix and this bounded fixture qualification support parity claims. No production/business target or external GAS deployment was used.

## TEST.1C - Bounded Monkey / Exploratory Action Engine - ACCEPTED / CLOSED

TEST.1C delivers a strict declarative profile and bounded deterministic exploratory engine for explicitly authorized TEST targets. `TEST1C_GEN_V1` plus an explicit seed and validated profile produce a backend-neutral ordered plan before execution. Only mutating capabilities marked PASS for both PLAYWRIGHT and GAS_OOPIF are eligible. Profile validation precedes runner-owned page creation/navigation; execution is bounded by maxActions, duration, and action timeouts and stops on the first failure or safety violation. The engine preserves exact runner-owned PAGE/FRAME ownership, privacy-reduced Timeline/replay evidence, and the V0.1I single correlation proof authority.

Containment is enforced on every navigation request: the runner-owned page main-frame origin is checked independently, and FRAME scope additionally checks the selected-frame origin. The request latch fails before another generated action can start. GAS_OOPIF FRAME scope includes the accepted fixed 50 ms event-delivery drain before final containment recheck; this is bounded safety synchronization, not correlation authority. Live qualification passed safe PLAYWRIGHT/GAS_OOPIF parity, exact PLAYWRIGHT replay, selected-frame escape containment, and FRAME-scoped top-level PAGE escape containment on both backends. Source commit: `7e6afb8a2ebf2b4672762c1eb01493e53b7b5d37`; validation: `npm run check` PASS, `npm test` 238/238 PASS, `git diff --check` PASS.

TEST.1D, TEST.1E, and TEST.1F remain PLANNED / NOT AUTHORIZED. No later milestone is automatically authorized by this closure.

## TEST.1D - Assertions and Failure Artifacts - PLANNED / NOT AUTHORIZED

- Expand common assertion vocabulary and structured failure reporting.
- Capture bounded screenshots/DOM/runtime facts where privacy policy permits.
- Link failed assertion evidence to action steps and proven correlation events without conflating identities.

## TEST.1E - Test Fixture / Reset / Cleanup Governance - PLANNED / NOT AUTHORIZED

- Define disposable data setup, reset and teardown contracts.
- Distinguish synthetic fixtures from real application/business data.
- Require cleanup verification for mutating test runs.

## TEST.1F - Replayable Regression Suites - PLANNED / NOT AUTHORIZED

- Persist deterministic smoke/monkey reproductions as reusable suites.
- Run the same suite through either eligible backend where parity is declared.
- Compare expected UI/backend outcomes while tolerating only explicitly defined nondeterministic fields.
- Produce suite-level and step-level PASS/FAIL evidence.

## Later, not yet authorized for implementation
- GAS server-side tracing adapter details beyond the proven `gas-remote-debug` composition boundary.
- Multi-GAS-tab orchestration beyond the single active GAS discovery proof.
- Optional Playwright native trace integration if evidence shows value alongside JSONL.
- UI/visual timeline.
- Breakpoints and other debugger-control features beyond the explicitly authorized active-testing track.
- Additional backend adapters.

## RELAY.1A - Durable Prompt Artifact Foundation - ACCEPTED
- Published implementation HEAD: `163b0c008097eb24f1412be31e527f4697d0fc35`.
- Added exact-byte, content-addressed local prompt artifacts under ignored `.agent-work/`, immutable manifests and lifecycle records, explicit authorization, revocation, supersession and fail-closed verified loading/recovery.
- Validation: `npm run check`; `npm test` 102/102; `git diff --check`.
- At RELAY.1A publication, full-prompt manual relay remained the procedure; RELAY.1A did not change transport or execute prompts. RELAY.1B later activated compact descriptor transport through a separate documentation closure; the subsequent governance simplification retired it as the default operating workflow without invalidating its technical implementation.

## RELAY.1B - Compact Executor Relay - ACCEPTED / CLOSED
- Published implementation HEAD: `85310e450705e1671ef9e6af22eeae6d9dbcc519`.
- Added strict V1 compact identity descriptor and import/supersede/revoke/resolve CLI over RELAY.1A.
- The Architect-provided exact prompt file is verified against descriptor SHA-256 and byte length before store mutation; Executor resolution independently checks verified authorization/lifecycle and emits exact prompt bytes only.
- Validation: `npm run check` PASS; `npm test` 148/148 PASS; `git diff --check` PASS; process-level exact-byte import/resolve and zero-stdout mismatch proof passed.
- At RELAY.1B acceptance, compact descriptor transport became the normal Architect -> Executor workflow. Current governance later superseded that default with full substantial task documents in Google Drive and short chat launchers. RELAY.1A/1B remains accepted optional tooling. Human relay and Executor -> Architect evidence return remain manual; there is no automatic dispatch or execution.
