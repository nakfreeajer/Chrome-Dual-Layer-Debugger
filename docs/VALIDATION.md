# Validation

## General rule
Important conclusions must come from recorded evidence rather than assumption. Validation should be proportional to milestone risk.

## Accepted local-workspace bootstrap validation
The 2026-09-28 bootstrap is accepted based on the Human-relayed Executor terminal report plus independent GitHub verification of the reported remote baseline. Local-only filesystem facts cannot be reconstructed from GitHub, so Architect review of such facts relies on bounded Human-relayed Executor evidence unless additional local evidence is supplied.

## Accepted V0.1A browser attachment/read-only discovery validation
V0.1A is accepted against baseline `736742a08cf357fe19acac7e4425f6de54090643`, with final implementation at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

Accepted evidence:
- `npm run check` passed;
- `npm test` passed 8/8;
- `git diff --check` passed;
- repeated discovery preserved debugger-local context/page/frame IDs;
- target identities before/after disconnect were unchanged;
- endpoint remained responsive;
- no navigation, reload, click, typing, storage/DOM mutation, page close or browser-process close occurred.

## Accepted V0.1B GAS dual-layer coexistence validation
V0.1B is accepted against baseline `4d19e3b1f3ad776ac64deedbccbd66f6e440d60a`, with implementation at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

Dependency baseline:
- `nakfreeajer/gas-remote-debug@ac4359aa790af19cafe1a7e9a55ecd50f68e9169`;
- version `0.1.0`;
- dependency tests 94/94 passed;
- dependency is commit-pinned from GitHub because no npm-published package was available.

Accepted evidence:
- primary `npm run check` passed;
- primary `npm test` passed 13/13;
- complete-range `git diff --check` passed;
- `GasAdapter` activated only for the exact GAS prefix;
- dependency-native target/session/frame/context IDs were preserved;
- Playwright and `gas-remote-debug` remained simultaneously usable;
- exact shared root FrameId evidence mapped the root frame/context;
- sibling sandbox contexts and Playwright Page-to-TargetId remained explicitly unmapped;
- target identities remained unchanged and endpoint remained responsive;
- no destructive browser/application mutation occurred.

## Accepted V0.1C read-only unified timeline validation
V0.1C is accepted against baseline `4045ccbf0949878d14bda5931ecee139c9e7f759`, with implementation at `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.

Accepted deterministic validation:
- `npm run check` passed;
- `npm test` passed 19/19;
- `git diff --check` passed for the complete baseline-to-final range;
- tests cover deterministic per-run event ID/sequence allocation, strict append ordering, source monotonic timestamp preservation/non-fabrication, JSONL append/parse behavior, normalized browser/GAS evidence, mapping evidence and explicit unmapped identities.

Accepted live validation against `http://127.0.0.1:9222`:
- one already-open GAS page was observed without navigation;
- output contained exactly 40 valid JSONL events;
- duplicate event IDs: 0;
- sequence gaps: 0;
- malformed JSON lines: 0;
- timeline contained 2 `MAPPING_PROVEN` events and 3 `IDENTITY_UNMAPPED` events;
- browser target identities before/after disconnect were unchanged;
- endpoint remained responsive after cleanup;
- URL query values and Apps Script deployment path token were redacted;
- no destructive browser/application mutation occurred.

## Accepted V0.1D run / trace identity validation
V0.1D is accepted against baseline `6c737e981901c79d3425c5b3288c4b8b737761e5`, with implementation at `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.

Accepted deterministic validation:
- `npm run check` passed;
- `npm test` passed 22 tests, 0 failed, 0 cancelled, 0 skipped, 0 todo;
- `git diff --check 6c737e981901c79d3425c5b3288c4b8b737761e5..HEAD` passed;
- tests cover fixed/injected run identity, distinct default run IDs, per-run event numbering, immutable/consistent run ownership, session start/end identity, browser/GAS/mapping propagation, foreign-run append rejection, and two-run JSONL append behavior;
- historical V0.1C JSONL was not rewritten.

Accepted live two-run validation against `http://127.0.0.1:9222`:
- two sequential debugger executions used the same fresh ignored JSONL output file;
- total JSONL events: 83;
- distinct run IDs: 2;
- run 1 contained 41 events, `EVENT-000001` through `EVENT-000041`;
- run 2 contained 42 events, `EVENT-000001` through `EVENT-000042`;
- duplicate raw `eventId` values across the file: 41, expected because numbering is per-run;
- duplicate `(runId,eventId)` pairs: 0;
- malformed JSON lines: 0;
- each run contained exactly one `SESSION_STARTED` and one `SESSION_ENDED`;
- browser target identities before and after both runs were unchanged;
- endpoint remained responsive after both runs;
- accepted V0.1C URL redaction remained intact;
- navigation, reload, click, typing, DOM mutation, storage mutation, page close and browser-process close were all `NO`.

