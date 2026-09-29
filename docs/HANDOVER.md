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
- `gas-remote-debug` dependency is pinned to `ac4359aa790af19cafe1a7e9a55ecd50f68e9169`.

## Accepted capability
V0.1A established low-intrusion Playwright browser attachment/discovery. V0.1B established safe coexistence with `gas-remote-debug` and deterministic evidence-backed identity mapping. V0.1C now normalizes those accepted observations into one appendable read-only JSONL chronology.

Accepted V0.1C behavior:
- deterministic per-run `EVENT-000001`-style IDs and strictly increasing sequence numbers;
- wall-clock ingestion timestamps and preservation of source monotonic timestamps only when actually supplied;
- normalized browser context/page/frame/runtime events;
- normalized GAS target/session/frame/runtime-context events using dependency-native IDs;
- mapping evidence emitted only from the accepted deterministic mapper;
- unsupported relationships emitted as explicit `IDENTITY_UNMAPPED` evidence;
- URL query values and Apps Script deployment path tokens are redacted from timeline/CLI output;
- JSONL output is appendable, UTF-8 and independently parseable line by line;
- accepted read-only browser contract remains intact.

Accepted validation included typecheck, 19/19 tests, clean baseline-to-HEAD diff check, and a live 40-event JSONL run with no malformed lines, duplicate event IDs or sequence gaps. The live evidence contained 2 proven mappings and 3 explicit unmapped identities; before/after target identities were unchanged and the endpoint remained responsive.

## Architecture baseline
- Project is independent from AFFOTECH.
- Browser semantic interaction belongs to Playwright.
- Normal page/frame CDP observation uses public Playwright CDP sessions.
- GAS-specific browser-root recursive/OOPIF discovery belongs to `gas-remote-debug` behind `GasAdapter`.
- GAS activation remains only the `https://script.google.com/macros/` prefix rule in v0.1.
- Unified timeline/correlation belongs to Chrome-Dual-Layer-Debugger.
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
- Do not redesign the accepted V0.1C normalized timeline without direct regression evidence.

## Exact next intended action
Select the next bounded milestone from the accepted V0.1C baseline. If multiple debugger runs must append to one JSONL file, establish an explicit run/trace namespace before claiming event-ID uniqueness across runs. Deeper `google.script.run` propagation remains separate future work and must not be mixed into a small run-identity milestone.

Do not jump directly to GUI work, breakpoints, destructive browser controls, broad automation, or unbounded server instrumentation.
