# External review action register — 2026-10-24

**Status:** TRACKED; recommendations are not implementation authorization.  
**Review basis:** Grok review shared 2026-10-24; Claude review shared as `Review Chrome Dual Layer Debugger.md` and follow-up Architect assessment.  
**Published discovery baseline:** [cc0c8108](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/commit/cc0c8108a06a1031ccb5cd17ee6f603478ac2135).  
**External archival record:** [Review/action register (Google Docs)](https://docs.google.com/document/d/1pg04M1iw5HVxN-5URmWGeOzD-MASAzyjxutLTE-jG5gg/edit) (external reference; GitHub issues and this file are the actionable records).

## Purpose

Ensure outside engineering feedback becomes durable project backlog and cannot disappear when a chat or agent handover ends. CDLD's purpose is to extend Playwright with the existing pinned `gas-remote-debug` layer for exact-evidence GAS/OOPIF debugging. Do not replace Playwright, rebuild its ordinary operations, or create a new orchestration/authorization platform.

## Action register

| ID | Priority | Issue | Evidence and outcome needed | State |
| --- | --- | --- | --- | --- |
| CDLD-ER-001 | P0 | [#1 — TEST authorization enforcement](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/1) | Audit every mutating path; distinguish free-form approval-reference validation from target/fixture ownership enforcement. Minimal fail-closed repair only if verified. | OPEN — SOURCE AUDIT |
| CDLD-ER-002 | P0 | [#2 — Remote CDP endpoint restrictions](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/2) | Trace endpoints through smoke/monkey/suite and backend dispatch. CLI parser accepts HTTP(S); actual downstream scope needs verification. | OPEN — SOURCE AUDIT |
| CDLD-ER-003 | P1 | [#3 — Independent consumer live qualification](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/3) | Real compiled consumer + task-owned disposable Chrome, pre/post targets, cleanup; GAS/OOPIF separate. | BLOCKED — SAFE FIXTURE/LIVE AUTHORIZATION |
| CDLD-ER-004 | P1 | [#4 — Consumer quick start](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/4) | Five-minute mental model, minimal consumer path, sample privacy-reduced trace. | BACKLOG |
| CDLD-ER-005 | P1 | [#5 — Offline CI](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/5) | Verify current CI state; safely separate offline and live suites; no accidental browser test execution. | BACKLOG |
| CDLD-ER-006 | P1 | [#6 — Dependency upgrade protocol](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/6) | Version-pin change rules and regression obligations incl identity/redaction/cleanup. | BACKLOG |
| CDLD-ER-007 | P2 | [#7 — Licensing and API](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/7) | Human licensing choice; minimal public facade only after qualification. | DEFERRED |
| CDLD-ER-008 | P2 | [#8 — Capability gaps](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/8) | Use-case driven priority for doubleClick/rightClick/dragDrop/fileInput/screenshot; matrix remains truthful. | DEFERRED |
| CDLD-ER-009 | P2 | [#9 — Process/product separation](https://github.com/nakfreeajer/Chrome-Dual-Layer-Debugger/issues/9) | Consumer docs separated from internal workflow; no premature repo split or broad refactor. | DEFERRED |

## Findings and evidence distinctions

- **Architect source spot-check:** `src/cli/main.ts` accepts an HTTP(S) endpoint for monkey arguments at the parser boundary. This alone does **not** prove downstream mutating operations accept remote endpoints; inspect all guards.
- **Architect source spot-check:** `ActionContract.ts` and CLI enforce approval-reference shape/nonemptiness. Whether additional downstream fixture/target proof is sufficient requires complete trace.
- **Claude report, not independently reproduced here:** `npm run check` passes, full suite 371/371 passes, and repository may lack LICENSE/CI. Independently verify before relying on these as current facts.
- **Grok review:** praises exact cross-layer identity, fail-closed V1 correlation and capability matrix; recommends clearer consumer onboarding, stable facade and workflow/product separation.
- **Previously reported Executor evidence:** bounded offline discovery-contract repair 26/26 focused tests passed; published five-file contract. This does not establish live GAS/OOPIF, ownership or cleanup qualification.

## Tracking and closure rule

A finding follows **OPEN → IN_PROGRESS → VERIFIED → CLOSED**; use **BLOCKED** or **DEFERRED** when appropriate, with a recorded reason. Closing requires: (1) issue-linked evidence, (2) applicable commit or explicit no-code disposition, (3) tests or source review matched to the actual claim, and (4) Architect review and Human authorization where required. An external review, a document, or generic test pass alone is not closure.

Every new Architect/Executor handover must read this register and check Issues #1 and #2 before choosing a successor milestone. Issues track findings; **they do not grant implementation, test, live browser, cloud, commit, or governance authority**.

## Preserved stop and acceptance boundary

**F36 INCONCLUSIVE/EXHAUSTED; HISTORICAL_STOP_TRIGGERED; counters and five-milestone checkpoint UNKNOWN; CORE-04 live Outcome A/B not accepted; CORE-06/CORE-07 not accepted; Release 1 not accepted.** Do not reset or reinterpret them because these tracking records exist.

## Proposed first authorized audit (not yet launched)

`CDLD.TEST.AUTHORIZATION.ENDPOINT.BOUNDARY.AUDIT.1A`: bounded read-only tracing of smoke/monkey/suite TEST gates, target ownership, endpoint scope and all mutation paths. Return source-backed findings and minimal remedies. Requires explicit Human authorization before execution.
