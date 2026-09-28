# Decisions

Durable accepted decisions only. Exploratory ideas belong in `IDEA_INBOX.md` until explicitly accepted.

## D-001 — Project independence
Chrome-Dual-Layer-Debugger is an independent project and must not depend on AFFOTECH unless the Human Owner explicitly authorizes future integration.

## D-002 — Primary browser interaction layer
Playwright owns ordinary semantic browser interaction, locators, waits, page/frame operations and controlled browser actions.

## D-003 — CDP role
CDP is a low-level observation and verification layer. For ordinary browser pages, prefer Playwright public `CDPSession` access before introducing a second raw CDP connection.

## D-004 — GAS runtime ownership
`gas-remote-debug` remains the owner of GAS-specific browser-root target discovery, recursive OOPIF/session attachment, runtime-context discovery and exact execution-context access. Chrome-Dual-Layer-Debugger composes it through `GasAdapter` rather than copying its recursive engine.

## D-005 — GAS detection
For v0.1, if the current page URL starts with `https://script.google.com/macros/`, classify as `BROWSER_PLUS_GAS`; otherwise classify as `BROWSER_ONLY`. No additional heuristics are authorized absent contrary evidence.

## D-006 — Evidence model
The project owns a normalized chronological event/timeline model. Correlation must not be invented: events remain uncorrelated until there is deterministic evidence linking them.

## D-007 — Workflow transport
This project uses an AMO-inspired Architect-Curator / Executor workflow but does not use an automated Orchestrator. Rony performs relay manually.

## D-008 — Architect-Curator authority
Rony Finster is the final Human authority. ChatGPT serves as the project Architect-Curator: it owns architecture, milestone design, independent verification, acceptance classification, and synchronization of all relevant official project documentation after accepted work. The Codex Executor remains bounded implementation authority only and never accepts its own work.
