# Manual Relay Guide

This project does not use an automated Orchestrator or automatic relay.

## Human relay responsibilities
Rony manually transports bounded artifacts between the Architect-Curator and Executor. Transport does not create authority; it preserves the authority of the sender.

## Architect -> Executor
Compact descriptor relay is the normal transport. The prompt file still contains the complete frozen bounded milestone, including objective, requirements, authorized paths, exclusions, tests, acceptance criteria, stop conditions, and withheld authorizations.

1. Architect authors exact prompt bytes and supplies the file plus canonical descriptor.
2. Rony saves that exact file and imports/authorizes it locally.
3. Rony sends Executor only the unchanged descriptor using:

       RELAY:EXECUTE
       <CDLD-PROMPT-V1...>

4. Executor resolves the descriptor through PromptRelayCli and uses only the verified exact bytes. If resolution fails, Executor stops.

From repository root, build when needed and import:

    npm run build
    node dist/src/relay/PromptRelayCli.js import --descriptor "<CDLD-PROMPT-V1...>" --prompt-file "<EXACT_ARCHITECT_PROMPT_FILE>" --approval-reference "<EXPLICIT_HUMAN_APPROVAL_REFERENCE>"

Import success writes only the same descriptor plus one LF. If the output differs, stop and do not send the descriptor to Executor.

Resolve at Executor handoff:

    node dist/src/relay/PromptRelayCli.js resolve --descriptor "<CDLD-PROMPT-V1...>"

Resolve success stdout is the exact prompt bytes, with no wrapper or added newline. Failure must produce zero prompt stdout bytes. The descriptor is identity evidence, not authorization; hash integrity is not permission. Human approval and verified RELAY.1A lifecycle evidence are still required.

Corrections to the current prompt for the same milestone use supersede, never ordinary import:

    node dist/src/relay/PromptRelayCli.js supersede --descriptor "<NEW_DESCRIPTOR>" --prompt-file "<NEW_EXACT_PROMPT_FILE>" --approval-reference "<EXPLICIT_APPROVAL_REFERENCE>"

The new prompt must be a different identity for the same milestone; the old descriptor becomes stale.

Withdrawal uses revoke with the current descriptor:

    node dist/src/relay/PromptRelayCli.js revoke --descriptor "<CURRENT_DESCRIPTOR>" --approval-reference "<EXPLICIT_REVOCATION_REFERENCE>"

A different milestone requires revoke, then normal import/authorization. Do not use cross-milestone supersede. Do not infer revocation from a returned Executor report.

A full-prompt manual copy is a fallback only when Rony explicitly chooses it because compact relay is unavailable or under repair. Descriptor-authorized bytes and pasted fallback text are separate authorities and must never be merged.

Prefer `docs/templates/MILESTONE_SCOPE_CONTRACT.md` for the complete prompt-file shape.

## Executor -> Architect
Relay the complete terminal report plus enough evidence for independent verification:
- exact repository/branch/baseline/head;
- changed paths;
- test commands and results;
- patch/compare or commit evidence;
- runtime/browser evidence when relevant;
- contradictions, blockers and uncertainty;
- explicit statement of actions that did not occur.

Prefer `docs/templates/EXECUTOR_REPORT.md` for the report shape.

## Architect decision -> Executor
When another execution step is required, relay the exact Architect classification and next bounded action. Do not paraphrase away blockers, exclusions, or evidence conditions.

## Documentation closure
There is no automated documentation doorbell. After accepting a milestone, the Architect-Curator decides whether institutional-memory updates are required and performs the bounded documentation synchronization in the same Architect role. The Human may manually prompt that continuation if necessary.

## Local evidence
Raw evidence stays under ignored `.agent-work/`. Only the bounded evidence needed for review should be manually transported. Never relay secrets, browser profiles, cookies, tokens, authenticated URLs, private customer/production data, or unfiltered transcripts by default.