Accepted V0.1D identity rule:
- event IDs remain deterministic and unique only within a run;
- `runId` identifies the debugger execution;
- `(runId,eventId)` is the cross-run event identity;
- no existing JSONL scan is used to continue event numbering across processes.

## Regression contracts
Future work must preserve, as applicable:
- low-intrusion browser attachment and disconnect behavior;
- exact GAS prefix detection;
- `gas-remote-debug` ownership of recursive GAS/OOPIF discovery;
- dependency-native identifier preservation;
- deterministic evidence-only mapping;
- explicit unknown/unmapped relationships;
- normalized timeline ordering without speculative clock reconciliation;
- required run identity for newly generated V0.1D+ trace events;
- per-run event numbering with cross-run identity defined by `(runId,eventId)`;
- independently parseable appendable JSONL output;
- no destructive browser/application mutation unless a separately authorized milestone explicitly changes that contract.

## Test evidence
Executor reports should state exact commands, pass/fail totals, skipped/cancelled tests when relevant, and any live/runtime validation performed.

## Safety boundary
Do not treat successful tests as authorization for commit, push, tag, deployment, browser mutation, or unrelated scope expansion.


## Accepted V0.1E-V0.1H correlation discovery and contract qualification
- V0.1E accepted conclusion: `PROPAGATED_CORRELATION_ID_REQUIRED`; native browser/CDP identity did not link the complete frontend invocation -> GAS execution -> callback chain. Timing, order, function-name coincidence and URL similarity are not valid correlation evidence.
- V0.1F disposable fixture proved an exact opaque token across invocation, CDP request/response, dedicated GAS execution and callback, paired with native CDP requestId; success and controlled failure were observed.
- V0.1G compatibility evidence showed transparent wrapping can alter native Apps Script `ScriptError` behavior. Correlation success alone does not prove semantic transparency.
- V0.1H qualified explicit cooperative, versioned participation; ordinary native calls remain untouched, and explicit application failures do not claim native `ScriptError` equivalence.

## Accepted V0.1I passive V1 recognizer validation
V0.1I was accepted and published at `348dfa6b9c81dbf55233bc87ce05f417973fb61d` as `IMPLEMENTED_WITH_EXPLICIT_LIMITATIONS`.

Accepted deterministic evidence:
- `npm run check` passed;
- `npm test` passed 52/52;
- `git diff --check` passed;
- focused tests cover exact requestId/token/marker joins, success and explicit application failure, evidence-order independence, concurrent same/different functions, duplicate/conflicting/missing/unknown evidence, run scoping, finalization, and privacy minimization.

Accepted disposable live evidence:
- one correlated success and one correlated explicit application failure were proven alongside one ordinary native call;
- exactly two unique `CORRELATION_PROVEN` events were emitted; the ordinary native call remained uncorrelated;
- native `google.script.run` identity/property descriptor remained unchanged;
- temporary project/deployment was removed; endpoint returned 404 after cleanup.

## V0.1I regression contracts
- Never correlate by timing, arrival order, function name or URL similarity.
- Never use a token prefix as contract-version evidence.
- Assign `correlationId` only after complete deterministic proof and finalization.
- Leave ordinary native traffic untouched and uncorrelated.
- Feed only privacy-reduced evidence; do not retain raw arguments, bodies, headers, cookies, credentials or sensitive URLs.
- Preserve CDP requestId as a distinct transport identity.
- Treat CDP requestId as session-scoped; add observer/session scope before sharing identities across multiple CDP sessions.
- Do not claim native `ScriptError` equivalence for the cooperative V1 explicit-failure result.
- Production evidence collection is opt-in with CLI `--observe-v1-ms`; V0.1J/V0.1K acceptance does not enable automatic observation by default.

## Accepted RELAY.1A durable prompt artifact validation
RELAY.1A was accepted and published at `163b0c008097eb24f1412be31e527f4697d0fc35`.

Accepted publication evidence:
- `npm run check` passed;
- `npm test` passed 102/102 (prior regression suite plus 50 RELAY.1A-focused tests);
- `git diff --check` passed;
- post-publication worktree was clean;
- reviewed source hashes were verified before and after publication, including the accepted Unicode fixture.

The focused tests cover exact Buffer identity, LF/CRLF and Unicode preservation, trailing-newline identity, SHA-256 and byte length, malformed/missing/corrupt state, identity/path validation, immutable no-clobber publication, explicit approval, current authorization displacement prevention, revocation and supersession, stale-locator replay rejection, and fresh-store/second-process recovery.

