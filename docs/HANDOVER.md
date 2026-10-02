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
- Accepted V0.1I implementation HEAD: `348dfa6b9c81dbf55233bc87ce05f417973fb61d`.
- Accepted RELAY.1A implementation HEAD: `163b0c008097eb24f1412be31e527f4697d0fc35`.
- Accepted RELAY.1B implementation HEAD: `85310e450705e1671ef9e6af22eeae6d9dbcc519`.
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

## Accepted correlation chain - V0.1E through V0.1I
V0.1E found native browser/CDP identity insufficient for deterministic frontend-to-GAS-to-callback correlation. V0.1F proved exact opaque-token propagation in a disposable fixture when paired with the native CDP requestId. V0.1G showed universal transparent runner wrapping can change native `ScriptError` failure semantics. V0.1H therefore qualified explicit cooperative, versioned application participation. V0.1I implemented and published a passive, run-scoped V1 recognizer at `348dfa6b9c81dbf55233bc87ce05f417973fb61d` (52/52 tests).

The recognizer fails closed and assigns `correlationId` only after exact requestId/token/response/transport/completion-marker evidence agrees. Request version 1 and completion-marker version 1 are authoritative; token prefixes do not establish version, and response token equality is required. Ordinary native calls remain untouched and uncorrelated. Explicit application failures are not native `ScriptError` equivalence.

Automatic CLI/page/network evidence ingestion is not implemented. Recognizer inputs must be privacy-reduced, and CDP request IDs require an additional observer/session scope before multi-session integration.

Do not repeat these conclusions or approaches:
- Do not rediscover whether explicit token propagation works.
- Do not attempt universal transparent `google.script.run` wrapping.
- Do not infer correlation from timing, ordering, function names or URL similarity.
- Do not treat a token prefix as contract-version evidence.
- Do not assign `correlationId` before complete proof.

## Architecture baseline
- Project is independent from AFFOTECH and other projects.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS activation remains only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline, run identity and correlation ownership belong to Chrome-Dual-Layer-Debugger.
- Unknown relationships must remain unknown until deterministically proven.

## RELAY.1A durable prompt artifact foundation
RELAY.1A stores exact prompt bytes under ignored `.agent-work/prompts/<milestoneId>/<promptSha256>.md`, with immutable manifests/lifecycle evidence and a mutable current locator. Schema v1 identity is `(project, milestoneId, promptSha256, promptByteLength)`; no transactionId exists, and debugger runId is not workflow identity. Hash and byte length cover exact Buffer bytes without normalization.

Staging is not authorization. Explicit approval references are required. Active authorization cannot be displaced through direct authorization; supersession is explicit, and revocation/supersession/corrupt state are verified fail-closed from durable evidence. The locator is a recovery pointer, not authority. No automatic dispatch or prompt execution is active; compact descriptor transport is the normal manual handoff after this closure.

The compact Architect -> Executor flow is now the normal operating procedure: Architect creates the exact prompt file and canonical descriptor; Rony imports/authorizes the exact bytes; Rony sends Executor only the descriptor; Executor resolves and follows only the exact verified bytes. For future tasks, provide the exact prompt file, descriptor, short Human import instruction, and short `RELAY:EXECUTE` handoff token; do not place the complete prompt body in the Executor handoff message. Full-prompt chat transport is an explicit fallback only. Executor -> Architect report/evidence relay remains manual. Transport changed; the Human -> Architect-Curator -> bounded Executor authority model did not. No automated dispatch or prompt execution exists.

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

## Next boundaries (not authorization)
No new implementation is authorized by this documentation closure. The previously identified non-relay debugger integration remains a privacy-limited V1 evidence producer with CDP observer/session scoping and Timeline lifecycle integration; automatic CLI/network ingestion does not exist. RELAY.1B is accepted and its compact transport procedure is now active after this closure. It does not authorize automatic dispatch or execution.

Do not jump directly to GUI work, breakpoints, destructive browser controls, broad automation, or unbounded server instrumentation.
