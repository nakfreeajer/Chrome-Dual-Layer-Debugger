# Current State

## Status
V0.1I passive V1 correlation recognizer and RELAY.1A durable prompt artifact foundation are accepted and published. RELAY.1A implementation HEAD: `163b0c008097eb24f1412be31e527f4697d0fc35`. The accepted V0.1E-V0.1I chain established an explicit cooperative correlation contract and a run-scoped fail-closed recognizer. Automatic CLI/network evidence ingestion is not implemented. RELAY.1A adds ignored local prompt artifact persistence; the normal full-prompt manual relay remains active. RELAY.1B is not yet authorized.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`
- Accepted V0.1D implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`
- Accepted V0.1I implementation HEAD: `348dfa6b9c81dbf55233bc87ce05f417973fb61d`
- `gas-remote-debug` dependency baseline: `nakfreeajer/gas-remote-debug@ac4359aa790af19cafe1a7e9a55ecd50f68e9169`
- Language/runtime: TypeScript + Node.js

## Local workspace
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Ignored `.agent-work/` hierarchy remains the local raw-evidence workspace.
- Relay between Executor and Architect-Curator is manual and performed by Rony.

## Architect-Curator verification status
### V0.1A — Browser attachment & read-only discovery
`ACCEPTED` and published at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

### V0.1B — GAS dual-layer coexistence / integration proof
`ACCEPTED` and published at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

### V0.1C — Read-only unified timeline
`ACCEPTED` and published at `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.

### V0.1D — Run / trace identity
`ACCEPTED` after independent Architect review of the complete patch, final report and uploaded two-run JSONL evidence. Published implementation is visible on GitHub at `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.

Accepted V0.1D capabilities:
- each `Timeline` owns exactly one `runId`;
- default run identity uses Node `crypto.randomUUID()` with deterministic constructor injection available for tests;
- `TraceEvent.runId` is required for V0.1D events;
- every event created by one Timeline carries the same immutable run identity;
- `Timeline.append()` rejects events from a different run;
- event numbering remains intentionally per-run (`EVENT-000001` onward);
- the pair `(runId, eventId)` is the unambiguous cross-run event identity;
- JSONL append format remains unchanged and historical V0.1C JSONL was not rewritten;
- CLI exposes the current Run ID;
- no browser, GAS, mapping or redaction behavior was broadened.

Accepted V0.1D validation:
- `npm run check` passed;
- `npm test` passed 22/22 tests;
- baseline-to-HEAD `git diff --check` passed;
- live validation appended two debugger runs into one fresh ignored JSONL file;
- 83 total events across 2 distinct run IDs;
- run 1 contained 41 events and run 2 contained 42 events;
- both runs correctly restarted local event numbering at `EVENT-000001`;
- 41 duplicate raw `eventId` values across the whole file were expected;
- duplicate `(runId,eventId)` pairs: 0;
- malformed JSON lines: 0;
- each run contained exactly one `SESSION_STARTED` and one `SESSION_ENDED`;
- browser target identities remained unchanged and the endpoint remained responsive;
- navigation, reload, click, typing, DOM/storage mutation, page close and browser-process close were all `NO`.

## Established architecture
- Playwright owns ordinary semantic interaction and normal page/frame CDP observation.
- `gas-remote-debug` owns browser-root recursive GAS/OOPIF target/session/context discovery.
- Chrome-Dual-Layer-Debugger owns normalized chronology, run identity, debugger-local event identity/order, JSONL persistence and evidence-backed cross-layer mapping.
- Correlation must be deterministic; timing or URL equality alone is insufficient.
- Unknown relationships remain unknown rather than guessed.

## GAS mode rule
`https://script.google.com/macros/` prefix -> `BROWSER_PLUS_GAS`; otherwise -> `BROWSER_ONLY`.

