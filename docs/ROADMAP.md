# Roadmap

Only accepted near-term sequencing belongs here. Exploratory ideas remain in `IDEA_INBOX.md`.

## Foundation — COMPLETE
- Establish AMO-inspired manual-relay governance and filesystem.
- Keep project architecture/docs authoritative in GitHub.
- Keep raw working evidence under ignored `.agent-work/`.

## V0.1A — Browser Attachment & Read-Only Discovery — ACCEPTED
- Attach to an already-running Chromium-family browser through configurable Playwright `connectOverCDP()`.
- Enumerate contexts/pages/tabs/URLs/frames.
- Establish Playwright-backed public `CDPSession` observation for normal pages.
- Apply deterministic URL-based layer detection.
- Preserve stable debugger-local Context/Page/Frame IDs across repeated discovery in one connection.
- Use low-intrusion connection defaults and disconnect without destroying the existing browser process or targets.

Accepted implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`.

## V0.1B — GAS Dual-Layer Coexistence / Integration Proof — NEXT
- Inspect the current public API and composition boundary of `nakfreeajer/gas-remote-debug`.
- On a GAS page, prove the accepted Playwright V0.1A attachment/observation path and `gas-remote-debug` browser-root discovery can coexist safely against the same browser.
- Activate `GasAdapter` only when the current URL starts with `https://script.google.com/macros/`.
- Record GAS target/session/frame/execution-context evidence from `gas-remote-debug` without duplicating its recursive discovery engine.
- Record only proven mappings or disagreements between Playwright Page/Frame identities and raw CDP target/session/context identities.
- Preserve V0.1A low-intrusion and stable-identity guarantees.
- No navigation, reload, click, typing, DOM/storage mutation, page close, or browser-process close.

## V0.1C — Read-Only Unified Timeline
After V0.1B establishes the dual-layer identity boundary:
- normalize browser and GAS observations into the shared `TraceEvent` model;
- retain native source timestamps where available;
- assign deterministic event ordering/identity;
- write appendable JSONL timeline evidence;
- leave cross-layer events uncorrelated unless deterministic evidence links them.

## Later, not yet authorized for implementation
- Deterministic cross-boundary trace propagation through `google.script.run`.
- GAS server-side tracing adapter details beyond the proven `gas-remote-debug` composition boundary.
- UI/visual timeline.
- Breakpoints or powerful mutation/control features.
- Additional backend adapters.
