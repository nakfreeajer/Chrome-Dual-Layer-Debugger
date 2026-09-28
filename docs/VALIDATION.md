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

## v0.1 browser attachment validation
A milestone involving an already-running Chrome/Chromium instance should prove, as applicable:
- attachment succeeds through the configured debugging endpoint;
- existing pages/tabs can be enumerated;
- current URLs and frame hierarchy can be observed;
- Playwright Page/Frame and relevant CDP identities are captured where available;
- browser observation does not navigate, close pages, or close the browser unless explicitly authorized;
- disconnect leaves the existing browser usable;
- layer detection returns `BROWSER_PLUS_GAS` only for URLs beginning with `https://script.google.com/macros/`;
- ordinary pages remain `BROWSER_ONLY`.

## GAS integration validation
When GAS mode is exercised:
- `GasAdapter` activates only after the prefix rule selects `BROWSER_PLUS_GAS`;
- `gas-remote-debug` remains the owner of recursive GAS/OOPIF target/context discovery;
- the project records enough identity evidence to correlate the selected Playwright page with GAS target/session/context evidence without inventing relationships;
- coexistence with Playwright-backed CDP observation does not create destructive browser side effects.

## Timeline validation
- Events receive deterministic event identity and ordering metadata.
- Native source timestamps are retained when available.
- Unknown correlation remains unknown rather than guessed.
- JSONL output is appendable and parseable line by line.

## Test evidence
Executor reports should state exact commands, pass/fail totals, skipped/cancelled tests when relevant, and any live/runtime validation performed.

## Safety boundary
Do not treat successful tests as authorization for commit, push, tag, deployment, browser mutation, or unrelated scope expansion.
