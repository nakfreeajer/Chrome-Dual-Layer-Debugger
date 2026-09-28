# Chrome Dual Layer Debugger

Unified read-only-first debugging for Chrome/Chromium applications.

## Modes

- `BROWSER_ONLY` — Playwright for semantic interaction plus CDP for low-level observation.
- `BROWSER_PLUS_GAS` — browser layer plus the Google Apps Script adapter.

## Detection

A debugged page whose active URL starts with `https://script.google.com/macros/` is classified as `BROWSER_PLUS_GAS`. All other URLs are `BROWSER_ONLY`.

## Version 0.1 scope

Version 0.1 establishes browser attachment, target/page/frame discovery, identity mapping, layer detection, and a read-only normalized timeline. GAS integration is adapter-based and reuses the existing `gas-remote-debug` project rather than duplicating its recursive OOPIF/context discovery engine.

See `docs/ARCHITECTURE.md`, `docs/TRACE_MODEL.md`, and `docs/RESEARCH.md`.
