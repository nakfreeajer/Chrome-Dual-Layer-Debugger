# Chrome Dual-Layer Debugger (CDLD) — Project Charter v1.1
STATUS: HUMAN-APPROVED 2026-10-21
HUMAN APPROVAL DATE: 21 October 2026
AUTHORITY: Human Owner
CANONICAL PROJECT: Chrome-Dual-Layer-Debugger
CANONICAL REPOSITORY: nakfreeajer/Chrome-Dual-Layer-Debugger
ALIGNMENT BASELINE: 31a31a4b05fbe46d7d8806ac0fd5e12227fb1583
SUPERSEDED CHARTER: docs/PROJECT_BRIEF.md v1.0, Human-approved 13 October 2026
SOURCE FOR THIS CLARIFICATION: Human's direct statement that future Chrome-based web-app development must use CDLD in place of raw Playwright as the standard consumer entry point, to avoid separate projects rebuilding GAS/OOPIF raw-CDP implementations.


HUMAN DECISION: The Human Owner approved the complete Charter v1.1 content and documentation-only alignment boundary on 2026-10-21. This charter amendment authorizes no product implementation, tests, shared-browser access, cloud provisioning, retries, or release.


## 1. Origin and permanent product purpose


Ordinary Chrome web apps were already debuggable and testable with Playwright. In the Human Owner's Google Apps Script web-app work, the existing Playwright workflow failed to reliably detect/access a relevant GAS/OOPIF runtime layer. GAS Remote Debugger was built to close that particular gap. CDLD is the project-independent, advanced Playwright-based Chrome debugging/testing capability layer that combines Playwright's ordinary browser semantics with existing GAS Remote Debugger functionality when the specific GAS runtime requires it.


CDLD shall be the preferred consumer-facing Chrome/Chromium debugging and controlled-testing entry point for the Human Owner's future web-app projects, once each relevant integration interface/capability is independently qualified. A consuming project should use CDLD's documented public contract rather than independently inventing raw browser-root CDP, recursive GAS/OOPIF discovery, context ownership, or duplicate cross-layer correlation.


CDLD is not a fork of Playwright merely by virtue of extending its available capabilities. Playwright remains an underlying execution dependency and the first choice for ordinary semantic browser actions; gas-remote-debug remains the existing GAS-specific raw-CDP/OOPIF runtime dependency. CDLD is a unified, reusable capability boundary above those implementations.


The purpose is to let a consuming project use one CDLD Chrome-automation interface across ordinary browser and supported GAS/OOPIF application surfaces. Any capability not yet implemented, exposed, or qualified must be described honestly; the project must not claim drop-in compatibility with the entire Playwright API or universal GAS detection without supporting evidence.


## 2. Users and division of responsibility


Primary users: the Human Owner and authorized AI coding/testing agents working on independent Chrome-hosted web applications, including Google Apps Script applications.


CDLD owns: documented consumer entry-point API/CLI and packaging/usage contract; Chrome/Chromium browser discovery; Playwright and GAS/OOPIF backend selection; accurate page/frame/target/session/runtime identity mapping; authorized target-scoped actions/assertions within supported capability matrix; privacy-reduced deterministic cross-layer traces and error evidence; supported runner/fixture contracts and safe connection/cleanup behavior; regression/conformance tests for CDLD itself.


A CONSUMING WEB-APP PROJECT owns: the specific web application's product logic, its test cases and selectors/expected outcomes, business/user workflows, test data, test scheduling, business-specific fixtures, assertions of product requirements, and application release decisions. It may call CDLD as an automation/debugging dependency, but its own app-testing framework is not part of CDLD's scope.


Consumer non-duplication boundary: no independent new raw-CDP GAS/OOPIF discovery stack in consuming projects by default. If CDLD lacks a needed capability, record the exact consumer use case and reproduce the gap; address it in CDLD's qualified contract, or allow a bounded, explicitly authorized exception in the consumer project. This is a policy goal, not a claim that every consuming repository has already migrated.


## 3. Mandatory CORE deliverables (preserved and clarified)


CORE-01 — Chrome/Chromium Browser Observation
Low-intrusion Playwright/Chrome attachment and ordinary browser page/frame discovery, read-only observation, stable identities and non-destructive disconnect within proven and explicitly authorized scopes. Consumers must not lose ordinary Playwright semantics on non-GAS pages.


CORE-02 — GAS/OOPIF Capability Extension
Compose gas-remote-debug for GAS-specific browser-root recursive OOPIF/session/runtime discovery, target/context selection and authorized access without rediscovering or copying its engine. Current v0.1 mode rule remains EXACT: active URL beginning with https://script.google.com/macros/ => BROWSER_PLUS_GAS; otherwise BROWSER_ONLY. This URL rule alone does not prove universal recognition of all GAS deployment/frame forms. Additional detection requires documented evidence and separate approval.


CORE-03 — Cross-Layer Evidence
One deterministic, run-scoped, privacy-reduced JSONL chronology and proof-backed browser/GAS/callback correlation, preserving the existing exact identity rules. Where a causal relationship cannot be proven, mark it UNCORRELATED/UNKNOWN rather than joining by timing, ordering or URL similarity.


