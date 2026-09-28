# Roadmap

Only accepted near-term sequencing belongs here. Exploratory ideas remain in `IDEA_INBOX.md`.

## Foundation
- Establish AMO-inspired manual-relay governance and filesystem.
- Keep project architecture/docs authoritative in GitHub.
- Keep raw working evidence under ignored `.agent-work/`.

## v0.1 — Browser Discovery and Read-Only Timeline
- Attach to an already-running Chromium browser.
- Enumerate contexts/pages/tabs/URLs/frames.
- Establish Playwright-backed CDP observation for normal pages.
- Apply deterministic URL-based layer detection.
- Record normalized read-only timeline events to JSONL.

## v0.1A — Dual Connection / GAS Coexistence Proof
- On a GAS page, prove Playwright attachment and `gas-remote-debug` browser-root discovery coexist safely.
- Record mappings and disagreements between Playwright Page/Frame identities and raw CDP target/session/context identities.
- No navigation, page close, or browser close.

## Later, not yet authorized for implementation
- Deterministic cross-boundary trace propagation through `google.script.run`.
- GAS server-side tracing adapter details.
- UI/visual timeline.
- Breakpoints or powerful mutation/control features.
- Additional backend adapters.
