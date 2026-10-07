# Decisions

Durable accepted decisions only. Exploratory ideas belong in `IDEA_INBOX.md` until explicitly accepted.

## D-001 — Project independence
Chrome-Dual-Layer-Debugger is an independent project and must not depend on AFFOTECH unless the Human Owner explicitly authorizes future integration.

## D-002 — Primary browser interaction layer
Playwright owns ordinary semantic browser interaction, locators, waits, page/frame operations and controlled browser actions.

## D-003 — CDP role
CDP is a low-level observation and verification layer. For ordinary browser pages, prefer Playwright public `CDPSession` access before introducing a second raw CDP connection.

## D-004 — GAS runtime ownership
`gas-remote-debug` remains the owner of GAS-specific browser-root target discovery, recursive OOPIF/session attachment, runtime-context discovery and exact execution-context access. Chrome-Dual-Layer-Debugger composes it through `GasAdapter` rather than copying its recursive engine.

## D-005 — GAS detection
For v0.1, if the current page URL starts with `https://script.google.com/macros/`, classify as `BROWSER_PLUS_GAS`; otherwise classify as `BROWSER_ONLY`. No additional heuristics are authorized absent contrary evidence.

## D-006 — Evidence model
The project owns a normalized chronological event/timeline model. Correlation must not be invented: events remain uncorrelated until there is deterministic evidence linking them.

## D-007 — Workflow transport
This project uses an AMO-inspired Architect-Curator / Executor workflow but does not use an automated Orchestrator. Rony performs relay manually.

## D-008 — Architect-Curator authority
Rony Finster is the final Human authority. ChatGPT serves as the project Architect-Curator: it owns architecture, milestone design, independent verification, acceptance classification, and synchronization of all relevant official project documentation after accepted work. The Codex Executor remains bounded implementation authority only and never accepts its own work.

## D-009 - Explicit cooperative correlation contract
Deterministic frontend-to-GAS correlation requires explicit application cooperation through the versioned V1 evidence contract. Universal transparent wrapping of arbitrary `google.script.run` runners is rejected because it can alter observable native failure semantics. Ordinary native calls remain untouched and uncorrelated.

## D-010 - Passive fail-closed correlation
The debugger recognizes privacy-reduced evidence and does not patch `google.script.run`, inject calls or rewrite arguments. It assigns `correlationId` only after finalization proves all required evidence agrees. Missing, malformed, duplicate, conflicting, incomplete or unsupported-version evidence remains uncorrelated.

## D-011 - Correlation identity and version authority
CDP `requestId` remains a transport identity; the exact opaque application token may become `correlationId` only after proof. Request contract version 1 and completion-marker version 1 are authoritative; response token equality is required, but response version is not independently parsed. Token prefix, timing, ordering, function name and URL similarity never establish correlation.

## D-012 - Privacy-reduced recognizer input
Only privacy-reduced evidence may enter the V1 recognizer. Raw arguments, request/response bodies, headers, cookies, credentials and sensitive URLs are not retained as normalized correlation evidence. Every CDP evidence producer must preserve observer/session scope because native request IDs are session-scoped.

## D-013 - Prompt workflow identity
For RELAY schema v1, workflow prompt identity is `(project, milestoneId, promptSha256, promptByteLength)`. The canonical project/repository identity is Chrome-Dual-Layer-Debugger / nakfreeajer/Chrome-Dual-Layer-Debugger. No transactionId is introduced; debugger runId remains trace-runtime identity.

## D-014 - Exact-byte content-addressed prompts
Prompt artifacts are hashed and length-checked over exact Buffer bytes. No line-ending, Unicode, whitespace or trailing-newline normalization is allowed. Immutable prompt, manifest and lifecycle objects are content-addressed and never silently overwritten. Historical prompts are not reconstructed or migrated.

## D-015 - Immutable lifecycle and locator boundary
Lifecycle transitions are separate immutable evidence. The mutable current locator is only a recovery locator and never authority by itself. Authorization, revocation and supersession are determined by fully verified durable evidence; corrupt or conflicting state fails closed.

## D-016 - Authorization is separate from integrity
Staging or a valid SHA-256 proves neither permission nor approval. Authorization requires a non-empty explicit approval reference supplied by the caller. The store records this reference but does not authenticate it cryptographically; Rony Finster remains final Human authority.