Accepted persistence invariants:
- immutable prompt/manifest/lifecycle objects use exclusive sibling temporary files, synced complete writes, same-directory hard-link no-clobber publication and final readback verification;
- locator replacement uses a synced sibling temporary file and same-directory atomic rename; directory fsync is best effort on Windows;
- persistence semantics were qualified on local Windows/NTFS and same-volume hard-link/rename;
- staging and hash validity do not authorize execution; approval references are audit evidence, not signatures;
- current authorized prompts cannot be silently displaced; supersession is explicit and durable lifecycle evidence rejects stale locator replay;
- corrupt or incomplete locator/lifecycle/artifact evidence fails closed;
- recovery follows exact identity references, never directory recency/order guesses.

## RELAY.1A regression contracts for future compact transport
- Never execute before verified authorized loading.
- Never treat a path or mutable locator alone as authority.
- Never regenerate an equivalent prompt in place of exact stored bytes.
- Never silently replace a current AUTHORIZED prompt.
- Never bypass verified revocation or supersession lifecycle.
- Preserve Human approval authority; integrity hashes are not permission.
- Do not reconstruct or bulk-migrate historical prompts.
- At RELAY.1B documentation closure, compact descriptor relay became the normal Architect -> Executor process. The later governance simplification superseded that default with full substantial task documents in Google Drive and short chat launchers, without invalidating RELAY.1A/1B implementation or acceptance. Executor -> Architect evidence return remains manual.

## Accepted RELAY.1B compact Executor relay validation
RELAY.1B was accepted and published at `85310e450705e1671ef9e6af22eeae6d9dbcc519`. Its compact Architect -> Executor procedure was activated by its documentation closure, then superseded as the default governance transport by the later governance simplification. Its technical acceptance remains valid.

Accepted evidence:
- `npm run check` passed;
- `npm test` passed 148/148;
- `git diff --check` passed;
- fixed synthetic descriptor vector was verified for canonical JSON, 245-byte UTF-8 payload, base64url and full token;
- strict parser rejects noncanonical encodings, malformed fields/UTF-8/JSON, invalid identity and invalid byte length;
- import preserves exact LF, CRLF, Unicode and BOM bytes and rejects UTF-8/NUL/empty or descriptor-file mismatch before staging;
- separate Node processes imported and resolved exact prompt bytes; resolve stdout was the exact prompt Buffer with no newline;
- failed resolve and import mismatch emitted zero prompt stdout; mismatch caused no store authorization mutation;
- revoked and stale descriptors were rejected; cross-milestone supersede and stale revoke were rejected.

## RELAY.1B regression contracts
- Never act on a descriptor without verified resolve against authorized RELAY.1A lifecycle state.
- Never emit prompt bytes before all validation succeeds; failures emit zero prompt stdout.
- Never derive Architect authorship from hashing an arbitrary local file.
- Never normalize exact prompt bytes.
- Never bypass Human approval or RELAY.1A authorization/lifecycle.
- Never auto-supersede, auto-revoke, dispatch, or execute.

## Accepted V0.1J/V0.1K privacy-limited evidence production and live fusion
Combined implementation published at `9e6998488b02e5493f4a4b34e6c0b60b8d193465`.

Accepted deterministic evidence:
- `npm run check` passed;
- `npm test` passed 178/178;
- `git diff --check` passed;
- tests cover privacy-limited Network extraction, raw child Runtime marker normalization, iframe-only target filtering, multi-child-session observation, listener/session cleanup, and use of the existing single recognizer.

Accepted live evidence used the already-running Brave endpoint only:
- the deployed fixture source matched the pushed fixture source;
- the explicit start gate remained closed after 31 seconds, with no relevant RPC request or completed callbacks/markers;
- early Playwright, late Playwright, raw child/OOPIF CDP and production CLI were all ready before the separate harness opened the gate;
- early Playwright observed two markers, late Playwright observed zero, raw child/OOPIF observed two, and the production CLI emitted exactly two `CORRELATION_PROVEN` events: one success and one failure;
- ordinary native traffic remained quiet, with no correlation rejection noise or ordinary-call response-body fetch;
- tokens, native requestIds, observerScopeId and serverExecutionIds remained separate; exact token/request identity joined evidence despite differing marker/proof order;
- 47 JSONL events parsed, with unique event IDs, contiguous increasing sequence, one runId and correct session boundaries;
- browser target identities were unchanged and the Brave endpoint remained responsive;
- the disposable web app was undeployed, the project deletion was verified, and the old endpoint returned 404.

