# Current State

## Status
V0.1B GAS dual-layer coexistence/integration proof accepted and published; ready for the read-only unified timeline milestone.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`
- V0.1B dependency baseline: `nakfreeajer/gas-remote-debug@ac4359aa790af19cafe1a7e9a55ecd50f68e9169`
- Language/runtime: TypeScript + Node.js

## Local workspace
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Ignored `.agent-work/` hierarchy remains the local raw-evidence workspace.
- Relay between Executor and Architect-Curator is manual and performed by Rony.

## Architect-Curator verification status
### Local filesystem/bootstrap
`ACCEPTED` on 2026-09-28.

### V0.1A — Browser attachment & read-only discovery
`ACCEPTED` on 2026-09-28 and published at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

### V0.1B — GAS dual-layer coexistence / integration proof
`ACCEPTED` on 2026-09-28 after independent Architect review of the complete baseline-to-final patch and bounded live coexistence evidence. Published remote implementation is visible on GitHub at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

Accepted V0.1B capabilities:
- commit-pinned Git dependency on `gas-remote-debug` at `ac4359aa790af19cafe1a7e9a55ecd50f68e9169` because no npm-published package exists;
- `GasAdapter` activates only when the exact `https://script.google.com/macros/` prefix rule selects `BROWSER_PLUS_GAS`;
- browser-root target/session/context discovery is delegated to `gas-remote-debug` rather than duplicated;
- Playwright and `gas-remote-debug` can remain simultaneously connected to the same already-running browser;
- dependency-native TargetId, SessionId, FrameId and ExecutionContextId evidence is preserved;
- cross-layer mapping is accepted only for exact shared protocol FrameId evidence plus matching dependency target/session context evidence;
- unsupported relationships remain explicitly `UNMAPPED`;
- disconnect preserved the existing browser process and target set in live validation.

Accepted V0.1B validation:
- primary `npm run check` passed;
- primary `npm test` passed: 13/13 tests;
- dependency `npm test` passed: 94/94 tests;
- `git diff --check` passed;
- live proof observed 1 Playwright context/page/frame and dependency discovery of 2 targets, 2 sessions and 3 execution contexts;
- exact root FrameId mapping was proven to dependency context 25;
- sibling sandbox contexts 3 and 1 remained unmapped to Playwright frames;
- Playwright Page-to-raw-TargetId remained unmapped because the public Playwright discovery surface does not expose TargetId;
- a second Playwright discovery succeeded while `GasAdapter` remained connected;
- before/after target identities were unchanged and the endpoint remained responsive;
- no navigation, reload, click, typing, DOM/storage mutation, page close, or browser-process close occurred.

## Established architecture
- Playwright owns ordinary semantic interaction and normal page/frame CDP observation.
- `gas-remote-debug` owns browser-root recursive GAS/OOPIF target/session/context discovery.
- Chrome-Dual-Layer-Debugger owns layer selection, composition, debugger-local identities, cross-layer evidence mapping, and future unified chronology.
- Correlation must be evidence-backed; timing or URL equality alone is insufficient.
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
Define and execute V0.1C: Read-Only Unified Timeline.

V0.1C should normalize already-proven browser and GAS observations into the shared trace model and appendable JSONL output while preserving source-native timestamps and leaving cross-layer events uncorrelated unless deterministic evidence links them.

## Unresolved items
- Sibling GAS runtime contexts remain intentionally unmapped to Playwright frames when no shared protocol FrameId exists.
- Playwright Page-to-raw-TargetId remains intentionally unmapped through the current public discovery surface.
- `GasAdapter` currently proves one active GAS discovery connection at a time; multi-GAS-tab orchestration has not been established.
- Whether optional Playwright native tracing is useful alongside the JSONL unified timeline remains a future evidence-based decision.
