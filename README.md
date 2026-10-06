# Chrome Dual Layer Debugger

Unified cross-layer debugging and controlled testing for Chrome/Chromium applications, with first-class Google Apps Script support.

## Why this project exists

Modern browser applications can split one user action across several execution layers: the page UI, Chromium network/CDP activity, backend execution, and the asynchronous callback that eventually returns to the page. Google Apps Script web applications make that boundary especially visible because browser DevTools can observe the client and transport while Apps Script tooling observes the server, but neither side alone gives a deterministic end-to-end explanation of which browser action produced which server execution and callback.

Chrome Dual Layer Debugger was developed to close that observability gap without turning the debugger into part of the application being debugged.

The project deliberately rejects correlation based only on timing, arrival order, frame proximity, or similarity. Those signals can look correct during simple runs and still pair the wrong events when requests overlap or callbacks complete out of order. It also avoids transparently replacing or wrapping native application APIs when doing so could change application semantics.

Instead, CDLD aims to provide one low-intrusion evidence pipeline that can:

- attach to an already-running Chrome/Chromium browser;
- observe browser, frame, network, and backend-related evidence without taking over normal application behavior;
- keep native request identity separate from debugger correlation identity;
- correlate cross-layer activity only when the required evidence is complete;
- fail closed when evidence is missing, duplicated, malformed, or conflicting;
- keep ordinary non-cooperative traffic quiet and uncorrelated;
- emit a privacy-reduced normalized timeline that can be reviewed after the run.

The result is intended to answer a practical debugging question: **“What exactly happened across the browser and backend for this one action, and what evidence proves that these events belong together?”**

## Product objective

CDLD is not intended to stop at passive observation. Its target is a combined **debugger + active test system**.

The completed V0.1 correlation work is the evidence foundation. The active-testing track builds on that foundation so CDLD can deliberately interact with a designated test application and explain the full result of each action.

Planned first-class testing capabilities are:

- **Smoke testing** — replay bounded workflows such as fill → click → verify UI → verify correlated backend activity → PASS/FAIL.
- **Monkey testing** — generate bounded exploratory actions and edge-case input sequences against explicitly authorized test targets.
- **Regression testing** — replay known scenarios and compare expected UI/backend outcomes and trace evidence.
- **Assertions** — verify DOM state, visibility, browser/network outcomes, cooperative GAS correlation, callbacks, and errors.
- **Failure evidence** — retain the exact last action plus privacy-reduced browser/network/GAS timeline evidence needed to diagnose the failure.
- **Safe test mode** — mutation is allowed only under an explicit active-test authorization; ordinary debugger observation remains read-only-first.

The published V0.1J/V0.1K implementation provides the deterministic cross-layer evidence layer. Active smoke/monkey/regression execution is the next product track and must not be confused with capabilities already shipped.

## Modes

- `BROWSER_ONLY` — Playwright for semantic interaction plus CDP for low-level observation.
- `BROWSER_PLUS_GAS` — browser layer plus the Google Apps Script adapter.

## Detection

A debugged page whose active URL starts with `https://script.google.com/macros/` is classified as `BROWSER_PLUS_GAS`. All other URLs are `BROWSER_ONLY`.

## Version 0.1 architecture

Version 0.1 establishes browser attachment, target/page/frame discovery, identity mapping, layer detection, cross-layer correlation, and a read-only normalized timeline.

For the accepted V1 correlation path:

- Playwright/page-scoped CDP supplies Network request, response, and transport evidence.
- RAW child/OOPIF CDP Runtime observation supplies only the exact cooperative completion-marker evidence that Playwright's late page-console observation cannot reliably provide.
- A single V1 correlation recognizer remains the proof authority; the RAW-CDP path does not introduce a competing state machine.
- Exact token and native request identity are used for proof rather than timing or event order.
- GAS-specific runtime discovery remains adapter-based and reuses the existing `gas-remote-debug` project rather than duplicating its recursive OOPIF/context discovery engine.

The design remains read-only-first by default: observation and deterministic evidence come before automation or mutation. Explicit TEST-mode milestones may authorize controlled Playwright actions against designated test targets.

## Design principles

- Simple first.
- Automatic discovery.
- Modular adapters.
- Observability before automation.
- Deterministic evidence.
- Low intrusion.
- Cross-layer correlation.
- Privacy-reduced retained evidence.
- Fail closed rather than guess.
- Controlled mutation only under explicit test authorization.
- Testing should produce evidence, not only a green/red result.

See `docs/ARCHITECTURE.md`, `docs/TRACE_MODEL.md`, `docs/RESEARCH.md`, `docs/ROADMAP.md`, and `docs/PROJECT_HISTORY.md`.
