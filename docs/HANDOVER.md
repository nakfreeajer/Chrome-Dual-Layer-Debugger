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
- V0.1A implementation commits:
  - `aa886de935678e48f1f8a424728c6711dd701586` — initial read-only discovery implementation;
  - `f1cf95158eba7342d627a5526f04766b24c1d5d2` — low-intrusion/stable-identity correction.

## Accepted V0.1A capability
The project can attach to an already-running Chromium-family browser through Playwright `connectOverCDP`, enumerate existing contexts/pages/frames, classify pages through the deterministic GAS URL-prefix rule, observe `Page`/`Runtime` evidence through public Playwright `CDPSession`, and retain debugger-local context/page/frame identity across repeated discovery passes within one connection.

Low-intrusion connection behavior is part of the accepted contract:
- `noDefaults: true`;
- `isLocal: true` only for loopback endpoints (`localhost`, `127.0.0.1`, `::1`);
- no navigation/click/type/reload/DOM/storage mutation;
- disconnect must not close the existing browser process or page targets.

Accepted validation included 8/8 tests, typecheck, clean diff check, two-pass stable-ID live validation, unchanged browser target snapshots before/after disconnect, and a responsive endpoint after disconnect.

## Architecture baseline
- Project is independent from AFFOTECH.
- TypeScript/Node.js direction selected.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS detection is only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline/correlation belongs to Chrome-Dual-Layer-Debugger.
- Unknown cross-layer relationships must remain unknown until proven.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner transports the bounded Executor report/evidence to the Architect-Curator. Do not require an automated bridge, watcher, doorbell, or orchestrator state to continue.

## What must not be repeated
- Do not recreate the repository or local bootstrap unless direct evidence shows it is broken.
- Do not rebuild the accepted V0.1A normal-browser discovery path absent direct regression evidence.
- Do not rebuild the AMO/orchestration infrastructure for this project.
- Do not duplicate `gas-remote-debug` recursive GAS/OOPIF discovery.
- Do not infer Playwright-to-GAS target/session/context mappings from timestamps alone.

## Exact next intended action
Define and execute V0.1B: GAS dual-layer coexistence/integration proof.

The Executor should inspect the current public API and implementation boundary of `nakfreeajer/gas-remote-debug`, choose the smallest composition method, and prove that its browser-root recursive GAS discovery can operate alongside the accepted Playwright V0.1A observation path against the same running browser without destructive side effects.

Do not jump yet to full `google.script.run` end-to-end trace propagation, server instrumentation, GUI work, breakpoints, or broad automation.
