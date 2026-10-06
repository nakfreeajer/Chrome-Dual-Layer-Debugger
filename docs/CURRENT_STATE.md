# Current State

## Status
V0.1J privacy-limited V1 evidence production and V0.1K raw child/OOPIF marker fusion are accepted and published together at `9e6998488b02e5493f4a4b34e6c0b60b8d193465`. TEST.1A dual-backend capability parity is accepted, live-qualified and published at implementation commit `65f82b3fe9bc48f1d8a0c1f02429713d9c6d4878` with documentation closure `c6d0d09d41eae9417b4edc5df4a6a1568a2bc468`; its capability matrix records 19 common operations as PASS, four as GAP, and screenshot as backend-specific. TEST.1B Controlled Smoke Scenario Runner is accepted and closed at source commit `9f54b116f20fa56246546602b26d47eb519ac77a` and documentation commit `0202d6a522be37b4718b80cfa3d4808efe090a16`; its four bounded Brave scenarios and 214/214 regression suite passed. By Rony Finster's explicit decision, TEST.1C Bounded Monkey / Exploratory Action Engine is AUTHORIZED / NEXT for bounded source implementation under the architecture recorded below. TEST.1C implementation has not started and is not accepted. TEST.1D and later remain PLANNED / NOT AUTHORIZED. Passive observation remains the default outside explicit TEST authorization. Executor -> Architect evidence relay remains manual; no Orchestrator, watcher, dispatcher, or automatic execution exists.

## Repository
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`
- Accepted V0.1D implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`
- Accepted V0.1I implementation HEAD: `348dfa6b9c81dbf55233bc87ce05f417973fb61d`
- Accepted combined V0.1J/V0.1K implementation HEAD: `9e6998488b02e5493f4a4b34e6c0b60b8d193465`
- Accepted TEST.1A implementation HEAD: `65f82b3fe9bc48f1d8a0c1f02429713d9c6d4878`
- TEST.1A documentation closure HEAD: `c6d0d09d41eae9417b4edc5df4a6a1568a2bc468`
- `gas-remote-debug` dependency baseline: `nakfreeajer/gas-remote-debug@75462b81c55c6c113e552dcd5544949bd765e90a`
- Language/runtime: TypeScript + Node.js

## Local workspace
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Ignored `.agent-work/` hierarchy remains the local raw-evidence workspace.
- Substantial tasks normally live in a dedicated Google Drive prompt document/folder; chat carries a short launcher. Rony manually relays Executor evidence to the Architect. RELAY.1A/1B descriptor transport remains optional historical tooling for specific use, not the normal project-management workflow.

## Architect-Curator verification status
### V0.1A — Browser attachment & read-only discovery
`ACCEPTED` and published at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

### V0.1B — GAS dual-layer coexistence / integration proof
`ACCEPTED` and published at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

### V0.1C — Read-only unified timeline
`ACCEPTED` and published at `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.

### V0.1D — Run / trace identity
`ACCEPTED` after independent Architect review of the complete patch, final report and uploaded two-run JSONL evidence. Published implementation is visible on GitHub at `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.

Accepted V0.1D capabilities:
- each `Timeline` owns exactly one `runId`;
- default run identity uses Node `crypto.randomUUID()` with deterministic constructor injection available for tests;
- `TraceEvent.runId` is required for V0.1D events;
- every event created by one Timeline carries the same immutable run identity;
- `Timeline.append()` rejects events from a different run;
- event numbering remains intentionally per-run (`EVENT-000001` onward);
- the pair `(runId, eventId)` is the unambiguous cross-run event identity;
- JSONL append format remains unchanged and historical V0.1C JSONL was not rewritten;
- CLI exposes the current Run ID;
- no browser, GAS, mapping or redaction behavior was broadened.

