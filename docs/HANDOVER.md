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
- Accepted pre-bootstrap remote baseline: `d157bd48ded35c1714d64635539569ca799da72d`
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Local filesystem/bootstrap milestone: `ACCEPTED` on 2026-09-28.
- Executor reported a clean local clone on `main...origin/main`, all requested tracked structure present, ignored `.agent-work/` created, and no source/debugger implementation changes.

## Architecture baseline
- Project is independent from AFFOTECH.
- TypeScript/Node.js direction selected.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation should prefer Playwright public CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS detection is only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline/correlation belongs to Chrome-Dual-Layer-Debugger.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner may paste or otherwise transport the bounded Executor report/evidence to the Architect-Curator. Do not require an automated bridge, watcher, doorbell, or orchestrator state to continue.

## What must not be repeated
- Do not recreate the repository or local bootstrap unless direct evidence shows it is broken.
- Do not rebuild the AMO/orchestration infrastructure for this project.
- Do not duplicate `gas-remote-debug` recursive GAS/OOPIF discovery.
- Do not reopen the accepted local filesystem setup merely because later implementation work fails.

## Exact next intended action
Architect-Curator defines the first bounded v0.1 browser attachment/discovery milestone. The Executor should then prove low-intrusion attachment to an already-running Chromium instance and capture deterministic browser/page/frame/CDP evidence. Do not jump directly to full GAS trace correlation.
