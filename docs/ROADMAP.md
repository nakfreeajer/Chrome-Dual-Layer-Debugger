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

The active-testing track must build on the accepted V0.1 evidence architecture rather than bypass it. Playwright performs semantic actions; existing Network/RAW-CDP/GAS evidence remains responsible for explaining what each action caused.

## TEST.1A - Controlled GAS Smoke Test Runner - AUTHORIZED / NEXT

Goal: prove a minimal deterministic active-test loop against a disposable or explicitly designated GAS web application.

Required capability:
- explicit TEST mode, separate from normal observation mode;
- attach to an already-running authorized Chromium-family browser;
- navigate only to the explicitly supplied disposable/test GAS target;
- reuse Playwright locator/actionability semantics rather than implement a second selector/wait/click engine;
- delegate supported browser actions to Playwright primitives, including fill/type, click, select/check, hover, keyboard and scrolling as required by the scenario;
- use Playwright web-first assertion/retry behavior where practical rather than create ad-hoc polling;
- preserve a thin CDLD action/assertion wrapper only for safety policy, stable step identity, Timeline evidence and normalized reporting;
- keep the scenario representation project-independent so AFFOTECH and other projects provide small scenario files rather than browser-control implementations;
- evaluate Playwright codegen/locator generation as an optional authoring aid, not as runtime proof authority;
- run the existing V1 observer concurrently when cooperative evidence is available;
- preserve native requestId, observerScopeId and correlationId separation;
- emit action-start/action-result/assertion-result evidence into the same run Timeline without turning action identity into correlation authority;
- produce a structured scenario PASS/FAIL result;
- on failure, retain privacy-reduced diagnostic evidence sufficient to identify the failed step;
- ordinary native GAS traffic may be tested at the UI level but remains uncorrelated unless the cooperative V1 contract supplies proof;
- no monkey/random action generation in TEST.1A;
- no production/business target testing;
- no silent use of an existing user tab;
- no browser-process shutdown.

TEST.1A live validation must use a disposable fixture or another Human-authorized test application and must prove both a passing scenario and at least one deterministic assertion failure without weakening the accepted V0.1 recognizer.

## TEST.1B - Bounded Monkey / Exploratory Action Engine - PLANNED

- Generate actions only inside an explicit allowlisted interaction surface.
- Support bounded random seeds for exact replay.
- Record every generated action before execution.
- Enforce action/time/count limits and forbidden-target rules.
- Capture the reproducible seed and failure evidence.
- Never use timing/order as cross-layer correlation authority.

## TEST.1C - Assertions and Failure Artifacts - PLANNED

- Expand assertion vocabulary and structured failure reporting.
- Capture bounded screenshots/DOM facts only where privacy policy permits.
- Link failed assertion evidence to the action step and proven correlation events without conflating their identities.

## TEST.1D - Test Fixture / Reset / Cleanup Governance - PLANNED

- Define disposable data setup, reset and teardown contracts.
- Distinguish synthetic fixtures from real application/business data.
- Require cleanup verification for mutating test runs.

## TEST.1E - Replayable Regression Suites - PLANNED

- Persist deterministic smoke/monkey reproductions as reusable suites.
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
- At RELAY.1A publication, full-prompt manual relay remained the procedure; RELAY.1A did not change transport or execute prompts. RELAY.1B later activated compact descriptor transport through a separate documentation closure.

## RELAY.1B - Compact Executor Relay - ACCEPTED / CLOSED
- Published implementation HEAD: `85310e450705e1671ef9e6af22eeae6d9dbcc519`.
- Added strict V1 compact identity descriptor and import/supersede/revoke/resolve CLI over RELAY.1A.
- The Architect-provided exact prompt file is verified against descriptor SHA-256 and byte length before store mutation; Executor resolution independently checks verified authorization/lifecycle and emits exact prompt bytes only.
- Validation: `npm run check` PASS; `npm test` 148/148 PASS; `git diff --check` PASS; process-level exact-byte import/resolve and zero-stdout mismatch proof passed.
- Compact descriptor transport becomes the normal Architect -> Executor workflow after this documentation closure. Full-prompt chat copy is fallback only. Human transport/approval and Executor -> Architect evidence return remain manual. There is no automatic dispatch or execution.
