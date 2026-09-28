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
- The target directory existed but was empty, so Executor cloned `nakfreeajer/Chrome-Dual-Layer-Debugger` and checked out `main`.
- Executor reported HEAD `d157bd48ded35c1714d64635539569ca799da72d`, clean `main...origin/main`, correct origin, and all requested tracked structure present.
- Local ignored `.agent-work/` hierarchy was created using `tools/setup-agent-work.ps1`.
- Executor verified `.agent-work/` is ignored and does not create Git status noise.
- No tracked files were changed during the bootstrap and no debugger implementation was performed.
- Architect-Curator independently confirmed the reported remote baseline commit and accepted the bounded bootstrap result.

## 2026-09-28 — V0.1A Browser Attachment & Read-Only Discovery — ACCEPTED
- Baseline: `736742a08cf357fe19acac7e4425f6de54090643`.
- Initial implementation: `aa886de935678e48f1f8a424728c6711dd701586` (`Implement read-only browser discovery`).
- Correction: `f1cf95158eba7342d627a5526f04766b24c1d5d2` (`Correct low-intrusion discovery identities`).
- Implemented configurable Playwright `chromium.connectOverCDP()` attachment, low-intrusion options, existing context/page/frame discovery, deterministic GAS URL-prefix classification, public `CDPSession` observation and stable debugger-local IDs.
- The first Architect review identified missing low-intrusion connection options and unstable counter-only identities; both were corrected in the same milestone.
- Accepted validation: typecheck; 8/8 tests; clean diff check; two-pass stable-ID live validation; unchanged target identities before/after disconnect; responsive endpoint; no application/browser mutation.
- `GasAdapter` remained inactive; V0.1A proved only the browser-side foundation and URL mode classification.
- Accepted implementation was published through `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

## 2026-09-28 — V0.1B GAS Dual-Layer Coexistence / Integration Proof — ACCEPTED
- Baseline: `4d19e3b1f3ad776ac64deedbccbd66f6e440d60a`.
- Implementation: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e` (`Prove GAS browser discovery coexistence`).
- Inspected current `nakfreeajer/gas-remote-debug` at `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`; dependency tests passed 94/94.
- Because the dependency was not published to npm, the primary project adopted a commit-pinned Git dependency at that exact SHA.
- Implemented `GasAdapter` activation only after the exact GAS URL-prefix rule selects `BROWSER_PLUS_GAS`.
- Delegated browser-root target discovery, recursive attachment and execution-context discovery to `gas-remote-debug`; no dependency source was copied or modified.
- Implemented `CrossLayerMapper` that accepts only exact shared protocol FrameId evidence and consistent target/session context evidence; unsupported relationships remain explicitly unmapped.
- Live coexistence proved Playwright and `gas-remote-debug` can remain simultaneously usable against the same already-running browser.
- Live dependency evidence contained 2 targets, 2 sessions and 3 execution contexts; the root FrameId mapped to dependency context 25.
- Sibling sandbox execution contexts 3 and 1 remained unmapped to Playwright frames; Playwright Page-to-raw-TargetId also remained unmapped because the public discovery result exposes no TargetId.
- Accepted validation: primary typecheck; 13/13 primary tests; 94/94 dependency tests; clean diff check; second Playwright discovery while GAS remained connected; unchanged target identities before/after cleanup; responsive endpoint; no navigation/reload/click/type/DOM/storage/page/browser-process mutation.
- Architect-Curator independently inspected the complete review packet and accepted the milestone.
- Accepted implementation was published to authoritative GitHub `main` at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

The next bounded milestone is V0.1C: normalize the accepted browser/GAS observations into a read-only unified timeline and appendable JSONL evidence without inventing new cross-layer correlations.