## Governance state
- Human Owner: Rony Finster.
- Architect-Curator: ChatGPT Architect for this project.
- Executor: bounded Codex execution role.
- There is no automated Orchestrator.
- Relay is manual.

## Accepted correlation chain - V0.1E through V0.1I
- V0.1E established that native browser/CDP identities do not deterministically link a frontend `google.script.run` invocation to GAS execution and its callback; timing, ordering, function name and URL similarity are not correlation authority.
- V0.1F proved in a disposable fixture that an explicit opaque token, paired with the exact CDP requestId, can link client invocation, transport, dedicated GAS execution, response and callback.
- V0.1G found that transparent universal wrapping can change native Apps Script failure semantics, so semantic transparency is not established.
- V0.1H qualified an explicit cooperative, versioned application contract. Native calls remain untouched and uncorrelated; explicit application failures are not native `ScriptError` equivalence.
- V0.1I implemented a passive, run-scoped V1 evidence recognizer. It assigns `correlationId` only after request, response, transport completion and validated completion marker agree. Ordinary traffic remains quiet and uncorrelated.
- V0.1I was accepted and published at `348dfa6b9c81dbf55233bc87ce05f417973fb61d`; deterministic validation passed (`npm run check`, `npm test` 52/52, `git diff --check`). Accepted disposable live validation proved one success and one explicit application failure correlation alongside an untouched ordinary native call.

## Current integration boundary
The recognizer exists, but no production CLI/page/network producer automatically feeds evidence into it. Inputs must already be privacy-reduced. CDP `requestId` is session-scoped; a future multi-session producer must add observer/session scope while preserving native request identity. V1 version authority comes from request `contractVersion === 1` and a validated V1 completion marker; response token equality is required, while response version is not independently parsed. `correlationId` remains absent unless finalization proves the complete evidence chain.

When resumed, the next non-relay debugger integration should be a bounded privacy-limited V1 evidence producer with CDP observer/session scoping and Timeline lifecycle integration. This is a proposed boundary, not authorization to implement it.

## Unresolved items
- Historical V0.1C JSONL lacks `runId`; it remains valid historical evidence and is not migrated by V0.1D.
- Sibling GAS runtime contexts remain intentionally unmapped to Playwright frames when no shared protocol FrameId exists.
- Playwright Page-to-raw-TargetId remains intentionally unmapped through the current public discovery surface.
- `GasAdapter` currently proves one active GAS discovery connection at a time; multi-GAS-tab orchestration has not been established.
- Automatic production CLI/page/network evidence ingestion into the accepted V1 recognizer remains unimplemented.

## Accepted engineering-workflow persistence - RELAY.1A
- RELAY.1A durable prompt artifact foundation was accepted and published at `163b0c008097eb24f1412be31e527f4697d0fc35`.
- Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`, with canonical project `Chrome-Dual-Layer-Debugger` and repository `nakfreeajer/Chrome-Dual-Layer-Debugger`. No `transactionId` was introduced; debugger `runId` remains runtime trace identity.
- Exact prompt Buffer bytes are stored under ignored `.agent-work/prompts/<milestoneId>/<promptSha256>.md`; manifests and lifecycle records are immutable content-addressed JSON. `.agent-work/current/executor-prompt.json` is only a mutable recovery locator, never authority by itself.
- Staging does not authorize execution. Authorization requires an explicit caller-supplied approval reference. Current authorization cannot be displaced by direct authorization; changed decisions require explicit supersession. Revocation and supersession are checked against durable lifecycle evidence and fail closed.
- Verified loading checks locator, manifest, lifecycle, path containment, exact bytes, SHA-256 and byte length. Fresh-store and second-process recovery passed.
- Validation: `npm run check` passed; `npm test` passed 102/102; `git diff --check` passed. The 102 tests include 50 RELAY.1A-focused tests.
- The normal Architect -> Human -> Executor full-prompt relay remains in force. No compact dispatch or auto-execution exists; RELAY.1B is not yet authorized.
