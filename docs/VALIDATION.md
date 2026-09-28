# Validation

## General rule
Important conclusions must come from recorded evidence rather than assumption. Validation should be proportional to milestone risk.

## Accepted local-workspace bootstrap validation
The 2026-09-28 bootstrap is accepted based on the Human-relayed Executor terminal report plus independent GitHub verification of the reported remote baseline.

Accepted bootstrap evidence:
- local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`;
- repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`;
- branch: `main`;
- Executor-reported local HEAD: `d157bd48ded35c1714d64635539569ca799da72d`;
- independent GitHub verification confirmed that exact commit in the authoritative repository;
- target directory was empty before clone, so clone/init was appropriate;
- tracked project structure was reported complete;
- `.agent-work/` was created with `tools/setup-agent-work.ps1`;
- `git check-ignore` confirmed `.agent-work/` is ignored;
- Executor reported clean `main...origin/main` status after setup;
- no tracked files were changed and no debugger implementation occurred.

Local-only filesystem facts cannot be reconstructed from GitHub, so future Architect review of such facts relies on the bounded Human-relayed Executor evidence unless additional local evidence is supplied. That limitation must be stated rather than silently treated as remote verification.

## Accepted V0.1A browser attachment/read-only discovery validation
V0.1A is accepted against baseline `736742a08cf357fe19acac7e4425f6de54090643`, with final implementation at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

Accepted deterministic validation:
- `npm run check` passed;
- `npm test` passed 8 tests, 0 failed, 0 cancelled, 0 skipped, 0 todo;
- `git diff --check` passed for the complete baseline-to-final range;
- tests cover deterministic URL classification, deceptive non-GAS URLs, stable context/page IDs, stable frame IDs, and low-intrusion endpoint options.

Accepted live validation against `http://127.0.0.1:9222`:
- connection options were exactly `{ noDefaults: true, isLocal: true }`;
- two `discover()` passes on the same `PlaywrightBrowserDiscovery` object returned the same `CONTEXT-0001`, `PAGE-0001`, and `FRAME-0001` for the same live identities;
- the page was classified `BROWSER_PLUS_GAS` solely because its URL started with `https://script.google.com/macros/`;
- browser target IDs before and after disconnect were unchanged;
- the endpoint remained responsive after disconnect;
- no navigation, click, typing, reload, storage mutation, DOM mutation, page close, or browser-process close occurred;
- `GasAdapter` was not activated.

The V0.1A low-intrusion contract therefore includes:
- use public Playwright APIs only;
- connect with `noDefaults: true`;
- use `isLocal: true` only for loopback endpoint hosts (`localhost`, `127.0.0.1`, `::1`);
- retain debugger-local context/page/frame IDs for the lifetime of one connected discovery session;
- disconnect without destroying the existing browser process or page targets.

## Browser attachment validation for future regressions
A later milestone that materially changes browser attachment/discovery should preserve, as applicable:
- attachment through the configured debugging endpoint;
- existing page/tab enumeration;
- current URLs and frame hierarchy;
- stable debugger-local identities across repeated discovery in one connection;
- low-intrusion connection options;
- disconnect leaves existing browser/page targets usable;
- layer detection returns `BROWSER_PLUS_GAS` only for URLs beginning with `https://script.google.com/macros/`;
- ordinary pages remain `BROWSER_ONLY`.

## GAS integration validation
When GAS mode is exercised:
- `GasAdapter` activates only after the prefix rule selects `BROWSER_PLUS_GAS`;
- `gas-remote-debug` remains the owner of recursive GAS/OOPIF target/context discovery;
- the project records enough identity evidence to correlate the selected Playwright page with GAS target/session/context evidence without inventing relationships;
- coexistence with Playwright-backed CDP observation does not create destructive browser side effects;
- accepted V0.1A browser attachment behavior must not regress.

## Timeline validation
- Events receive deterministic event identity and ordering metadata.
- Native source timestamps are retained when available.
- Unknown correlation remains unknown rather than guessed.
- JSONL output is appendable and parseable line by line.

## Test evidence
Executor reports should state exact commands, pass/fail totals, skipped/cancelled tests when relevant, and any live/runtime validation performed.

## Safety boundary
Do not treat successful tests as authorization for commit, push, tag, deployment, browser mutation, or unrelated scope expansion.
