# Current State

## Status
V0.1A browser attachment/read-only discovery accepted and published; ready for the first bounded GAS coexistence milestone.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- V0.1A implementation commits:
  - `aa886de935678e48f1f8a424728c6711dd701586` — `Implement read-only browser discovery`
  - `f1cf95158eba7342d627a5526f04766b24c1d5d2` — `Correct low-intrusion discovery identities`
- Language/runtime: TypeScript + Node.js

## Local workspace
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Local workspace was cloned from the authoritative repository during the accepted bootstrap.
- Ignored `.agent-work/` hierarchy is the local raw-evidence workspace.
- Relay between Executor and Architect-Curator is manual and performed by Rony.

## Architect-Curator verification status
### Local filesystem/bootstrap
`ACCEPTED` on 2026-09-28.

### V0.1A — Browser attachment & read-only discovery
`ACCEPTED` on 2026-09-28 after independent Architect review of the complete baseline-to-final patch and bounded live evidence.

Published remote implementation is now visible on GitHub at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

Accepted V0.1A capabilities:
- configurable Chromium CDP endpoint;
- Playwright `chromium.connectOverCDP()` attachment;
- low-intrusion connection options with `noDefaults: true` and loopback-only `isLocal: true`;
- context/page/frame enumeration;
- current URL and page-title discovery;
- deterministic layer classification using only the `https://script.google.com/macros/` prefix rule;
- Playwright-backed public `CDPSession` observation with `Page` and `Runtime` enabled;
- `Page.getFrameTree` frame discovery;
- execution-context ID capture from `Runtime.executionContextCreated`;
- stable debugger-local Context/Page/Frame IDs across repeated discovery passes within one connection;
- disconnect behavior proven to leave the existing browser process and target set intact in the accepted live validation.

Accepted V0.1A validation:
- `npm run check` passed;
- `npm test` passed: 8/8 tests;
- `git diff --check` passed;
- two discovery passes retained `CONTEXT-0001`, `PAGE-0001`, and `FRAME-0001` for the same live identities;
- before/after target snapshots were unchanged;
- CDP endpoint remained responsive after disconnect;
- no navigation, click, typing, reload, DOM mutation, storage mutation, page close, or browser-process close occurred;
- `GasAdapter` was not activated.

## Established architecture
- Playwright owns ordinary semantic interaction.
- Normal browser CDP observation uses Playwright public `CDPSession` APIs rather than a second raw CDP engine.
- GAS-specific browser-root recursive/OOPIF discovery is delegated to `nakfreeajer/gas-remote-debug` through `GasAdapter`.
- Unified cross-layer chronology and evidence correlation are owned by this project.
- Correlation must be evidence-backed; timing proximity alone is not enough.

## GAS mode rule
`https://script.google.com/macros/` prefix -> `BROWSER_PLUS_GAS`; otherwise -> `BROWSER_ONLY`.

## Governance state
- Human Owner: Rony Finster.
- Architect-Curator: ChatGPT Architect for this project.
- Executor: bounded Codex execution role.
- There is no automated Orchestrator.
- Relay is manual.

## Next engineering step
Define and execute V0.1B: bounded GAS dual-layer coexistence/integration proof.

V0.1B should inspect and compose `nakfreeajer/gas-remote-debug` rather than duplicate its recursive browser-root/OOPIF discovery. It must prove safe coexistence of:
- Playwright normal-browser observation from the accepted V0.1A path; and
- `gas-remote-debug` browser-root target/session/execution-context discovery on a GAS page.

The milestone must preserve the low-intrusion boundary and record only identity mappings that can be proven.

## Unresolved items
- Exact dependency integration method for `gas-remote-debug` must be proven in V0.1B.
- Exact mapping contract between Playwright Page/Frame identities and GAS raw-CDP target/session/context identities still needs runtime evidence.
- Whether optional Playwright native tracing is useful alongside the JSONL unified timeline remains a future evidence-based decision.
