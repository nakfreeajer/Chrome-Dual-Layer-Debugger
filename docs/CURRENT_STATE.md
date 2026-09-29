# Current State

## Status
V0.1C read-only unified timeline accepted and published. The project now has an appendable normalized JSONL chronology for accepted browser and GAS discovery evidence.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`
- V0.1B/V0.1C dependency baseline: `nakfreeajer/gas-remote-debug@ac4359aa790af19cafe1a7e9a55ecd50f68e9169`
- Language/runtime: TypeScript + Node.js

## Local workspace
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Ignored `.agent-work/` hierarchy remains the local raw-evidence workspace.
- Relay between Executor and Architect-Curator is manual and performed by Rony.

## Architect-Curator verification status
### Local filesystem/bootstrap
`ACCEPTED` on 2026-09-28.

### V0.1A — Browser attachment & read-only discovery
`ACCEPTED` and published at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

### V0.1B — GAS dual-layer coexistence / integration proof
`ACCEPTED` and published at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

### V0.1C — Read-only unified timeline
`ACCEPTED` after independent Architect review of the complete baseline-to-final patch and uploaded live JSONL evidence. Published implementation is visible on GitHub at `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.

Accepted V0.1C capabilities:
- normalized `TraceEvent` model spanning CORE, PLAYWRIGHT, CDP, GAS and TRACE evidence;
- deterministic per-run event IDs `EVENT-000001` onward and strictly increasing sequence numbers;
- ingestion wall-clock timestamps plus preservation of source monotonic timestamps when actually supplied;
- normalized browser context/page/frame/execution-context discovery events;
- normalized GAS target/session/frame/execution-context/runtime-match events preserving dependency-native IDs;
- explicit `MAPPING_PROVEN` and `IDENTITY_UNMAPPED` evidence derived from the accepted V0.1B mapper;
- appendable UTF-8 JSONL, one independently parseable JSON object per line;
- timeline and CLI URL redaction for query values and Apps Script deployment path tokens;
- no page title is persisted in the timeline;
- accepted V0.1A/V0.1B read-only browser safety contract preserved.

Accepted V0.1C validation:
- `npm run check` passed;
- `npm test` passed 19/19 tests;
- baseline-to-HEAD `git diff --check` passed;
- live run produced 40 valid JSONL events with 0 duplicate event IDs, 0 sequence gaps and 0 malformed lines;
- first event was `SESSION_STARTED`; last event was `SESSION_ENDED`;
- live timeline contained 2 proven mapping events and 3 explicit unmapped identity events;
- browser target identities were unchanged before/after disconnect and the endpoint remained responsive;
- URL query values and Apps Script deployment token were verified redacted;
- navigation, reload, click, typing, DOM/storage mutation, page close and browser-process close were all `NO`.

## Established architecture
- Playwright owns ordinary semantic interaction and normal page/frame CDP observation.
- `gas-remote-debug` owns browser-root recursive GAS/OOPIF target/session/context discovery.
- Chrome-Dual-Layer-Debugger owns normalized chronology, debugger-local event identity/order, JSONL persistence and evidence-backed cross-layer mapping.
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
Define the next bounded milestone from the accepted V0.1C baseline. Before adding deeper cross-boundary tracing, preserve the current timeline contract and address run identity if appending multiple debugger runs into one JSONL file is required.

## Unresolved items
- Event IDs are unique only within one debugger run; a fresh run restarts at `EVENT-000001`, so appending multiple runs into one file would need a run/trace namespace before global uniqueness can be claimed.
- Sibling GAS runtime contexts remain intentionally unmapped to Playwright frames when no shared protocol FrameId exists.
- Playwright Page-to-raw-TargetId remains intentionally unmapped through the current public discovery surface.
- `GasAdapter` currently proves one active GAS discovery connection at a time; multi-GAS-tab orchestration has not been established.
- Deterministic `google.script.run` cross-boundary trace propagation remains future work.