Accepted V0.1D validation:
- `npm run check` passed;
- `npm test` passed 22/22 tests;
- baseline-to-HEAD `git diff --check` passed;
- live validation appended two debugger runs into one fresh ignored JSONL file;
- 83 total events across 2 distinct run IDs;
- run 1 contained 41 events and run 2 contained 42 events;
- both runs correctly restarted local event numbering at `EVENT-000001`;
- 41 duplicate raw `eventId` values across the whole file were expected;
- duplicate `(runId,eventId)` pairs: 0;
- malformed JSON lines: 0;
- each run contained exactly one `SESSION_STARTED` and one `SESSION_ENDED`;
- browser target identities remained unchanged and the endpoint remained responsive;
- navigation, reload, click, typing, DOM/storage mutation, page close and browser-process close were all `NO`.

## Established architecture
- Playwright and GAS/OOPIF are now the intended equal control/debugging backends under one CDLD capability contract.
- The Playwright backend should reuse Playwright semantics where they satisfy the contract and may combine raw CDP where required.
- The GAS/OOPIF backend uses raw CDP plus `gas-remote-debug` exact target/session/context ownership and must be improved toward the same declared common interaction/assertion capabilities.
- Chrome-Dual-Layer-Debugger owns normalized chronology, run identity, debugger-local event identity/order, JSONL persistence, action/assertion evidence and evidence-backed cross-layer mapping.
- Correlation must be deterministic; timing or URL equality alone is insufficient.
- Unknown relationships remain unknown rather than guessed.

## GAS mode rule
`https://script.google.com/macros/` prefix -> `BROWSER_PLUS_GAS`; otherwise -> `BROWSER_ONLY`.

## Governance state
- Human Owner: Rony Finster.
- Architect-Curator: ChatGPT Architect for this project.
- Executor: bounded Codex execution role.
- There is no automated Orchestrator, watcher, dispatcher, network relay, automatic Executor start, or auto-execution.
- Current governance is Rony -> Architect -> Executor -> Architect independent verification, followed by documentation synchronization when required and a Rony/Architect decision on next work. Substantial task bodies are stored in Google Drive and launched from chat with a short instruction. RELAY.1A/1B remains optional technical tooling only. There is no automated dispatch. Executor -> Architect evidence relay remains manual.

## Accepted correlation chain - V0.1E through V0.1I
- V0.1E established that native browser/CDP identities do not deterministically link a frontend `google.script.run` invocation to GAS execution and its callback; timing, ordering, function name and URL similarity are not correlation authority.
- V0.1F proved in a disposable fixture that an explicit opaque token, paired with the exact CDP requestId, can link client invocation, transport, dedicated GAS execution, response and callback.
- V0.1G found that transparent universal wrapping can change native Apps Script failure semantics, so semantic transparency is not established.
- V0.1H qualified an explicit cooperative, versioned application contract. Native calls remain untouched and uncorrelated; explicit application failures are not native `ScriptError` equivalence.
- V0.1I implemented a passive, run-scoped V1 evidence recognizer. It assigns `correlationId` only after request, response, transport completion and validated completion marker agree. Ordinary traffic remains quiet and uncorrelated.
- V0.1I was accepted and published at `348dfa6b9c81dbf55233bc87ce05f417973fb61d`; deterministic validation passed (`npm run check`, `npm test` 52/52, `git diff --check`). Accepted disposable live validation proved one success and one explicit application failure correlation alongside an untouched ordinary native call.

## Current integration boundary
The opt-in V0.1J producer now feeds privacy-reduced Playwright/page-scoped Network evidence and raw child/OOPIF Runtime completion-marker evidence into the same V0.1I recognizer. The CLI enables observation only when `--observe-v1-ms` is supplied. Playwright Page console events are not production marker authority; late Playwright console observation may miss child/OOPIF markers. The recognizer remains the sole proof authority and assigns `correlationId` only after complete evidence finalization. CDP `requestId` remains session-scoped and separate from `observerScopeId` and application correlation identity.

## TEST.1A - Dual-Backend Capability Contract and Parity Foundation - ACCEPTED / CLOSED

The TEST.1A parity implementation is validated on a real distinct local OOPIF target in the already-running Brave 9444 session. A single 31-step scenario ran first through GAS_OOPIF and then Playwright after fixture reset. All 19 declared common operations produced matching normalized outcomes and expected fixture state. Both backends also passed four assertions and returned the expected deterministic assertion failure without crashing. The capability matrix records 19 PASS, 4 GAP, 0 UNQUALIFIED and 1 BACKEND_SPECIFIC (screenshot). Detailed local evidence is under ignored `.agent-work/artifacts/`.

