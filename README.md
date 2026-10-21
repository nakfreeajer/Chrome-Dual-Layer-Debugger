# Chrome Dual Layer Debugger

CDLD is a reusable advanced Playwright-based Chrome/Chromium debugging and controlled-testing capability layer. It combines ordinary Playwright browser semantics with supported Google Apps Script/OOPIF capabilities through the existing adapter boundary. It is intended as the standard integration point for independent web-app projects once the relevant consumer-facing contract is qualified.

## Why this project exists

Browser applications can split one user action across page code, Chromium transport, backend execution, and asynchronous callbacks. Google Apps Script web apps make this boundary especially visible: browser tooling observes client and transport activity while Apps Script tooling observes server execution, but neither alone necessarily proves which frontend call belongs to which server execution and callback.

CDLD was developed to close that observability gap without becoming part of the application under test. It rejects correlation based only on timing, arrival order, frame proximity, or similarity. It also avoids transparent replacement of native application APIs when that could change application semantics.

Its evidence pipeline is designed to attach to an existing browser, observe browser/page/frame/network and GAS-related evidence, preserve native request identity separately from application correlation identity, correlate only when required evidence is complete, fail closed on missing or conflicting evidence, keep ordinary non-cooperative traffic uncorrelated, and produce a privacy-reduced normalized timeline.

## Product objective and consumer boundary

The Human-approved Project Charter v1.1 defines one intended consumer-facing CDLD contract for ordinary Chrome automation plus qualified GAS/OOPIF access. Playwright and `gas-remote-debug` are internal components. Consumer projects own application behavior, fixtures, test cases, business workflows, and acceptance; they should not duplicate recursive GAS/OOPIF raw-CDP discovery by default.

CDLD is a combined debugging and controlled-testing capability layer. First-class testing capabilities include:

- **Smoke testing:** replay bounded workflows such as fill, click, verify UI, verify correlated backend activity, and report PASS/FAIL.
- **Monkey testing:** generate bounded exploratory actions and edge-case inputs against explicitly authorized test targets.
- **Regression testing:** replay known scenarios and compare expected UI/backend outcomes and trace evidence.
- **Assertions:** verify DOM state, visibility, browser/network outcomes, cooperative GAS correlation, callbacks, and errors.
- **Failure evidence:** retain the last action and privacy-reduced evidence needed to diagnose a failure.
- **Safe test mode:** permit mutation only under explicit active-test authorization; ordinary debugger observation remains read-only-first.

These capabilities are limited to their accepted contracts. CDLD is not a general test-management service, arbitrary DOM crawler, or business-specific test catalog. A completed test feature does not by itself establish generalized production readiness.

## Current capabilities and qualification boundaries

The accepted V0.1J/V0.1K implementation provides the cross-layer evidence path: Playwright/page-scoped Network request, response, and terminal evidence is combined with raw child/OOPIF Runtime completion-marker evidence and passed to the V0.1I recognizer. Observation is opt-in through `--observe-v1-ms`. Page console observation is diagnostic and is not production completion-marker authority. The recognizer remains the proof authority and assigns correlation only after complete evidence finalization.

TEST.1A established the common active-testing capability set; TEST.1B added a controlled declarative smoke runner; TEST.1C added bounded deterministic seeded exploratory actions; TEST.1D added shared assertions, privacy-reduced failure artifacts, and bounded diagnostics for explicitly authorized TEST targets. TEST.1E is accepted only for its bounded disposable-browser and synthetic PLAYWRIGHT PAGE fixture lifecycle. TEST.1F source and bounded offline qualification exist, but formal CORE-06 acceptance remains unresolved. The PAGE.1D report records one synthetic PAGE case and assertion passing, while the overall result remains `INCONCLUSIVE_CLEANUP` because the complete final target digest set was not retained. These results do not establish full replayable-suite acceptance or production readiness.

The Release 1 common-operation baseline remains 19 qualified operations. Double-click, right-click, drag/drop, file input, and cross-backend screenshot parity remain deferred. CORE-06 and CORE-07 remain Release blockers. F36 remains `INCONCLUSIVE / EXHAUSTED`; its cause, ownership, and cleanup uncertainties remain `UNKNOWN`, and `HISTORICAL_STOP_TRIGGERED` is preserved.

## Playwright and GAS/OOPIF capability strategy

CDLD has two peer execution backends for the declared common capability contract:

- **PLAYWRIGHT** uses Playwright's semantic browser primitives, including locators, actionability, input, scrolling, and assertions.
- **GAS_OOPIF** uses raw CDP with the existing `gas-remote-debug` dependency to access the relevant GAS target, session, and execution context.

Scenarios describe what to do rather than containing backend-specific browser-control code. Only capabilities qualified in the project matrix are represented as common. TEST.1A live parity qualification proved 19 common operations through both backends on a disposable local OOPIF fixture with equivalent normalized results and fixture state. Four operations remain explicit gaps; screenshot remains backend-specific. See `src/testing/CapabilityMatrix.ts` and the TEST.1A validation record.

The v0.1 GAS mode rule is exact: an active URL beginning with `https://script.google.com/macros/` selects `BROWSER_PLUS_GAS`; all other URLs select `BROWSER_ONLY`. This rule does not claim universal GAS detection.

## Architecture and operating principles

The V0.1 architecture combines browser attachment and semantic access through Playwright, low-level observation through CDP, and GAS-specific discovery through `GasAdapter` and `gas-remote-debug`. CDLD does not duplicate the dependency's recursive GAS target/session/context discovery engine without demonstrated need.

For the accepted V1 correlation path, Playwright/page-scoped CDP supplies Network request, response, and transport evidence. Raw child/OOPIF CDP Runtime observation supplies exact cooperative completion-marker evidence that late Playwright page-console observation may miss. One V1 recognizer remains the proof authority. Exact token and native request identity—not timing or event order—establish correlation.

The design prioritizes observability before mutation, deterministic evidence, low intrusion, privacy-reduced retained evidence, fail-closed behavior rather than guessing, and controlled actions only under explicit test authorization. The package remains `private: true`; no stable public SDK/export contract or full Playwright API compatibility has been qualified. Use only documented, already-supported commands and contracts.

After `npm run build`, the accepted smoke CLI form is:

```text
node dist/src/cli/main.js smoke --scenario <FILE> --backend PLAYWRIGHT|GAS_OOPIF --endpoint <URL> --approval-reference <TEXT>
```

This CLI form is not an SDK contract and does not authorize production/business targets.

See [Project Charter](docs/PROJECT_BRIEF.md), [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), [Current State](docs/CURRENT_STATE.md), [Trace Model](docs/TRACE_MODEL.md), and [Validation](docs/VALIDATION.md).