CORE-04 — Shared Browser Interaction Contract AND Consumer Integration Surface
Maintain the common PLAYWRIGHT/GAS_OOPIF action-and-assertion contract and both qualified backend implementations; reuse mature Playwright primitives for ordinary browser actions, and use raw-CDP/GAS implementation only where its special capabilities are necessary. Release 1 retains the existing mandatory 19 qualified common operations and equivalent normalized outcomes through both backends, without waiver or substitution.
Define and demonstrate a documented, stable CDLD consumer-facing entry point (supported CLI and/or exported Node/TypeScript interface) usable by an independent project's runner. A "preferred replacement for invoking Playwright directly" means consumers target the CDLD contract; it is NOT a claim of full Playwright API compatibility.
The four explicit operation gaps — double-click, right-click, drag/drop, file input — and cross-backend screenshot parity remain tracked post-release requirements, not silently deleted.


CORE-05 — Bounded Smoke/Monkey Capabilities
Provide safe authorized, deterministic, replayable smoke and exploratory action primitives so consuming projects can exercise the CDLD interaction layer without hardcoding separate browser/GAS engines. Consumer projects own application-specific test definitions, acceptance policy and app regression inventories. Internal scenarios and fixtures remain compatibility/conformance evidence, not a new general test-management business.


CORE-06 — Regression/Conformance Evidence for CDLD Contract
Persist and validate reproducible smoke/monkey regression suites, deterministic comparisons, and suite/step results for CDLD's declared contracts. A representative consuming-project integration shall demonstrate invocation through CDLD, not duplicated raw-CDP operations. Preserve tracked TEST.1F source at 309f451b2edad6e844e8c58ba113c7cadc4ea7f9 and its history, but FORMAL ACCEPTANCE remains unresolved. Do not turn this into universal business-app regression management.


CORE-07 — Targeted Safety, Authorization and Lifecycle
Maintain explicit OBSERVE/TEST distinction, designated target and backend authorization, safe browser attachment/cleanup, owned page/fixture lifetime and preservation of user-owned browsers. Independently verify cleanup/containment for each explicitly declared Release 1 supported scope. UNKNOWN or FAILED is never VERIFIED. Do not turn these safeguards into a standalone cloud Human issuer, distributed authorization platform or orchestration service.


## 4. Release 1 user outcomes and measurable Definition of Done


OUTCOME A — Ordinary Chrome path: An independent representative consumer invokes CDLD on a non-GAS local web-app fixture and completes one declared supported Playwright-equivalent action/assertion without writing its own CDP connection. Evidence: the versioned CDLD consumer contract, actual consumer call, normalized result, preserved target inventory and safe disconnect.


OUTCOME B — GAS/OOPIF extended path: An independent representative consumer invokes the SAME CDLD entry-point contract against an explicitly authorized synthetic GAS/OOPIF fixture, observes accurate GAS classification and verified child target/session/execution-context mapping, performs one supported in-scope action or inspection that exercises the GAS-specific extension, and receives deterministically attributable result evidence. Evidence must establish real OOPIF context selection rather than merely an outer Playwright page. If this scenario is not yet supported by the currently proven fixture lifecycle, release remains blocked for that declared scope; no fake or mock evidence substitutes.


OUTCOME C — Non-regression/qualified parity: All 19 Release 1 common operations have independently accepted equivalent normalized behavior through PLAYWRIGHT and GAS_OOPIF within their declared test envelope. The five deferred capabilities remain explicit gaps.


OUTCOME D — CDLD evidence and reproducibility: A supported regression/conformance suite can be run and compared according to the accepted contract and produces independently inspectable suite- and step-level results plus accurate privacy-reduced browser/GAS evidence. Fixture ownership, missing evidence and unsupported comparisons fail closed.


OUTCOME E — Safe consumer lifecycle: In each included shared-browser and/or disposable-browser release workflow, the consuming runner can close its runner-owned PAGE/fixture resources and detach without closing another page or the Human's Brave process; relevant pre/post identities and cleanup states are retained sufficiently for independent verification. Exclusions are explicit and must not silently remove a mandatory consumer workflow.


Release rules:
1. Existing accepted V0.1A–K and TEST.1A–1E evidence remains accepted only within its documented scopes. No previously accepted feature is reopened absent direct regression evidence.
2. CORE-06 and CORE-07 continue to block Release 1 until accepted. Source presence, an offline simulated run or one passing synthetic PAGE assertion is not full acceptance.
3. 19 common operations, five post-release gaps, F36 INCONCLUSIVE / EXHAUSTED and historical governance STOP are retained unchanged.
4. Current package.json is private:true and does not expose a versioned public exports contract. CDLD is therefore NOT YET VERIFIED as a reusable drop-in module; public consumption method, package contract and independent consumer proof require separate bounded work and acceptance.
5. Release publication requires separate Human approval after all mandatory scoped evidence is accepted.
6. Unsupported GAS/OOPIF coverage, page/FRAME fixture lifecycle or shared-browser disconnect must fail closed or be documented as not yet qualified; no inferred PASS.