TEST.1A closed the evidence-backed capability contract and parity foundation. TEST.1B Controlled Smoke Scenario Runner is accepted and closed below. Rony has authorized TEST.1C; its source implementation has not started and is not accepted. Existing user/business tabs remain protected unless separately authorized.

## TEST.1B - Controlled Smoke Scenario Runner - ACCEPTED / CLOSED
- Implementation HEAD: `9f54b116f20fa56246546602b26d47eb519ac77a`; parent: `37fba3c5dcc1f904c7333d72ea989b85853b3374`.
- Added a strict declarative `schemaVersion: 1` smoke scenario parser and CLI, two equal peer backends (`PLAYWRIGHT`, `GAS_OOPIF`), a runner-owned page/session, ordered action/assertion Timeline results, stop-on-first-failure behavior, and owned-page cleanup.
- Authorization intent and approval are validated before runner page creation/navigation. Target-bound authorization is retained after selection. PAGE scope uses `PAGE-*`; FRAME scope binds to the exact public Playwright Frame and preserves a unique normalized frame ID or assigns a stable debugger-local `PLAYWRIGHT-FRAME-*` identity without claiming protocol `FrameId`. GAS_OOPIF retains exact dependency-native target/session/context binding.
- Accepted publication validation: `npm run check` PASS; `npm test` 214/214 PASS; `git diff --check` PASS.
- Accepted live Brave 9444 matrix: PLAYWRIGHT and GAS_OOPIF pass scenarios exited 0 after 8 ordered steps; each deterministic assertion failure exited 2 before its later click. The pre-existing tab remained unchanged, runner-owned pages closed, the fixture server stopped, ports 4558 and 4564 were closed, and the temporary fixture directory was removed. Timeline privacy checks passed.
- No AFFOTECH/business target, external GAS deployment, browser launch/restart/termination, tag, or release was involved.

## TEST.1C - Bounded Monkey / Exploratory Action Engine - AUTHORIZED / NEXT
- Authorization is for bounded source implementation only; it does not mean implementation, validation, or acceptance has occurred.
- Build a deterministic bounded action generator on the accepted TEST.1A action contract and TEST.1B runner/session model. Use a strict project-owned declarative profile with exact PAGE/FRAME target semantics and bounded candidate templates; no arbitrary DOM-wide exploration or executable profile fields.
- Initial generated operations must be mutating operations in the accepted ActionOperation contract and marked `PASS` for both PLAYWRIGHT and GAS_OOPIF. No backend-specific opt-in or GAP/BACKEND_SPECIFIC/UNQUALIFIED operation in the initial slice.
- Generation is deterministic from a versioned generator contract, explicit seed, and validated profile; same inputs produce the same ordered action sequence across backends. Do not use `Math.random()` or ambient nondeterminism.
- Validate the complete profile before runner-owned page creation/navigation. Record generator version, seed, profile identity/hash, backend, ordered generated steps, and terminal result. Record each generated action before execution with stable action identity/order. Keep Timeline privacy-reduced; raw replay material is limited to bounded TEST artifacts for explicitly authorized synthetic/project-owned fixtures.
- Enforce `maxActions` 1..100, `maxDurationMs` 1..60000, and per-action timeout <=10000 ms. Stop on action failure, safety/target guard failure, a reached bound, or setup/infrastructure failure. No infinite generation or unbounded retries.
- Preserve runner-owned PAGE/FRAME target and origin envelope; fail closed if generated navigation or an action moves outside it. Initial live qualification is limited to a disposable local project-owned fixture in the already-running Brave endpoint `http://127.0.0.1:9444`; do not launch/restart/terminate a browser, use port 9222, access business/user targets, or deploy external GAS.
- V0.1I remains the single correlation proof authority. Action identity, generated-action identity, requestId, observerScopeId, correlationId, seed, timing, order, and frame proximity remain separate and are not correlation authority.
- TEST.1C does not absorb TEST.1D assertion/failure-artifact expansion, TEST.1E generalized fixture/reset governance, or TEST.1F persisted regression suites.

