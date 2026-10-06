# Project Brief

## Project
Chrome-Dual-Layer-Debugger

## Purpose
Build a unified Chrome/Chromium cross-layer debugging and controlled testing system with automatic selection between:

- `BROWSER_ONLY` — Playwright + page/frame CDP observation.
- `BROWSER_PLUS_GAS` — browser layer plus Google Apps Script runtime discovery/tracing.

The product objective includes active smoke, monkey/exploratory and replayable regression testing on explicitly authorized test targets. Passive observation remains the default safety posture; active mutation is enabled only by explicit TEST-mode scope.

## Detection rule

```text
url.startsWith("https://script.google.com/macros/")
  -> BROWSER_PLUS_GAS
otherwise
  -> BROWSER_ONLY
```

No heuristic GAS detection is authorized for v0.1 unless real evidence demonstrates the prefix rule is insufficient.

## Product principles
- Simple first.
- Automatic discovery.
- Modular adapters.
- Observability before automation.
- Active testing built on top of deterministic evidence, not instead of it.
- Deterministic evidence.
- Low intrusion.
- Cross-layer correlation.
- Controlled Playwright actions and assertions under explicit TEST mode.
- Reproducible smoke/monkey/regression evidence.
- CDLD adds cross-layer GAS correlation, Timeline evidence, safety/authorization, replay and diagnosis around Playwright rather than replacing Playwright's mature browser interaction features.
- Extensible backend adapters later, but not in v0.1.

## Initial technology direction
- TypeScript on Node.js.
- Playwright as the reusable browser-testing foundation: locators, auto-wait/actionability, input actions, frame-aware interaction, assertions and compatible test-runner facilities should be composed rather than reimplemented.
- Playwright-backed CDP sessions for ordinary page/frame observation where sufficient.
- `gas-remote-debug` composed behind `GasAdapter` for GAS-specific browser-root recursive/OOPIF discovery.
- JSONL as the initial unified timeline format.

## Human authority
Rony Finster is final product authority.

## Workflow
This project follows an AMO-inspired Architect-Curator / bounded Executor workflow with **manual human relay**. No automated Orchestrator is part of the project workflow.
