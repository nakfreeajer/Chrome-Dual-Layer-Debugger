# Research Notes

## Confirmed from gas-remote-debug

The existing `nakfreeajer/gas-remote-debug` project already provides browser-root raw CDP discovery for GAS/OOPIF applications. Its public API includes browser CDP connection, target discovery, recursive target attachment, runtime-context discovery/evaluation, registry refresh, disconnect, redaction, and GAS profiles.

Its recursive engine uses `Target.getTargets`, `Target.attachToTarget`, and recursive `Target.setAutoAttach`, while tracking target, session, frame, and execution-context lifecycle.

## Version 0.1 research still required

Before implementing the browser adapters, inspect current Playwright Chromium/CDP attachment behavior for:

1. `connectOverCDP` connection lifecycle and side effects;
2. browser context/page creation when attaching to an existing browser;
3. target-to-Playwright Page identity mapping;
4. frame and execution-context identity exposure;
5. interaction between Playwright-created CDP sessions and an independent browser-root CDP connection;
6. disconnect behavior and low-intrusion guarantees.

## Integration hypothesis to validate

Use Playwright as the semantic control plane. Use the normal CDP adapter for generic observation. When `LayerDetector` selects `BROWSER_PLUS_GAS`, activate `GasAdapter`, which composes `gas-remote-debug` for GAS/OOPIF-specific discovery. Normalize all evidence into the shared timeline instead of merging the two codebases.


## Correlation research conclusions - V0.1E through V0.1H

- **V0.1E:** Native browser/CDP request and runtime identities did not expose a shared identifier spanning frontend invocation, GAS execution and callback. Timing, order, function-name coincidence and URL similarity cannot close that identity gap.
- **V0.1F:** A disposable non-production HTML Service fixture proved an explicitly propagated opaque token across client invocation, observed CDP transport/response, dedicated GAS execution and callback. Exact token equality plus the exact native CDP requestId supplied deterministic links for success and controlled failure.
- **V0.1G:** A transparent universal runner wrapper was not semantically safe: failure reconstruction changed observable native Apps Script `ScriptError` behavior. Correlation capability does not establish drop-in compatibility.
- **V0.1H:** The qualified direction is explicit application cooperation through a declared versioned contract. Native calls coexist untouched and remain uncorrelated. The cooperative failure envelope is its own contract, not native `ScriptError` equivalence.
- **V0.1I boundary:** The passive recognizer accepts only privacy-reduced evidence and proves correlation after exact requestId/token/response/transport/completion-marker agreement. Request version 1 and completion-marker version 1 are authoritative; response token equality is required, but response version is not independently parsed. The recognizer is implemented, but automatic CLI/page/network evidence production is not.
