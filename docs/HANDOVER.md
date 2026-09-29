# Handover

## Role
Architect-Curator for Chrome-Dual-Layer-Debugger.

## Authority
Human Owner -> Architect-Curator -> bounded Executor -> evidence back to Architect-Curator.

Rony Finster is final Human authority. ChatGPT is the Architect-Curator for this project. There is **no automated Orchestrator**. Rony manually relays bounded prompts, Executor reports, correction instructions, and documentation-closure requests.

## Read first
1. `AGENTS.md`
2. `docs/PROJECT_BRIEF.md`
3. `docs/CURRENT_STATE.md`
4. `docs/DECISIONS.md`
5. `docs/ARCHITECTURE.md`
6. `docs/ROADMAP.md`
7. `docs/AGENT_WORKFLOW.md`
8. `docs/VALIDATION.md`

## Current accepted baseline
- Repository: `nakfreeajer/Chrome-Dual-Layer-Debugger`
- Branch: `main`
- Local root: `C:\Users\nitro\Projects\Chrome-Dual-Remote-Debugger`
- Accepted V0.1A implementation HEAD: `f1cf95158eba7342d627a5526f04766b24c1d5d2`.
- Accepted V0.1B implementation HEAD: `83ba33d5bb67fc362a1d3e7e5226e5627de2f22e`.
- Accepted V0.1C implementation HEAD: `21b5f9c30460c38e11c16f04b44fa8ac3a5210f5`.
- Accepted V0.1D implementation HEAD: `b14fda0db3b4d150064c91eab86dfdda19b6cd1f`.
- `gas-remote-debug` dependency is pinned to `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`.

## Accepted capability
V0.1A established low-intrusion Playwright browser discovery. V0.1B established safe coexistence with `gas-remote-debug` and deterministic evidence-backed mapping. V0.1C normalized those observations into appendable read-only JSONL. V0.1D adds explicit debugger-run identity so multiple runs can coexist in one JSONL file without ambiguous event identity.

Accepted V0.1D behavior:
- one immutable `runId` per `Timeline`;
- default run IDs from Node `crypto.randomUUID()`;
- deterministic constructor injection available for tests;
- required `TraceEvent.runId` on newly emitted V0.1D events;
- per-run event numbering still starts at `EVENT-000001`;
- `(runId,eventId)` is the unambiguous cross-run event key;
- `Timeline.append()` rejects foreign-run events;
- JSONL format and append behavior remain unchanged;
- historical V0.1C JSONL is not rewritten or migrated;
- CLI prints the active Run ID;
- accepted URL redaction and read-only browser behavior remain intact.

Accepted validation included typecheck, 22/22 tests, clean baseline-to-HEAD diff check, and a live two-run append proof containing 83 valid JSONL events across two distinct run IDs. Each run restarted at `EVENT-000001`, duplicate raw event IDs were expected, duplicate `(runId,eventId)` pairs were zero, every run had one session start/end, browser targets were unchanged, and the endpoint remained responsive.

## Architecture baseline
- Project is independent from AFFOTECH and other projects.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS activation remains only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline, run identity and correlation ownership belong to Chrome-Dual-Layer-Debugger.
- Unknown relationships must remain unknown until deterministically proven.

## Workflow note
Local raw evidence belongs under ignored `.agent-work/`. Because relay is manual, the Human Owner transports bounded Executor reports/evidence to the Architect-Curator. Do not require an automated bridge, watcher, doorbell, or orchestrator state.

## What must not be repeated
- Do not recreate the repository or local bootstrap without direct regression evidence.
- Do not rebuild accepted V0.1A browser attachment/discovery absent direct regression evidence.
- Do not duplicate `gas-remote-debug` recursive discovery.
- Do not replace the accepted commit-pinned dependency boundary casually.
- Do not infer Playwright/GAS relationships from timestamps or URL equality alone.
- Do not reopen intentionally unmapped sibling GAS contexts merely because they are unmapped.
- Do not redesign the accepted V0.1C timeline or V0.1D run identity without direct regression evidence.

## Exact next intended action
Select the next bounded milestone from the accepted V0.1D baseline. Deterministic cross-boundary propagation through `google.script.run` is a possible future direction, but it is not yet authorized and must remain separate from already-closed timeline/run-identity work.

Do not jump directly to GUI work, breakpoints, destructive browser controls, broad automation, or unbounded server instrumentation.
