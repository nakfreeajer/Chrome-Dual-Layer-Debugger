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

First-class testing capabilities include:

- **Smoke testing** — replay bounded workflows such as fill → click → verify UI → verify correlated backend activity → PASS/FAIL.
- **Monkey testing** — generate bounded exploratory actions and edge-case input sequences against explicitly authorized test targets.
- **Regression testing** — replay known scenarios and compare expected UI/backend outcomes and trace evidence.
- **Assertions** — verify DOM state, visibility, browser/network outcomes, cooperative GAS correlation, callbacks, and errors.
- **Failure evidence** — retain the exact last action plus privacy-reduced browser/network/GAS timeline evidence needed to diagnose the failure.
- **Safe test mode** — mutation is allowed only under an explicit active-test authorization; ordinary debugger observation remains read-only-first.

The published V0.1J/V0.1K implementation provides the deterministic cross-layer evidence layer. TEST.1A established and live-qualified the first common active-testing capability set, and TEST.1B adds a controlled declarative smoke scenario runner for explicitly authorized test targets. Monkey testing and broader regression execution remain future work and must use only evidence-backed capabilities.

After `npm run build`, a smoke scenario is invoked with `node dist/src/cli/main.js smoke --scenario <FILE> --backend PLAYWRIGHT|GAS_OOPIF --endpoint <URL> --approval-reference <TEXT>`. Only capabilities qualified in the project matrix are shared across backends; TEST mode is limited to explicitly authorized targets.

## Equal Playwright and GAS/OOPIF capability strategy

CDLD exposes one reusable testing/debugging contract with two equal execution backends:

- **Playwright backend** — uses Playwright's mature locators, actionability, input, scrolling, assertions and related test facilities.
- **GAS/OOPIF backend** — uses raw CDP plus `gas-remote-debug` to operate directly in the real GAS target/session/execution context.

The goal is capability parity for common scenario operations such as click, fill/type, keyboard, scroll, hover, check/select, waits, queries and assertions. A project scenario should describe *what to do*, not contain backend-specific browser-control code.

When one backend lacks a required capability, CDLD improves that backend. If Playwright itself becomes the limiting side, the Playwright integration may be extended with raw CDP or, when justified by reproduced evidence, a pinned modification. The same rule applies to the GAS/OOPIF side.

CDLD then adds what neither backend alone provides: explicit OBSERVE/TEST authorization, deterministic cross-layer correlation, unified Timeline evidence, reproducible monkey/replay control, fixture cleanup governance and failure diagnosis.

TEST.1A live parity qualification proved 19 common operations through both backends on the same disposable local OOPIF fixture, with equivalent normalized results and fixture state. Four operations remain explicit gaps; screenshot remains backend-specific. See `src/testing/CapabilityMatrix.ts` and the TEST.1A validation record.


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
