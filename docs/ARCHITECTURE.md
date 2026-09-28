# Architecture

## Principle

Playwright owns ordinary semantic browser interaction. CDP owns low-level observation and verification. The GAS layer is enabled only for pages whose active URL starts with `https://script.google.com/macros/`.

## Layers

```text
Chrome / Chromium
  |
  +-- PlaywrightAdapter ---- semantic browser interaction
  |
  +-- CDPAdapter ----------- browser/runtime/network observation
  |
  +-- GasAdapter ----------- GAS/OOPIF runtime discovery when enabled
           |
           +-- reuses gas-remote-debug public API

Adapters -> normalized TraceEvent -> Timeline -> JSONL
```

## GAS composition decision

Do not fork or duplicate the recursive CDP engine already present in `nakfreeajer/gas-remote-debug`.

`GasAdapter` should compose that package for browser-root target discovery, recursive attachment, session/frame/execution-context registries, runtime-context selection, safe evaluation, and redaction.

The dual-layer debugger remains responsible for:

- selecting the active debug page;
- URL-based mode detection;
- Playwright semantic control;
- general browser/CDP observations;
- page/target identity correlation;
- assigning unified event/trace identity;
- chronological normalization into one timeline.

The GAS package remains responsible for GAS/OOPIF-specific runtime discovery and exact `sessionId + executionContextId` access.

## Avoid duplicate ownership

The browser CDP observer and GAS adapter may both receive CDP evidence, but only one component should own recursive GAS target/context discovery. In Version 0.1 that owner is `gas-remote-debug` through `GasAdapter`.
