# Chrome Dual-Layer Debugger — Project Charter v1.0

**Authority:** Human Owner
**Status:** APPROVED (2026-10-13)
**Human decision:** “APPROVE CHARTER”
**Canonical project:** Chrome-Dual-Layer-Debugger
**Canonical repository:** nakfreeajer/Chrome-Dual-Layer-Debugger
**Approved baseline:** be59c528d585f43a5db5dd298c22ca4a55783e75

This is the single authoritative project objective and Release 1 boundary. Adoption records the already approved charter; it does not accept product work, claim Release 1 completion, or authorize a new implementation/live milestone.

## 1. Permanent Project Objective

Build reusable Chrome/Chromium cross-layer debugging and controlled testing for ordinary browser and Google Apps Script web applications, producing deterministic, privacy-reduced evidence of browser actions, supported backend interaction, callbacks, and test outcomes.

The product combines read-only-first browser/GAS observation, deterministic cross-layer correlation, authorized smoke and monkey/exploratory testing, replayable regression suites, and safe bounded execution. It is a usable debugger/testing tool, not a general cloud authorization or orchestration platform.

Passive observation is the default. Mutating behavior requires explicit TEST-mode authorization against a designated test target. Human authority and manual relay remain in force; no automated Orchestrator or automatic execution is authorized.

## 2. Mandatory Deliverables

### CORE-01 — Browser Observation

Low-intrusion Chrome/Chromium attachment, page/frame discovery, browser/CDP observation, stable identity, and nondestructive disconnect within the explicitly qualified scope.

### CORE-02 — GAS Integration

BROWSER_PLUS_GAS mode uses the exact documented URL-prefix rule and the existing gas-remote-debug dependency for GAS/OOPIF runtime discovery.

For v0.1, a URL beginning with `https://script.google.com/macros/` selects BROWSER_PLUS_GAS; otherwise select BROWSER_ONLY. Do not add heuristic GAS detection without evidence.

### CORE-03 — Cross-Layer Evidence

Run-scoped, normalized, privacy-reduced JSONL evidence and deterministic browser/GAS/callback correlation. Unsupported relationships remain explicitly uncorrelated; timing, ordering, URL similarity, or other guesses are not correlation authority.

### CORE-04 — Dual-Backend Testing Contract

The common Playwright/GAS_OOPIF action/assertion contract is mandatory.

**Release 1 requirement:** all 19 existing qualified common operations must produce equivalent outcomes through both backends.

**Tracked post-release backlog:** double-click, right-click, drag/drop, file input, and cross-backend screenshot parity. These five requirements are deferred from Release 1, not deleted or silently promoted. Existing separately qualified backend-specific screenshot evidence may remain within its stated limitations.

### CORE-05 — Smoke and Monkey Testing

Authorized bounded scenario execution, seeded deterministic exploratory generation, reproducible replay, supported assertions, and privacy-reduced failure evidence.

### CORE-06 — Replayable Regression Suites

Persist, execute, and compare reproducible smoke/monkey suites against declared expected outcomes, with deterministic comparison and suite-level and step-level results.

The tracked TEST.1F implementation exists at commit `309f451b2edad6e844e8c58ba113c7cadc4ea7f9`; its formal acceptance remains unresolved. Charter adoption does not upgrade its status.

### CORE-07 — Safe Testing and Lifecycle Governance

Explicit OBSERVE/TEST separation, target-scoped authorization, containment, resource ownership, bounded execution, and verified cleanup within every declared supported Release 1 execution scope. UNKNOWN or FAILED cleanup is never VERIFIED.

## 3. Release 1 Definition of Done

- **CORE-01 evidence:** demonstrated low-intrusion attach/discovery, stable identity, and nondestructive disconnect within supported scope.
- **CORE-02 evidence:** verified GAS detection, runtime discovery, and proof-backed mapping.
- **CORE-03 evidence:** valid JSONL, run identity, redaction, and fail-closed proof-based correlation.
- **CORE-04 evidence:** all 19 approved common operations PASS through both backends with documented equivalent normalized behavior, without narrowing or substitution.
- **CORE-05 evidence:** verified bounded smoke/monkey execution, seed replay, assertions, and failure evidence.
- **CORE-06 evidence:** independently accepted regression-suite source, execution, comparisons, and result artifacts.
- **CORE-07 evidence:** independently verified authorization, containment, ownership, and cleanup for each release-supported execution lifecycle.

### Release rules

1. Implementation is not acceptance; a green test alone is not product release approval.
2. CORE-06 and CORE-07 are Release blockers until independently accepted.
3. The four named CORE-04 operations plus screenshot parity remain explicitly tracked for post-release; they are not erased by deferral.
4. Unsupported operations must fail clearly, not report PASS.
5. The Architect cannot narrow the 19-operation baseline or waive CORE-06/CORE-07.
6. Lifecycle may be qualified for a declared scope only when exclusions are truthful, evidence-backed, Human-approved, and do not secretly remove a mandatory Release 1 workflow.
7. F36 remains INCONCLUSIVE / EXHAUSTED. Paperwork or unrelated testing cannot reclassify it as PASS. If a proposed release workflow depends on its unresolved lifecycle, that workflow remains blocked until new evidence or a separately approved Human release-boundary amendment.
8. Publication requires separate Human release authorization after mandatory acceptance.

