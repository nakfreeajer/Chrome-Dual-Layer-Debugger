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

## V0.1B — GAS Dual-Layer Coexistence / Integration Proof — ACCEPTED
- `gas-remote-debug` inspected and pinned at `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`.
- Proven safe coexistence of the accepted Playwright path and `gas-remote-debug` against the same running browser.
- `GasAdapter` activates only when the exact GAS URL prefix selects `BROWSER_PLUS_GAS`.
- Browser-root recursive target/session/context discovery remains owned by `gas-remote-debug`.
- Dependency-native TargetId/SessionId/FrameId/ExecutionContextId evidence is preserved.
- Cross-layer mapping is promoted only when exact shared protocol FrameId evidence exists and target/session evidence is consistent.
- Unsupported sibling GAS contexts and Playwright Page-to-TargetId relationships remain explicitly unmapped.
- V0.1A low-intrusion and stable-identity guarantees were preserved.

Accepted implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.

## V0.1C — Read-Only Unified Timeline — NEXT
- Normalize accepted browser and GAS observations into the shared `TraceEvent` model.
- Assign deterministic debugger event IDs and sequence ordering.
- Retain wall-clock timestamps plus native/source monotonic timestamps where available.
- Record source/category/type and relevant browser/page/frame/target/session/execution-context identifiers without synthesizing unsupported identities.
- Write appendable JSONL, one normalized event per line.
- Preserve explicitly unknown/unmapped relationships rather than correlating by timing or URL alone.
- Prove browser-only and GAS-mode events can coexist in one chronology without regression of the V0.1A/V0.1B read-only safety contract.

## Later, not yet authorized for implementation
- Deterministic cross-boundary trace propagation through `google.script.run`.
- GAS server-side tracing adapter details beyond the proven `gas-remote-debug` composition boundary.
- Multi-GAS-tab orchestration beyond the single active GAS discovery proof.
- UI/visual timeline.
- Breakpoints or powerful mutation/control features.
- Additional backend adapters.
