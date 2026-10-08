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

Mutating operations require explicit target- and backend-bound TEST authorization and have bounded action timeouts. TEST.1B adds the bounded controlled smoke runner described below; this does not authorize production/business testing or capabilities outside the matrix.

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

## Controlled smoke runner - TEST.1B

TEST.1B accepts strict project-owned JSON scenarios at `schemaVersion: 1`. Scenarios are declarative: arbitrary JavaScript, evaluation, expressions, and unrecognized fields are rejected. Operations use backend-neutral semantics and CSS selectors; only common capabilities marked `PASS` in the capability matrix are available to the shared contract. The runner validates the complete scenario before browser mutation.

The execution flow is:

```text
strict scenario parser
    -> explicit smoke CLI (backend, endpoint, approval reference)
    -> pre-navigation TEST intent/approval validation
    -> runner-owned page and session
    -> exact PAGE or FRAME selection
    -> PLAYWRIGHT or GAS_OOPIF backend
    -> ordered action/assertion Timeline
    -> PASS/FAIL result and owned-page cleanup
```

The two backends are equal peers for declared common operations, but parity is claimed only for capabilities in the matrix and the accepted qualification. The runner stops on the first failed step. PASS exits 0, scenario action/assertion failure exits 2, and setup/infrastructure errors exit 1.

TEST authorization preconditions, including a non-empty explicit approval reference and valid TEST intent, are checked before `createRunnerOwnedPage()` can connect, create a page, or navigate. After target selection, authorization remains bound to the selected backend and target. The runner creates and closes only its own page; it does not select or close pre-existing user pages.

PAGE scope uses the runner-owned `PAGE-*` identity. FRAME scope binds to the exact selected public Playwright `Frame`. If exactly one accepted normalized frame identity is available, it is preserved. If the public Frame exists but the page CDP frame tree lacks a unique accepted mapping, the session assigns a stable debugger-local `PLAYWRIGHT-FRAME-####` identity. This local identity is not a protocol `FrameId`. GAS_OOPIF scope continues to bind to the exact dependency-native target, session, and execution context.

Scenario lifecycle events are combined with existing action/assertion events. Timeline evidence omits selectors, raw input/expected values, approval references, credentials, cookies, authorization headers, and private DOM dumps. Optional cooperative V1 observation remains separate from action-target identity and continues to use the accepted V0.1I proof rules.

## Bounded exploratory engine - TEST.1C

TEST.1C adds deterministic bounded exploratory actions for explicitly authorized TEST targets. The profile is declarative and strictly validated before runner-owned page creation or navigation; arbitrary JavaScript, executable profile fields, and arbitrary DOM-wide exploration are excluded.

The accepted pipeline is:

```text
validated declarative profile
    -> normalized profile hash
    -> TEST1C_GEN_V1 + explicit seed
    -> pre-generated backend-neutral ordered plan
    -> selected equal execution backend
    -> TestPageSession exact PAGE/FRAME ownership
    -> target-envelope guard
    -> privacy-reduced Timeline evidence + bounded replay artifact
    -> terminal PASS / BOUND_REACHED / FAIL
```

Generation is deterministic from the validated profile, generator version, and explicit seed. Only mutating operations marked PASS for both PLAYWRIGHT and GAS_OOPIF are eligible. The plan is generated before backend execution, and each action is recorded before execution. This supports plan digest/ordered-entry comparison and exact replay without treating timing or order as correlation evidence.

The runner enforces bounded action count, duration, and per-action timeouts; action timeouts are capped to the remaining run duration. It stops on the first action failure, target-envelope violation, reached bound, or setup/infrastructure failure. Timeline and replay evidence remain privacy-reduced and are limited to authorized synthetic/project-owned fixtures.

For every navigation request, the request-event latch independently checks the runner-owned page main-frame origin. Under FRAME scope it also checks the selected frame origin. Either out-of-origin request fails closed before a later generated action can start. For GAS_OOPIF FRAME scope, a fixed 50 ms public-Playwright event-delivery drain precedes the final containment recheck so an already-issued child/OOPIF navigation request can reach the request listener. This drain is bounded safety synchronization only; it is not correlation evidence or proof authority.

Target identity, generated action identity, CDP requestId, observerScopeId, correlationId, seed, and timing/order remain distinct. V0.1I remains the sole correlation proof authority. TEST.1C does not provide generalized production testing, arbitrary DOM crawling, or persisted regression suites; TEST.1D later closed as a separate bounded assertion/failure-evidence milestone. TEST.1E subsequently closed only for the task-owned disposable-browser and synthetic PLAYWRIGHT PAGE lifecycle; TEST.1F remains unauthorized.

## Assertions and failure artifacts - TEST.1D (accepted)

