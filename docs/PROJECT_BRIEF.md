# Project Brief

## Project
Chrome-Dual-Layer-Debugger

## Purpose
Build a unified Chrome/Chromium debugging system with automatic selection between:

- `BROWSER_ONLY` — Playwright + page/frame CDP observation.
- `BROWSER_PLUS_GAS` — browser layer plus Google Apps Script runtime discovery/tracing.

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
- Deterministic evidence.
- Low intrusion.
- Cross-layer correlation.
- Extensible backend adapters later, but not in v0.1.

## Initial technology direction
- TypeScript on Node.js.
- Playwright as primary semantic browser interaction.
- Playwright-backed CDP sessions for ordinary page/frame observation where sufficient.
- `gas-remote-debug` composed behind `GasAdapter` for GAS-specific browser-root recursive/OOPIF discovery.
- JSONL as the initial unified timeline format.

## Human authority
Rony Finster is final product authority.

## Workflow
This project follows an AMO-inspired Architect-Curator / bounded Executor workflow with **manual human relay**. No automated Orchestrator is part of the project workflow.
