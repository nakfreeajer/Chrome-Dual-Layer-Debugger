# Architecture

## Core principle

CDLD has two equal browser-control/debugging backends:
- `PLAYWRIGHT` — semantic browser interaction through Playwright.
- `GAS_OOPIF` — direct control and inspection of the real GAS/OOPIF runtime through raw CDP and `gas-remote-debug`.

Neither backend is the privileged product surface. CDLD exposes one project-independent capability contract and both backends must satisfy that contract for capabilities declared as supported.

## Dual-backend capability parity rule

The reusable CDLD capability contract should cover, where technically applicable:
- target/page/frame/context selection;
- semantic or equivalent element targeting;
- click/double-click/right-click;
- fill/type/clear;
- keyboard input;
- scroll/scroll-to-element;
- hover/focus;
- check/uncheck;
- select options;
- drag/drop;
- file input;
- wait/actionability readiness;
- DOM/value/text/visibility/state queries;
- assertions with bounded retry;
- screenshots or bounded visual evidence where policy permits;
- navigation/reload only under explicit TEST authorization;
- normalized action and assertion results.

Playwright implementations should reuse mature Playwright primitives. GAS/OOPIF implementations should use the most faithful raw-CDP mechanisms available, including DOM, Runtime and Input domains, while preserving exact target/session/execution-context ownership.

Parity means the same CDLD scenario operation has equivalent externally observable semantics and normalized result shape on both backends. Internal implementation does not need to be identical.

If a required capability is stronger on one backend, improve the weaker backend. If a demonstrated Playwright limitation blocks the common CDLD contract, CDLD may extend the Playwright adapter, add raw-CDP support alongside Playwright, or maintain a pinned patch/fork when justified by evidence. Upstream Playwright code must not be modified merely for convenience; any modification requires a reproduced capability gap and conformance coverage.

Capabilities unique to one runtime may remain backend-specific extensions, but the common smoke/monkey/regression scenario language must not silently change meaning between backends.

### TEST.1A evidence-backed parity

The TEST.1A common action/assertion contract is implemented by both `PLAYWRIGHT` and `GAS_OOPIF`. A disposable local OOPIF live run executed the same 31-step scenario through each backend, compared normalized outcomes and fixture state, and exercised deterministic passing and failing assertions. Nineteen common operations are qualified `PASS` in the capability matrix. Double-click, right-click, drag/drop and file input remain `GAP`; screenshot remains `BACKEND_SPECIFIC` for Playwright and `GAP` for GAS_OOPIF. These statuses describe only the tested contract and do not imply broader application coverage.

Mutating operations require explicit target- and backend-bound TEST authorization and have bounded action timeouts. The parity foundation is not yet a general scenario runner. TEST.1B remains planned and separately governed.

CDLD additionally owns:
- explicit OBSERVE versus TEST safety modes and target authorization;
- deterministic V1 browser-to-GAS callback correlation through the existing single recognizer;
- unified run/action/assertion/correlation chronology in the Timeline;
- reproducible bounded monkey generation and seed replay;
- project-independent scenario representation;
- fixture/reset/cleanup governance;
- cross-layer failure diagnosis and evidence retention.


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

The accepted V0.1J/V0.1K producer is opt-in through CLI `--observe-v1-ms`. Playwright/page-scoped CDP Network supplies privacy-reduced request, response and transport-terminal evidence. A raw child/OOPIF observer on the same page-scoped CDP connection supplies only exact cooperative V1 completion markers. Both sources feed the same V0.1I recognizer; there is no competing proof state machine. The recognizer finalizes the exact evidence before setting `correlationId`.

`requestId` remains the native transport identity and is session-scoped. `observerScopeId` scopes that request identity and remains separate from the token-derived `correlationId`. Target/session identity only routes child Runtime messages; it is not correlation identity. Playwright `Page.on('console')` is not production marker proof input because late page-level observation may miss markers emitted in a child/OOPIF context. Explicit application failure is represented by the cooperative V1 result contract and does not claim native Apps Script `ScriptError` equivalence. No browser diagnostic remains pending.

## Low-intrusion rule

Observation is the default. Do not navigate, close, click, type, mutate DOM/runtime state, or close the browser unless the active bounded milestone explicitly authorizes it.

## Engineering workflow architecture

The project uses an AMO-inspired Human -> Architect-Curator -> Executor authority model, but **no automated Orchestrator is part of this project**. Relay is performed manually by the Human Owner. Repository governance and the software runtime architecture are independent concerns.

## Engineering-workflow prompt persistence layer

This local workflow persistence layer is separate from browser/CDP runtime architecture:

```text
Architect authors exact prompt bytes and descriptor
    -> Human verifies and imports/authorizes exact bytes
    -> content-addressed artifact and immutable manifest/lifecycle
    -> descriptor-only manual transport to Executor
    -> verified resolve returns exact prompt bytes
    -> bounded Executor follows those bytes
```

RELAY.1A stores artifacts only under ignored `.agent-work/`. Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`; the frozen milestoneId is workflow identity. No transactionId is used, and runtime trace runId is not repurposed.

Prompt bytes are Buffer-exact: line endings, Unicode, whitespace and trailing newline are not normalized. SHA-256 and byte length are checked after publication and again on verified load. Immutable prompt, manifest and lifecycle files use unique sibling temporary files, exclusive creation, complete synced writes, same-directory hard-link no-clobber publication and readback verification. The mutable current locator uses a synced sibling temporary file and same-directory atomic rename. This was qualified on local Windows/NTFS using same-volume hard-link and rename semantics; directory fsync is best effort on Windows. The locator only locates evidence; lifecycle and artifact verification determine whether loading is permitted. Simultaneous lifecycle/locator writers are not qualified, and there is no multi-process lock.

Staging is not authorization. Authorization requires an explicit approval reference and does not cryptographically authenticate the approval. Direct authorization cannot silently replace an active current prompt. Changed decisions use explicit supersession; revocation and supersession are checked against immutable lifecycle evidence. Invalid or corrupt durable state fails closed.

RELAY.1B is accepted and published at `85310e450705e1671ef9e6af22eeae6d9dbcc519`. After documentation closure, descriptor-only Architect -> Executor transport is the normal workflow; a full-prompt copy is an explicit fallback only. The exact prompt file comes from Architect transport: local hashing proves byte identity, not authorship. The descriptor is identity, not authorization; verified RELAY.1A lifecycle state plus exact identity and bytes are required. Resolve is a byte-delivery operation, not execution. No automatic dispatcher, network service, or auto-execution exists. Human transport/approval and Executor -> Architect evidence relay remain manual.
