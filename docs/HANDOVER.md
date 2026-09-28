# Handover

## Role
Architect-Curator for Chrome-Dual-Layer-Debugger.

## Authority
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is final Human authority. ChatGPT is the Architect-Curator for this project. There is **no automated Orchestrator**. Rony manually relays bounded prompts, Executor reports, correction instructions, and documentation-closure requests.

## Read first
1. `AGENTS.md`
2. `docs/PROJECT_BRIEF.md`
3. `docs/CURRENT_STATE.md`
4. `docs/DECISIONS.md`
5. `docs/ARCHITECTURE.md`
6. `docs/ROADMAP.md`
7. `docs/AGENT_WORKFLOW.md`
8. `docs/VALIDATION.md`

## Current accepted baseline
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`.
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.
- `gas-remote-debug` dependency is pinned to `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`.

## Accepted V0.1A capability
The project can attach read-only to an already-running Chromium-family browser through Playwright `connectOverCDP`, enumerate contexts/pages/frames, classify pages with the exact GAS URL-prefix rule, observe public page/frame CDP evidence, retain stable debugger-local identities during one connection, and disconnect without destroying existing targets.

## Accepted V0.1B capability
The project now composes the V0.1A Playwright path with `gas-remote-debug` against the same browser.

Accepted behavior:
- `GasAdapter` remains inactive for `BROWSER_ONLY` pages;
- `GasAdapter` activates only after the exact prefix rule selects `BROWSER_PLUS_GAS`;
- `gas-remote-debug` owns browser-root target/session/context discovery and recursive attachment;
- the primary project preserves native GAS TargetId/SessionId/FrameId/ExecutionContextId evidence;
- `CrossLayerMapper` records mappings only when exact shared protocol FrameId evidence exists and target/session evidence is consistent;
- sibling sandbox contexts without proven Playwright identity remain `UNMAPPED`;
- Playwright Page-to-raw-TargetId remains `UNMAPPED` through the current public discovery surface;
- simultaneous Playwright + GAS attachment was proven non-destructive in the bounded live validation.

Accepted V0.1B validation included primary typecheck, 13/13 primary tests, 94/94 dependency tests, clean diff check, simultaneous two-layer live discovery, unchanged browser target identities before/after disconnect, and a responsive endpoint after cleanup.

## Architecture baseline
- Project is independent from AFFOTECH.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS activation is only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline/correlation belongs to Chrome-Dual-Layer-Debugger.
- Unknown relationships must remain unknown until deterministically proven.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner transports bounded Executor reports/evidence to the Architect-Curator. Do not require an automated bridge, watcher, doorbell, or orchestrator state.

## What must not be repeated
- Do not recreate the repository or local bootstrap without direct regression evidence.
- Do not rebuild accepted V0.1A browser attachment/discovery absent direct regression evidence.
- Do not duplicate `gas-remote-debug` recursive discovery.
- Do not replace the accepted commit-pinned dependency boundary casually.
- Do not infer Playwright/GAS relationships from timestamps or URL equality alone.
- Do not reopen intentionally unmapped sibling GAS contexts merely because they are unmapped.

## Exact next intended action
Define and execute V0.1C: Read-Only Unified Timeline.

The Executor should normalize already-proven browser and GAS observations into the shared `TraceEvent`/Timeline/JSONL layer, retain native timestamps where available, assign deterministic debugger event identity/order, and keep cross-layer events uncorrelated unless deterministic evidence already supports the relationship.

Do not jump yet to `google.script.run` propagation, GAS server instrumentation, GUI work, breakpoints, mutation features, or broad automation.
