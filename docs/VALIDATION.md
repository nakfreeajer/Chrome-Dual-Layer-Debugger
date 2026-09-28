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

Local-only filesystem facts cannot be reconstructed from GitHub, so Architect review of such facts relies on bounded Human-relayed Executor evidence unless additional local evidence is supplied.

## Accepted V0.1A browser attachment/read-only discovery validation
V0.1A is accepted against baseline `736742a08cf357fe19acac7e4425f6de54090643`, with final implementation at `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

Accepted deterministic validation:
- `npm run check` passed;
- `npm test` passed 8 tests, 0 failed;
- `git diff --check` passed;
- tests cover URL classification, deceptive non-GAS URLs, stable context/page/frame IDs, and low-intrusion endpoint options.

Accepted live validation against `http://127.0.0.1:9222`:
- connection options were exactly `{ noDefaults: true, isLocal: true }`;
- two discovery passes returned stable context/page/frame IDs for the same live identities;
- target IDs before and after disconnect were unchanged;
- endpoint remained responsive;
- no navigation, reload, click, typing, storage/DOM mutation, page close or browser-process close occurred.

## Accepted V0.1B GAS dual-layer coexistence validation
V0.1B is accepted against baseline `4d19e3b1f3ad776ac64deedbccbd66f6e440d60a`, with implementation at `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

Dependency baseline:
- repository: `nakfreeajer/gas-remote-debug`;
- accepted inspected dependency HEAD: `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`;
- version: `0.1.0`;
- dependency test result: 94 passed, 0 failed;
- npm registry lookup returned 404, so the dependency is commit-pinned from GitHub rather than npm-published.

Accepted deterministic primary validation:
- `npm run check` passed;
- `npm test` passed 13 tests, 0 failed, 0 cancelled, 0 skipped, 0 todo;
- `git diff --check` passed for the complete V0.1B range;
- tests cover GAS activation gating, dependency-native ID preservation, disconnect-only behavior, exact FrameId mapping and unsupported relationships remaining unmapped.

Accepted live coexistence validation against `http://127.0.0.1:9222`:
- the already-open page classified `BROWSER_PLUS_GAS` solely through the exact URL-prefix rule;
- Playwright retained the V0.1A low-intrusion options;
- `GasAdapter` connected to the same endpoint and delegated browser-root recursive discovery to `gas-remote-debug`;
- dependency reported 2 targets, 2 attached sessions and 3 execution contexts;
- a second Playwright discovery succeeded while `GasAdapter` remained connected;
- exact shared root protocol FrameId evidence mapped the Playwright root frame to dependency context 25;
- sibling sandbox contexts 3 and 1 had no matching Playwright frame and remained unmapped;
- Playwright Page-to-raw-TargetId remained unmapped because the public Playwright discovery surface does not expose TargetId;
- dependency frame registry contained no entries in this live run, so accepted root frame evidence came from dependency execution-context `frameId` metadata;
- target identities before and after disconnect were unchanged;
- endpoint remained responsive after cleanup;
- navigation, reload, click, typing, DOM mutation, storage mutation, page close and browser-process close were all `NO`;
- the only runtime evaluation was the dependency-generated read-only generic GAS context probe.

## Browser attachment validation for future regressions
A later milestone that materially changes browser attachment/discovery should preserve, as applicable:
- attachment through the configured debugging endpoint;
- existing page/tab enumeration;
- current URLs and frame hierarchy;
- stable debugger-local identities across repeated discovery in one connection;
- low-intrusion connection options;
- disconnect leaves existing browser/page targets usable;
- exact GAS prefix detection remains authoritative.

## GAS integration validation for future regressions
- `GasAdapter` activates only after the exact prefix rule selects `BROWSER_PLUS_GAS`;
- `gas-remote-debug` remains owner of recursive GAS/OOPIF target/context discovery;
- dependency-native identifiers are preserved;
- only deterministic identity evidence is promoted to a cross-layer mapping;
- unsupported relationships remain explicitly unmapped;
- coexistence with Playwright must not introduce destructive browser side effects.

## Timeline validation
V0.1C should prove:
- events receive deterministic debugger event identity and ordering metadata;
- wall-clock timestamps and native source timestamps are retained when available;
- browser and GAS events can coexist in one normalized chronology;
- unknown correlation remains unknown rather than guessed;
- appendable JSONL output is parseable one event per line;
- timeline generation does not change the V0.1A/V0.1B read-only browser contract.

## Test evidence
Executor reports should state exact commands, pass/fail totals, skipped/cancelled tests when relevant, and any live/runtime validation performed.

## Safety boundary
Do not treat successful tests as authorization for commit, push, tag, deployment, browser mutation, or unrelated scope expansion.