Do not include deployment URLs or deployment IDs in retained validation evidence.

## V0.1J/V0.1K regression contracts
- Network request/response/terminal evidence and raw child/OOPIF completion markers feed the same V0.1I recognizer.
- Playwright Page console events are not production completion-marker proof.
- Late observer absence is not evidence of no marker; decisive fixture calls require explicit gating after all intended controls are ready.
- Child target/session identity routes observation only and never becomes correlation identity.
- Preserve requestId and observerScopeId separately from correlationId; do not correlate by timing, order or frame proximity.
- V1 evidence collection remains opt-in through `--observe-v1-ms`; no default automatic collection is enabled.

## TEST.1A dual-backend parity qualification

Accepted live qualification ran against the already-running Brave CDP endpoint on port 9444, using a disposable local-only fixture. Browser targets outside the newly created test tab remained unchanged. The fixture provided a real distinct `iframe` target controlled through a child CDP session and execution context; no backend fell back to the outer page.

The same canonical 31-step scenario ran first via `GAS_OOPIF`, then via `PLAYWRIGHT` after deterministic fixture reset. All 31 step outcomes matched; expected fixture values/state matched. Four assertions passed on each backend and one intentional assertion failed on each, with `ASSERTION_FAILED` timeline evidence. The 19 common declared operations are `PASS` in the capability matrix; double-click, right-click, drag/drop and file input remain `GAP`; screenshot is Playwright `BACKEND_SPECIFIC` and GAS_OOPIF `GAP`.

The privacy-reviewed JSONL timeline contained 136 independently parseable events in one run: 1 session start, 62 action starts, 62 action completions, 8 passing assertions, 2 expected assertion failures and 1 session end. It retained no fixture URL, selector, synthetic input value or approval reference. Browser endpoint remained responsive after the disposable tab was closed. Local fixture ports no longer listened and the fixture directory was removed.

Post-live validation passed: `npm run check`; `npm test` 184/184; `git diff --check`. A live-discovered structural state assertion issue was fixed by using deep structural equality rather than object identity; the focused regression test passes.

TEST.1A regression contracts:
- Do not mark common operations `PASS` until both backends produce equivalent normalized results and expected fixture effects on the same scenario.
- Keep backend-specific and unsupported capability states explicit.
- Bind mutating actions to explicit target- and backend-specific TEST authorization and bounded action timeouts.
- Compare read-state structurally; object identity is not a cross-backend state contract.
- Keep live fixture targets disposable and verify target stability and cleanup.

## Accepted TEST.1B controlled smoke scenario runner
TEST.1B implementation was published at `9f54b116f20fa56246546602b26d47eb519ac77a` (parent `37fba3c5dcc1f904c7333d72ea989b85853b3374`). It adds a strict declarative scenario parser and CLI, a runner-owned page/session, exact action-scope selection, equal peer PLAYWRIGHT and GAS_OOPIF backends for capability-matrix-qualified operations, ordered Timeline reporting, stop-on-first-failure and cleanup.

Accepted deterministic validation:
- `npm run check` passed;
- `npm test` passed 214/214;
- `git diff --check` passed.

Accepted live validation used the already-running Brave endpoint `http://127.0.0.1:9444`; no browser was launched, restarted or terminated. PLAYWRIGHT PASS and GAS_OOPIF PASS each exited 0 after 8 ordered steps. PLAYWRIGHT and GAS_OOPIF deterministic assertion failures each exited 2 and did not execute the later click. The pre-existing Brave target was unchanged, runner-owned pages were closed, the local fixture server was stopped, ports 4558 and 4564 were closed, and the temporary fixture directory was removed. Timeline privacy checks passed. No AFFOTECH/business target or external GAS deployment was touched.

Repair 1 added the following regression contracts:
- Validate explicit TEST intent and approval reference before runner-owned page creation or navigation; invalid/missing preconditions cause zero page creation/navigation.
- Preserve target/backend-bound authorization after exact selection.
- Bind PAGE scope to the runner-owned `PAGE-*` identity and FRAME scope to the exact selected Playwright Frame identity.
- Preserve one deterministically matched normalized frame identity; otherwise use a stable debugger-local `PLAYWRIGHT-FRAME-*` identity, never claiming it is a protocol FrameId.
- Keep GAS_OOPIF authorization bound to exact dependency-native target/session/execution-context evidence.
- Operate only on runner-owned pages; fail closed for missing or ambiguous exact targets.
- Stop on first failure; do not claim parity outside the capability matrix and accepted live matrix.
- Keep selectors, raw input/expected values, approval references, credentials, cookies, authorization headers and private DOM dumps out of Timeline evidence.
