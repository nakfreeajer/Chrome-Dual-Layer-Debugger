# Architecture

## Core principle

Playwright owns ordinary semantic browser interaction. For normal pages, low-level CDP observation should prefer Playwright public `CDPSession` access. The GAS layer is enabled only when the current page URL starts with `https://script.google.com/macros/`.

## Runtime architecture

```text
Chrome / Chromium
        |
        +-- PlaywrightAdapter
        |     +-- connectOverCDP
        |     +-- pages / frames / locators / actions
        |
        +-- CDPObserver
        |     +-- Playwright newCDPSession(Page/Frame)
        |     +-- Runtime / Page / Network / DOM / console evidence
        |
        +-- LayerDetector
              |
              +-- BROWSER_ONLY
              |
              +-- BROWSER_PLUS_GAS
                        |
                        +-- GasAdapter
                              |
                              +-- gas-remote-debug
                                    +-- browser-root CDP
                                    +-- Target discovery
                                    +-- recursive OOPIF/session discovery
                                    +-- execution-context discovery

All adapters -> normalized TraceEvent -> Timeline -> JSONL
```

## GAS detection

The v0.1 detector is intentionally deterministic and simple:

```text
currentUrl.startsWith("https://script.google.com/macros/")
  -> BROWSER_PLUS_GAS
otherwise
  -> BROWSER_ONLY
```

Detection and runtime discovery are separate concerns. The URL rule decides whether `GasAdapter` is required; `gas-remote-debug` then performs GAS-specific discovery.

## GAS composition decision

Do not fork or duplicate the recursive CDP engine already present in `nakfreeajer/gas-remote-debug`.

`GasAdapter` composes that package for browser-root target discovery, recursive attachment, target/session/frame/execution-context registries, runtime-context selection, safe evaluation, and redaction.

Chrome-Dual-Layer-Debugger remains responsible for:
- selecting the page/session under inspection;
- URL-based mode detection;
- Playwright semantic control;
- normal page/frame CDP observations;
- cross-layer identity mapping where it can be proven;
- assigning unified event/trace identity;
- chronological normalization into one timeline.

## Identity rule

Playwright Page/Frame identity, CDP TargetId/FrameId/SessionId, and GAS execution-context identity are related but not assumed identical. `TargetRegistry` records only mappings supported by evidence.

## Trace and correlation identity

Every observation has its normal event identity; the V0.1D run-scoped event key is `(runId,eventId)`. For V0.1I correlation, CDP `requestId` remains the transport identity and the application token becomes `correlationId` only after complete deterministic proof. These identities are not interchangeable.

Ordinary native `google.script.run` traffic remains untouched and uncorrelated. Only privacy-reduced evidence from the explicitly cooperative V1 contract is eligible for recognition:

```text
V1 request evidence + same-request response token + transport completion
+ validated V1 completion marker
        -> passive run-scoped recognizer
        -> proven correlation event in Timeline
```

Recognition finalizes before assigning `correlationId`; incomplete, duplicate, conflicting, malformed or unknown-version evidence fails closed. Request `contractVersion === 1` and completion-marker `contractVersion === 1` are authoritative. Response token equality is required, but response version is not independently parsed. A token prefix never establishes contract version. Timing, ordering, function name and URL similarity are not evidence.

This architecture describes the accepted recognizer only. No production CLI/page/network evidence producer currently feeds it automatically. Explicit application failure is represented by the cooperative V1 result contract and does not claim native Apps Script `ScriptError` equivalence.

## Low-intrusion rule

Observation is the default. Do not navigate, close, click, type, mutate DOM/runtime state, or close the browser unless the active bounded milestone explicitly authorizes it.

## Engineering workflow architecture

The project uses an AMO-inspired Human -> Architect-Curator -> Executor authority model, but **no automated Orchestrator is part of this project**. Relay is performed manually by the Human Owner. Repository governance and the software runtime architecture are independent concerns.
