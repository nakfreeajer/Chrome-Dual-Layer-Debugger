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
- Implemented configurable Playwright `chromium.connectOverCDP()` attachment to an already-running Chromium-family browser.
- Implemented low-intrusion connection options using `noDefaults: true`; `isLocal: true` is restricted to loopback endpoints.
- Implemented existing context/page/frame discovery, current URL/title reporting, deterministic GAS URL-prefix classification, public Playwright `CDPSession` observation, `Page.getFrameTree`, and `Runtime.executionContextCreated` capture.
- Implemented session-local stable IDs for contexts/pages/frames across repeated discovery passes.
- The first Architect review identified two blockers: missing `noDefaults`/bounded `isLocal` options and counter-only IDs that changed across repeated discovery. Executor corrected both in the same milestone.
- Final Architect review inspected the complete baseline-to-final patch and classified the milestone `ACCEPTED`.
- Accepted validation: `npm run check` passed; `npm test` passed 8/8; `git diff --check` passed; two live discovery passes retained the same context/page/frame IDs; target identities before/after disconnect were unchanged; CDP endpoint remained responsive; no page/browser-process closure or application mutation occurred.
- `GasAdapter` remained inactive; V0.1A proved only the browser-side foundation and URL mode classification.
- Accepted implementation was pushed to authoritative GitHub `main` through `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

The next bounded milestone is V0.1B: compose `gas-remote-debug` and prove safe dual-layer GAS coexistence against the accepted V0.1A browser observation path.
