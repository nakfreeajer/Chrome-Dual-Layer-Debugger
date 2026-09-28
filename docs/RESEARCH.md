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