## 5. Explicit non-goals and anti-drift boundaries


- Building a standalone replacement for Playwright's full API or a speculative upstream Playwright fork.
- Creating a general consumer-project UI-test authoring platform, dashboard, scheduler, test management SaaS or business application's regression catalog inside CDLD.
- Duplicating gas-remote-debug's recursive target/session discovery engine or inventing project-local raw-CDP GAS engines without a measured CDLD gap and separate owner approval.
- Generalized business-site/production testing outside separately authorized targets.
- Firestore/Cloud Run Human issuer, general approval infrastructure, independent cloud governance service, automated Orchestrator, watcher or additional AI agent.
- Unqualified shared-browser lifecycle and generalized claims from narrowly scoped fixtures.
- Additional browser backends, visual dashboard or the five explicitly deferred CORE-04 capabilities as Release 1 prerequisites.


Do not make safer-sounding tooling, a new service, another harness or a longer approval chain mandatory unless it demonstrably and proportionately enables one named CORE user outcome. Supporting infrastructure without CORE advancement is a bounded blocker, not the product.


## 6. Objective lock, AMO governance, and role authority


The Human Owner alone decides product purpose, consumer scope, mandatory release boundaries and changes to this charter. Architect-Curator interprets charter intent, verifies the exact repository/approved charter/AGENTS.md/HANDOVER.md freshly before EVERY Executor prompt, constructs measurable milestones, independently reviews evidence and curates official documentation. Codex Executor performs bounded authorized work and challenges source contradictions; it never self-accepts. Human manual relay remains in place; no automatic Orchestrator is installed for CDLD.


Mandatory alignment fields per proposed milestone: PROJECT, REPO, verified HEAD, CHARTER, ALIGNMENT=CORE|BLOCKER|OPTIONAL|DRIFT, TARGET, originalObjective, gap, user-visible OUTCOME_TEST (actual result + exact evidence + pass/fail rule), necessity and simpler alternative, SUPPORT_STREAK, five-milestone checkpoint status, exact Human authorization type (READ_ONLY|IMPLEMENTATION|LIVE|CHARTER_AMENDMENT), allowed changes, STOP. If missing or contradictory: HOLD; do not issue an executable prompt.


After one support-only/blocker milestone without measurable CORE progress, no automatic continuation absent an exact Human-approved finite batch with its own attempt budget and fallback. Five-milestone value reviews apply even to failed/inconclusive runs. Historical F36–F49 stop status remains HISTORICAL_STOP_TRIGGERED and must not be reset by renaming, handover or project-switch.


No separate project may silently send work into CDLD's Executor, and CDLD may not modify AFFOTECH or another consumer repository without a separate Human-authorized integration milestone.


## 7. Preserved evidence and unresolved qualifications


Source baseline: GitHub main and local origin/main were verified at `31a31a4b05fbe46d7d8806ac0fd5e12227fb1583` for this documentation-only alignment on 2026-10-21.


- Earlier V0.1A–K and TEST.1A–1E retain recorded bounded acceptance.
- TEST.1F implementation exists, offline source/tests qualified in bounded scope. PAGE.1D genuine synthetic PLAYWRIGHT PAGE suite execution reportedly PASS, but complete milestone INCONCLUSIVE_CLEANUP owing to missing durable final target digest set; it must not be rewritten as full PASS.
- Human-owned Brave 9444 read-only baseline snapshot accepted 15 October 2026. One snapshot does not establish preserved targets or safe attached-browser test lifecycle; new test requires separate explicit authorization.
- CORE-06 and CORE-07 formal Release 1 acceptance remains pending.
- F36 remains INCONCLUSIVE / EXHAUSTED; F37–F49 cloud-issuer/authorization investigation is historical drift or support-only evidence, not a mandatory implementation path.
- Existing pinned gas-remote-debug dependency and package manifest should be reconciled from exact repository source: historical documentation references one pin, package.json currently contains a different pin. Do not silently claim a version or change it in a docs-only task.
- Keep technical Test Evidence Ledger, source docs, accepted evidence hashes and historical classifications intact. If no append-only ledger exists, report its absence rather than claiming it is complete.


## 8. Architecture of consumption


INDIRECT DEPENDENCY MODEL:
Consuming app's test runner / Codex Executor
    -> documented CDLD API or CLI (when qualified)
        -> ordinary Chrome/Page path: Playwright semantic primitives
        -> GAS-specific runtime path: GasAdapter -> existing gas-remote-debug -> target/session/context CDP
        -> normalized evidence and target-scoped safety
    -> Chrome/Chromium


Current implementation has a CLI and internal modules. Production-quality consuming-project module/package exposure must be independently confirmed and versioned before declaring the external integration usable. No code, export map or upstream Playwright behavior is changed or authorized by this documentation alignment.


## 9. Formal amendment control


This v1.1 document is the Human-approved clarification of the permanent product purpose and consumer boundary. It preserves existing CORE IDs and historical acceptance while adding a measurable independent-consumer outcome to the Definition of Done. This is documentation authority only; it does not accept CORE work, declare Release 1, or authorize implementation or live browser tests. Historical event records remain append-only.
