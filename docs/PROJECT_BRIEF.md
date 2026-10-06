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
- One common action/assertion contract with equal Playwright and GAS/OOPIF backend capability under explicit TEST mode.
- Reproducible smoke/monkey/regression evidence.
- Playwright and GAS/OOPIF are equal execution backends under the CDLD contract; stronger capabilities on either side should be reused and weaker capabilities improved until declared common operations pass conformance.
- Extensible backend adapters later, but not in v0.1.

## Initial technology direction
- TypeScript on Node.js.
- Playwright adapter as one full browser-control/debugging backend, reusing Playwright primitives where they satisfy the common contract.
- GAS/OOPIF adapter as an equal full browser-control/debugging backend, using raw CDP plus `gas-remote-debug` for exact target/session/context ownership.
- Playwright-backed CDP and raw CDP may be combined within either adapter when needed to satisfy the shared capability contract.
- JSONL as the initial unified timeline format.

## Human authority
Rony Finster is final product authority.

## Workflow
This project follows an AMO-inspired Architect-Curator / bounded Executor workflow with **manual human relay**. No automated Orchestrator is part of the project workflow.
