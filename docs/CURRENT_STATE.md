# Current State

## Status
V0.1D run/trace identity accepted and published. The unified JSONL timeline can now append multiple debugger runs without ambiguity by pairing required `runId` with the existing per-run `eventId`.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`
- Accepted V0.1D implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`
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

## Next engineering step
Select the next bounded milestone from the accepted V0.1D baseline. Deeper cross-boundary tracing through `google.script.run` remains a separate future milestone and must preserve the accepted read-only and evidence-only correlation contracts.

## Unresolved items
- Historical V0.1C JSONL lacks `runId`; it remains valid historical evidence and is not migrated by V0.1D.
- Sibling GAS runtime contexts remain intentionally unmapped to Playwright frames when no shared protocol FrameId exists.
- Playwright Page-to-raw-TargetId remains intentionally unmapped through the current public discovery surface.
- `GasAdapter` currently proves one active GAS discovery connection at a time; multi-GAS-tab orchestration has not been established.
- Deterministic `google.script.run` cross-boundary trace propagation remains future work.
