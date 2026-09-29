# Project History

Only Architect-Curator accepted milestones belong here.

## 2026-09-28 — Project foundation
- Repository `nakfreeajer/Chrome-Dual-Layer-Debugger` initialized on `main`.
- Initial TypeScript scaffold created for core, browser, GAS, trace, CLI and tests.
- `nakfreeajer/gas-remote-debug` inspected as the existing GAS/OOPIF raw-CDP capability.
- Architecture direction established: compose `gas-remote-debug`; do not duplicate its recursive GAS discovery engine.
- Playwright source review refined normal-browser design toward Playwright-backed public `CDPSession` observation.
- GAS mode detection simplified to a deterministic `https://script.google.com/macros/` prefix check.
- AMO-inspired governance/filesystem adopted with manual Human relay and no automated Orchestrator.

## 2026-09-28 — Local workspace bootstrap — ACCEPTED
- Local root established at `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`.
- Executor cloned `nakfreeajer/Chrome-Dual-Layer-Debugger`, checked out `main`, created ignored `.agent-work/` evidence directories, and left tracked files unchanged.
- Architect-Curator independently confirmed the reported remote baseline and accepted the bounded bootstrap result.

## 2026-09-28 — V0.1A Browser Attachment & Read-Only Discovery — ACCEPTED
- Baseline: `736742a08cf357fe19acac7e4425f6de54090643`.
- Initial implementation: `aa886de935678e48f1f8a424728c6711dd701586` (`Implement read-only browser discovery`).
- Correction: `f1cf95158eba7342d627a5526f04766b24c1d5d2` (`Correct low-intrusion discovery identities`).
- Implemented configurable Playwright `chromium.connectOverCDP()` attachment, low-intrusion options, existing context/page/frame discovery, deterministic GAS URL-prefix classification, public `CDPSession` observation and stable debugger-local IDs.
- Accepted validation: typecheck; 8/8 tests; clean diff check; stable-ID live validation; unchanged target identities before/after disconnect; responsive endpoint; no application/browser mutation.
- Accepted implementation was published through `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

## 2026-09-28 — V0.1B GAS Dual-Layer Coexistence / Integration Proof — ACCEPTED
- Baseline: `4d19e3b1f3ad776ac64deedbccbd66f6e440d60a`.
- Implementation: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e` (`Prove GAS browser discovery coexistence`).
- Inspected `nakfreeajer/gas-remote-debug` at `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`; dependency tests passed 94/94.
- Adopted a commit-pinned Git dependency because no npm-published package was available.
- Implemented exact-prefix `GasAdapter` activation, delegated browser-root recursive discovery to `gas-remote-debug`, and added evidence-backed `CrossLayerMapper` behavior.
- Unsupported sibling GAS contexts and Playwright Page-to-raw-TargetId relationships remained explicitly unmapped.
- Accepted validation: primary typecheck; 13/13 primary tests; 94/94 dependency tests; clean diff check; simultaneous two-layer live discovery; unchanged target identities; responsive endpoint; no mutation.
- Accepted implementation was published at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

## 2026-09-28 — V0.1C Read-Only Unified Timeline — ACCEPTED
- Baseline: `4045ccbf0949878d14bda5931ecee139c9e7f759`.
- Implementation: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5` (`Add read-only unified JSONL timeline`).
- Added normalized `TraceEvent` evidence across CORE, PLAYWRIGHT, CDP, GAS and TRACE sources.
- Added deterministic per-run event identity (`EVENT-000001` onward), strictly increasing sequence order, ingestion wall-clock timestamps and preservation of supplied source monotonic timestamps without fabrication.
- Added normalized browser discovery, GAS discovery, proven mapping and explicit unmapped-identity events.
- Added appendable UTF-8 JSONL persistence with one independently parseable JSON object per line.
- Added URL redaction for query values and Apps Script deployment path tokens; page titles are not persisted to the timeline.
- Architect-Curator reviewed the complete baseline-to-final patch, final report and uploaded live JSONL artifact.
- Accepted deterministic validation: `npm run check`; 19/19 tests; clean baseline-to-HEAD `git diff --check`.
- Accepted live validation: 40 valid events; 0 malformed lines; 0 duplicate event IDs; 0 sequence gaps; 2 proven mappings; 3 explicit unmapped identities; unchanged browser targets; responsive endpoint; no browser/application mutation.
- Accepted implementation was published to authoritative GitHub `main` at `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.
- Known limitation retained: event IDs restart at `EVENT-000001` for each fresh debugger run, so cross-run append uniqueness requires a future run/trace namespace if multiple runs share one JSONL file.

The next bounded milestone should be selected from the accepted V0.1C baseline without reopening closed work. Run/trace identity is the smallest known prerequisite if multi-run append safety is needed; deterministic `google.script.run` cross-boundary propagation remains separate future work.
