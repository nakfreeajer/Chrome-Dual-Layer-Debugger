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

## Next bounded milestone — TO SELECT
The timeline now has explicit cross-run identity. The next milestone should be selected based on a concrete debugging need rather than continuing infrastructure automatically.

A likely future direction is deterministic cross-boundary tracing of application calls through `google.script.run`, but that work should first establish a narrow evidence contract for linking frontend invocation, GAS execution and frontend callback/failure without timing-based guesses.

Do not mix that work with GUI, breakpoints, browser mutation or broad server instrumentation.

## Later, not yet authorized for implementation
- Deterministic cross-boundary trace propagation through `google.script.run`.
- GAS server-side tracing adapter details beyond the proven `gas-remote-debug` composition boundary.
- Multi-GAS-tab orchestration beyond the single active GAS discovery proof.
- Optional Playwright native trace integration if evidence shows value alongside JSONL.
- UI/visual timeline.
- Breakpoints or powerful mutation/control features.
- Additional backend adapters.