## D-017 - Explicit prompt supersession
An active authorized prompt cannot be displaced by direct authorization. A changed decision affecting it requires explicit supersession, immutable supersession evidence and verified locator transition. Revoked identities cannot simply be re-authorized.

## D-018 - Local evidence and no historical reconstruction
Prompt artifacts remain under ignored local `.agent-work/`; they are not committed project source. Do not reconstruct historical prompt bytes from chat or migrate old prompts without separate authority.

## D-019 - RELAY.1A did not change transport
At RELAY.1A publication, durable local prompt storage and verified loading did not change the full-prompt Architect -> Human -> Executor procedure. Compact transport required separate RELAY.1B review and authorization; the later accepted RELAY.1B decision below supersedes the transport status. Neither milestone authorizes automatic dispatch or prompt execution.

## D-020 - Canonical compact prompt transport identity
After RELAY.1B documentation closure, Architect -> Executor transport uses the canonical `CDLD-PROMPT-V1.<base64url>` descriptor. V1 has the exact ordered schema `schemaVersion, project, repository, milestoneId, promptSha256, promptByteLength`. The descriptor contains identity only and never local paths, approval data, prompt body, username, runId, transactionId, commands, or secrets.

## D-021 - Architect bytes must be verified before store mutation
The local importer accepts an Architect-transported prompt file plus descriptor and verifies exact SHA-256 and byte length before staging or authorization. A local formatter/hash of an arbitrary file does not create Architect authority. RELAY.1B prompt text must be nonempty valid UTF-8 without NUL; original bytes, including optional BOM, remain unchanged.

## D-022 - Resolve is exact-byte delivery, not execution
Executor resolves a descriptor only against fully verified RELAY.1A authorized state. It receives exact stored bytes only after all checks pass. Resolve success writes prompt bytes alone with no added newline; failure writes zero prompt bytes to stdout. The Executor decides and acts only under the bounded instruction and existing authority model.

## D-023 - Explicit correction, withdrawal, and manual control
Same-milestone correction uses explicit supersede; different-milestone transition requires revocation before import. No auto-supersession, auto-revocation, auto-dispatch, or auto-execution exists. Human transport and approval remain manual, as does Executor -> Architect evidence relay.

## D-024 - One V1 proof authority with split evidence ownership
V0.1J/V0.1K use Playwright/page-scoped CDP Network observation for privacy-reduced request, response and transport-terminal evidence, and raw child/OOPIF Runtime observation only for exact cooperative completion markers. Both feed the existing V0.1I recognizer; competing recognizers are not introduced. The native CDP requestId remains separate from observerScopeId and the application correlationId. Playwright `Page.on('console')` is not production marker proof input. Timing, arrival order and frame proximity are not correlation authority.

## D-025 - Evidence-backed equal testing backends
PLAYWRIGHT and GAS_OOPIF implement the same CDLD action/assertion contract and are equal execution backends. A common capability is marked `PASS` only after both backends execute the same disposable scenario with equivalent normalized outcomes and expected fixture effects. TEST.1A live qualification established 19 common PASS capabilities; unsupported and backend-specific operations remain explicit in the capability matrix. Mutations require explicit target/backend-bound TEST authorization. This decision did not itself authorize a general runner; TEST.1B separately implemented a bounded runner and still does not authorize production/business testing or unqualified capabilities.

## D-026 - Governance transport simplification
The current project-management loop is Rony -> Architect -> Executor -> Architect independent verification, followed by documentation synchronization when required and a Human/Architect decision on next work. For substantial tasks, the Architect stores the full task in Google Drive and chat carries a short launcher. This supersedes RELAY.1B descriptor transport only as the normal operating workflow; RELAY.1A/1B implementation and acceptance remain valid historical technical work and may be used when specifically needed. Human authority and manual Executor-to-Architect evidence return remain unchanged. No Orchestrator, watcher, dispatcher, or automatic execution is introduced.

## D-027 - Controlled declarative smoke runner
TEST.1B provides an explicit smoke CLI for strict project-owned `schemaVersion: 1` declarative scenarios, with no arbitrary JavaScript/eval/expression fields. The complete scenario and TEST intent/approval preconditions must validate before runner-owned page creation or navigation. Actions are bound to a runner-owned page and exact PAGE/FRAME target identity; a debugger-local `PLAYWRIGHT-FRAME-*` identity is not a protocol FrameId. PLAYWRIGHT and GAS_OOPIF remain equal peer backends only for the capabilities explicitly qualified in the capability matrix. Execution stops at the first failed step and Timeline output remains privacy-reduced. This runner does not authorize production/business targets or unqualified capabilities.