## 4. Explicit Release 1 Non-Goals

- Firestore/Cloud Run authorization platform or independent cloud Human issuer.
- Automated Orchestrator, additional AI agents, watcher, dispatcher, or automatic execution.
- Generalized production/business-site tests.
- Unqualified shared-browser lifecycle.
- New backend integrations or visual dashboards.
- The five expressly deferred CORE-04 capabilities listed above.

These exclusions do not erase post-release requirements or waive safety. Technical implementation libraries and approaches may change without charter amendment only when mandatory objectives and Definition of Done remain intact.

## 5. Project Objective Lock — Six Controls

### 5.1 Classify each proposed milestone

Classify each proposal as CORE (direct deliverable), BLOCKER (evidenced necessity to unblock a deliverable), OPTIONAL (useful but nonessential), or DRIFT (changes the product objective). DRIFT stops pending Human charter amendment. OPTIONAL requires separate prioritization.

### 5.2 Required alignment record

Every CORE/BLOCKER Executor prompt records project/repository, charter revision, target CORE ID, measured missing evidence, measurable expected result, exact acceptance evidence, permissions/stop conditions, and current consecutive blocker count. Example: `ALIGNMENT=CORE | TARGET=CORE-06 | EXPECTED_RESULT=Regression-suite comparison qualification`. If the claimed relationship is absent or contradicted, return BLOCKED_OBJECTIVE_DRIFT.

### 5.3 Two-blocker stop; no reset

Two consecutive BLOCKER milestones without independently verified CORE advancement trigger mandatory STOP/REASSESS. Continuing the same investigation requires NEW EVIDENCE, explicit Human permission, and a stopping rule. Renaming, splitting, reclassifying, or moving work between sessions never resets the count. There is no automatic continuation.

### 5.4 Independent Executor check

The Executor independently checks the charter, CORE linkage, and exact repository. A project identity mismatch returns PROJECT_ID_MISMATCH; contradiction returns BLOCKED_OBJECTIVE_DRIFT. The Executor never accepts its own work or amends the charter.

### 5.5 Project isolation

One Architect session covers one repository, charter revision, and evidence scope. Evidence from another project cannot silently become CDLD authority.

### 5.6 Five-milestone review

After every five milestones, including failed and blocked attempts, the Architect records independently accepted CORE progress, remaining deliverables, supporting efforts, blockers/opportunity cost, and the next recommendation. Counters and decisions persist across chat handovers.

## 6. Human Authority

Only the Human Owner may change the product objective, mandatory deliverables, Release completion requirements, or explicit non-goals. Approval of an ordinary milestone is not a charter amendment. Technical design may evolve within approved outcomes.

CDLD retains manual Human relay. No automated Orchestrator, cloud service, or new governance agent is authorized.

## 7. Verified Baseline and Outstanding Qualifications

Approved baseline: `be59c528d585f43a5db5dd298c22ca4a55783e75`. The baseline references `docs/PROJECT_BRIEF.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/VALIDATION.md`, `docs/PROJECT_HISTORY.md`, and `docs/DECISIONS.md`.

- Preserve V0.1A–K and TEST.1A–1E as historically accepted only within their recorded bounded scopes.
- TEST.1F Replayable Regression Suites implementation is present at `309f451b2edad6e844e8c58ba113c7cadc4ea7f9`, but FORMAL ACCEPTANCE IS UNRESOLVED. This adoption does not upgrade TEST.1F. Ignored local Stage F36–F49 artifacts are a separate sequence; the name overlap is not authority.
- F36 remains INCONCLUSIVE / EXHAUSTED; cause, root cause, ownership, and cleanup uncertainties remain UNKNOWN. F47–F49 are offline/design artifacts only, not live permission or mandatory cloud work.
- Release 1 includes the 19 qualified common operations. Four other operations and screenshot parity remain tracked post-release requirements.

## 8. Technical Design Baseline

The project remains TypeScript on Node.js. Keep modular adapters and observability before automation. Playwright owns semantic browser interaction and should reuse its primitives when they satisfy the common contract. CDP remains the low-level observation and verification layer; Playwright-backed CDP and raw CDP may be composed where evidence shows that is needed.

GAS/OOPIF runtime discovery uses raw CDP through the existing pinned `gas-remote-debug` dependency for exact target/session/context ownership. Do not copy its recursive discovery engine without demonstrated need. JSONL remains the initial unified timeline format. Playwright and GAS/OOPIF are equal execution backends for the declared common contract; implementation may differ, while normalized behavior must remain equivalent for capabilities claimed common. Extensible backend adapters may be considered later, but are not a v0.1 deliverable.
