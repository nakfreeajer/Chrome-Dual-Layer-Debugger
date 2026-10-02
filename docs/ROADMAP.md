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

## Next bounded integration - NOT AUTHORIZED
If resumed, evaluate a privacy-limited V1 evidence producer, CDP observer/session scoping and Timeline lifecycle integration. The recognizer currently has no automatic CLI/page/network evidence ingestion. Selecting this boundary does not authorize implementation.

## Later, not yet authorized for implementation
- Automatic evidence production and session-scoped integration for the accepted V1 recognizer.
- GAS server-side tracing adapter details beyond the proven `gas-remote-debug` composition boundary.
- Multi-GAS-tab orchestration beyond the single active GAS discovery proof.
- Optional Playwright native trace integration if evidence shows value alongside JSONL.
- UI/visual timeline.
- Breakpoints or powerful mutation/control features.
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