## Unresolved items
- Historical V0.1C JSONL lacks `runId`; it remains valid historical evidence and is not migrated by V0.1D.
- Sibling GAS runtime contexts remain intentionally unmapped to Playwright frames when no shared protocol FrameId exists.
- Playwright Page-to-raw-TargetId remains intentionally unmapped through the current public discovery surface.
- `GasAdapter` currently proves one active GAS discovery connection at a time; multi-GAS-tab orchestration has not been established.
- V1 evidence production is opt-in through the CLI; no browser diagnostic is pending.

## Accepted engineering-workflow persistence - RELAY.1A
- RELAY.1A durable prompt artifact foundation was accepted and published at `163b0c008097eb24f1412be31e527f4697d0fc35`.
- Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`, with canonical project `Chrome-Dual-Layer-Debugger` and repository `nakfreeajer/Chrome-Dual-Layer-Debugger`. No `transactionId` was introduced; debugger `runId` remains runtime trace identity.
- Exact prompt Buffer bytes are stored under ignored `.agent-work/prompts/<milestoneId>/<promptSha256>.md`; manifests and lifecycle records are immutable content-addressed JSON. `.agent-work/current/executor-prompt.json` is only a mutable recovery locator, never authority by itself.
- Staging does not authorize execution. Authorization requires an explicit caller-supplied approval reference. Current authorization cannot be displaced by direct authorization; changed decisions require explicit supersession. Revocation and supersession are checked against durable lifecycle evidence and fail closed.
- Verified loading checks locator, manifest, lifecycle, path containment, exact bytes, SHA-256 and byte length. Fresh-store and second-process recovery passed.
- Validation: `npm run check` passed; `npm test` passed 102/102; `git diff --check` passed. The 102 tests include 50 RELAY.1A-focused tests.
- At RELAY.1A publication, the full-prompt relay remained active. RELAY.1B later activated compact descriptor transport; the subsequent governance simplification retired it as the normal operating workflow while preserving its accepted technical implementation. No automatic dispatch or auto-execution exists.

## Historical optional prompt transport tooling - RELAY.1B
- RELAY.1B was accepted and published at `85310e450705e1671ef9e6af22eeae6d9dbcc519`; validation passed with 148/148 tests and process-level exact-byte import/resolve proof.
- The canonical descriptor is `CDLD-PROMPT-V1.<base64url>` and binds schema, project, repository, milestone, prompt SHA-256 and byte length only. It is identity evidence, not authorization.
- The Architect provides the exact prompt file and descriptor. Rony imports/authorizes the exact bytes locally; Executor receives only the descriptor and resolves exact bytes from verified RELAY.1A state.
- RELAY.1B descriptor/import/revoke/supersede/resolve tooling remains valid historical technical work and may be used when specifically needed. The later governance simplification supersedes compact descriptor transport only as the default operating procedure. Current substantial task transport uses Google Drive and a short chat launcher; Executor -> Architect report/evidence transport remains manual.
- No automatic dispatch, watcher, Orchestrator, service, start or execution exists. Resolve supplies bytes; Executor still follows the bounded instruction under the existing authority model.

## Accepted V0.1J and V0.1K correlation evidence production
- Combined implementation published at `9e6998488b02e5493f4a4b34e6c0b60b8d193465`.
- Playwright/page-scoped Network request, response and terminal evidence is fused with exact raw child/OOPIF Runtime completion-marker evidence and passed to the existing single V0.1I recognizer.
- `--observe-v1-ms` is opt-in. Playwright Page console is diagnostic only and is not production marker authority.
- Accepted tests: `npm run check` PASS; `npm test` 178/178 PASS; `git diff --check` PASS.
- Live Brave validation passed with explicit fixture start gating, all four controls ready before the gate, exactly one success and one failure proof, ordinary native traffic quiet, stable target identity, and cleanup verified. No further browser diagnostic is pending.