## D-028 - Bounded deterministic TEST.1C exploratory generation
TEST.1C's initial authorized implementation boundary is a strict project-owned declarative profile targeting the existing TEST.1B exact PAGE/FRAME model; arbitrary DOM-wide exploration and executable profile fields are out of scope. Generated mutating actions must be in the accepted ActionOperation contract and `PASS` for both PLAYWRIGHT and GAS_OOPIF; backend-specific opt-in and GAP/BACKEND_SPECIFIC/UNQUALIFIED operations are excluded. Ordered generation is deterministic from a versioned generator contract, explicit seed and validated profile, and must not use `Math.random()` or ambient nondeterminism. Validate the entire profile before runner-owned page creation/navigation, record each generated action before execution, and retain only privacy-reduced Timeline evidence plus bounded replay artifacts for authorized project-owned synthetic fixtures. Enforce maxActions 1..100, maxDurationMs 1..60000 and per-action timeout <=10000 ms; stop on first failure, guard failure, bound, or setup/infrastructure failure. Affect only the exact runner-owned authorized PAGE/FRAME and fail closed outside its target/origin envelope. Use only the already-running Brave 9444 endpoint for initial live qualification; no external GAS deployment, user/business target, or browser launch/restart/termination. Correlation remains exclusively governed by V0.1I; generated-action identity, seed, timing/order and frame proximity are never correlation authority. TEST.1D/1E/1F responsibilities remain separate and unauthorized.

## D-029 - Accepted bounded TEST.1C exploratory engine

TEST.1C closes with deterministic bounded action generation under `TEST1C_GEN_V1` and an explicit seed, using a validated declarative profile and pre-generated backend-neutral plan. Actions remain limited to capabilities marked PASS for both PLAYWRIGHT and GAS_OOPIF and are bound to the exact runner-owned PAGE/FRAME target. The public Playwright request latch independently enforces main-page and selected-frame origin boundaries before commit. GAS_OOPIF FRAME scope uses the accepted fixed 50 ms event-delivery drain only as bounded safety synchronization, never as correlation evidence. V0.1I remains the sole correlation authority; requestId, observerScopeId, correlationId, generated-action identity, seed, and timing/order remain distinct. TEST.1D/1E/1F are separate and unauthorized.

## D-030 - Bounded TEST.1D assertions and failure artifacts

Authorize only a bounded implementation of the exact common predicates `truthy`, `falsy`, `equals`, `notEquals`, `contains`, and `notContains`, using existing equality semantics and non-mutating common PASS reads. Default Timeline and failure evidence remain privacy-reduced; exact values/selectors require explicit opt-in for authorized synthetic fixtures and hard bounds. Failure artifacts use a versioned `CDLD_TEST1D_FAILURE` envelope with exact `(runId,eventId)` references and no approvalReference. Bounded screenshot/DOM/runtime diagnostics are session-level evidence, not capability parity; capture is status-reported and cannot replace the test outcome. Reuse existing runner/session ownership and TEST.1C containment. V0.1I remains the sole correlation authority, with only `PROVEN_BY_EXISTING_EVIDENCE`, `RUN_CONTEXT_ONLY`, or `UNKNOWN` relationships. TEST.1E and TEST.1F remain separate and unauthorized.

## D-031 - Accepted TEST.1D assertions and failure artifacts

TEST.1D closes with the exact six predicates `truthy`, `falsy`, `equals`, `notEquals`, `contains`, and `notContains`, shared semantics across PLAYWRIGHT and GAS_OOPIF, normalized assertion Timeline evidence, and `CDLD_TEST1D_FAILURE` schema v1 artifacts. Default evidence is privacy-reduced; synthetic detail and screenshots are bounded and opt-in. DOM/runtime/screenshot diagnostics have a 5-second total deadline, no retries, and cannot continue into later stages after timeout. Target-envelope checks fail closed and omit unsafe diagnostics. GAS readiness requires a live default context for the exact authorized target and attached session. Timeline references use exact `(runId,eventId)` identity; V0.1I remains the sole correlation proof authority. TEST.1E and TEST.1F remain PLANNED / NOT AUTHORIZED.
