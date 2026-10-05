# Chrome Dual Layer Debugger

Unified read-only-first debugging for Chrome/Chromium applications.

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

The design remains read-only-first: observation and deterministic evidence come before automation or mutation.

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

See `docs/ARCHITECTURE.md`, `docs/TRACE_MODEL.md`, `docs/RESEARCH.md`, and `docs/PROJECT_HISTORY.md`.
