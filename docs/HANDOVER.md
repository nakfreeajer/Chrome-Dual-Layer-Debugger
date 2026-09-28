# Handover

## Role
Architect-Curator for Chrome-Dual-Layer-Debugger.

## Authority
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

There is **no automated Orchestrator**. Rony manually relays bounded prompts, Executor reports, correction instructions, and documentation-closure requests.

## Read first
1. `AGENTS.md`
2. `docs/PROJECT_BRIEF.md`
3. `docs/CURRENT_STATE.md`
4. `docs/DECISIONS.md`
5. `docs/ARCHITECTURE.md`
6. `docs/ROADMAP.md`
7. `docs/AGENT_WORKFLOW.md`
8. `docs/VALIDATION.md`

## Current baseline
- Repository scaffold exists on `main`.
- Project is independent from AFFOTECH.
- TypeScript/Node.js direction selected.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation should prefer Playwright public CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS detection is only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline/correlation belongs to Chrome-Dual-Layer-Debugger.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner may paste or otherwise transport the bounded Executor report/evidence to the Architect-Curator. Do not require an automated bridge or doorbell to continue.

## Exact next intended action
Define and execute one bounded v0.1 attachment/discovery milestone after the filesystem/governance setup is accepted. Do not jump directly to full GAS trace correlation.