TEST.1D is accepted and closed at source commit `5a05c8e98f0555cca9cf05028dfa31ff20464039` (parent `acb03cae34199bb5dd4c4bd7e89e4093f8d30e91`; accepted source patch SHA-256 `7464b9bb90fdd190374c69cb3a2adf740d88f97c4c835e0312141b5d7a0b5c3a`). The assertion contract is the exact shared predicate set `truthy`, `falsy`, `equals`, `notEquals`, `contains`, and `notContains`; PLAYWRIGHT and GAS_OOPIF use the same evaluator and normalized assertion Timeline evidence. The predicates are non-mutating reads and do not add arbitrary expressions, regex, coercive comparisons, or backend-specific behavior.

Terminal action/assertion failures may produce a `CDLD_TEST1D_FAILURE` schema-version-1 envelope with exact `(runId,eventId)` references. Default retained evidence is privacy-reduced and excludes approval references, raw selectors/values, credentials, cookies, authorization headers, and private DOM. Optional synthetic-fixture detail is opt-in, loopback-target limited, and bounded. Screenshot metadata may accompany a bounded session-level diagnostic artifact; screenshot is not an ActionOperation or GAS parity capability.

DOM, runtime, and screenshot diagnostics share a total 5-second deadline, have no retry loop, and cannot replace the original failure. Timeout prevents later diagnostic stages from starting, even if an earlier underlying operation completes late. The existing TestPageSession target envelope is rechecked before each target-content diagnostic stage. An unsafe envelope yields `OMITTED_TARGET_ENVELOPE`; no later target-content diagnostics or screenshot are collected.

GAS_OOPIF readiness is predicate-scoped to the exact authorized `targetId` and attached `sessionId`, and requires a live, default, non-ignored context with a safe integer executionContextId. A globally present default context is not sufficient. This uses the pinned dependency's public predicate-scoped wait and preserves the existing timeout and polling bounds.

V0.1I remains the sole correlation proof authority. A failure artifact may classify a relationship as `PROVEN_BY_EXISTING_EVIDENCE` only when it references an existing proof-complete V0.1I correlation; otherwise the relationship remains `RUN_CONTEXT_ONLY` or `UNKNOWN`. Exact same-run Timeline references to action, assertion, or failure events are diagnostic identity references, not correlation proof. Timing/order, URLs, and frame/page proximity never prove correlation. TEST.1D does not add correlation, generalized production testing, or capabilities outside the accepted matrix. TEST.1E later added a receipt-bound local fixture lifecycle only for synthetic PLAYWRIGHT PAGE runs; disconnect behavior for externally owned/shared browsers and GAS_OOPIF/FRAME fixture lifecycle remain unqualified. TEST.1F remains PLANNED / NOT AUTHORIZED.

## Engineering workflow architecture

The project uses an AMO-inspired Human -> Architect-Curator -> Executor authority model, but **no automated Orchestrator is part of this project**. Relay is performed manually by the Human Owner. Repository governance and the software runtime architecture are independent concerns.

## Engineering-workflow prompt persistence layer

This local workflow persistence layer is separate from browser/CDP runtime architecture. RELAY.1A/1B remains implemented historical tooling, but compact descriptor transport is no longer the normal project-management workflow. It is optional and used only when specifically needed. Current substantial task transport uses a full task document in Google Drive and a short chat launcher; authority remains Rony -> Architect -> Executor -> Architect verification.

The accepted artifact tooling still provides:

```text
optional Architect-authored exact prompt bytes and descriptor
    -> Human verifies and imports/authorizes exact bytes when needed
    -> content-addressed artifact and immutable manifest/lifecycle
    -> verified resolve returns exact prompt bytes when explicitly used
```

RELAY.1A stores artifacts only under ignored `.agent-work/`. Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`; the frozen milestoneId is workflow identity. No transactionId is used, and runtime trace runId is not repurposed.

Prompt bytes are Buffer-exact: line endings, Unicode, whitespace and trailing newline are not normalized. SHA-256 and byte length are checked after publication and again on verified load. Immutable prompt, manifest and lifecycle files use unique sibling temporary files, exclusive creation, complete synced writes, same-directory hard-link no-clobber publication and readback verification. The mutable current locator uses a synced sibling temporary file and same-directory atomic rename. This was qualified on local Windows/NTFS using same-volume hard-link and rename semantics; directory fsync is best effort on Windows. The locator only locates evidence; lifecycle and artifact verification determine whether loading is permitted. Simultaneous lifecycle/locator writers are not qualified, and there is no multi-process lock.

Staging is not authorization. Authorization requires an explicit approval reference and does not cryptographically authenticate the approval. Direct authorization cannot silently replace an active current prompt. Changed decisions use explicit supersession; revocation and supersession are checked against immutable lifecycle evidence. Invalid or corrupt durable state fails closed.

RELAY.1B is accepted and published at `85310e450705e1671ef9e6af22eeae6d9dbcc519`. Its descriptor/import/revoke/supersede/resolve tooling remains valid; governance simplification supersedes it only as the default operating workflow, not as technical implementation. When this optional tooling is used, local hashing proves byte identity, not authorship; a descriptor is identity, not authorization; verified RELAY.1A lifecycle state plus exact identity and bytes remain required. Resolve is byte delivery, not execution. There is no automatic dispatcher, network service, or auto-execution.
