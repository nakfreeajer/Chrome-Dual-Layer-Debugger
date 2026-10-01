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
- The recognizer does not currently have automatic CLI/page/network evidence ingestion.
