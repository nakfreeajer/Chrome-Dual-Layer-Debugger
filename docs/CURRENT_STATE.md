# Current State

## Status
Planning / foundation setup.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Language/runtime direction: TypeScript + Node.js

## Established architecture
- Playwright owns ordinary semantic interaction.
- Normal browser CDP observation should prefer Playwright public `CDPSession` APIs rather than a second raw CDP engine.
- GAS-specific browser-root recursive/OOPIF discovery is delegated to `nakfreeajer/gas-remote-debug` through `GasAdapter`.
- Unified cross-layer chronology is owned by this project.

## GAS mode rule
`https://script.google.com/macros/` prefix -> `BROWSER_PLUS_GAS`; otherwise -> `BROWSER_ONLY`.

## Existing scaffold
The repository contains initial `src/core`, `src/browser`, `src/gas`, `src/trace`, `src/cli`, `tests`, and `docs` structure. The code is intentionally skeletal pending bounded implementation milestones.

## Governance state
AMO-inspired project filesystem is being adopted without an automated Orchestrator. Relay between Architect-Curator and Executor is manual and performed by the Human Owner.

## Next engineering step
Before broad implementation, prove the browser attachment/observation boundary with an already-running Chromium instance and confirm that normal Playwright/CDP observation can coexist with `gas-remote-debug` GAS discovery without navigation, browser closure, or page closure.

## Unresolved items
- Exact dependency integration method for `gas-remote-debug` should be proven during the first integration milestone.
- Exact mapping contract between Playwright Page/Frame identities and GAS raw-CDP target/session/context identities needs runtime evidence.
- Whether optional Playwright native tracing is useful alongside the JSONL unified timeline remains a future evidence-based decision.
