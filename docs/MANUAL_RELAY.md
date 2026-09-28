# Manual Relay Guide

This project does not use an automated Orchestrator or automatic relay.

## Human relay responsibilities
Rony manually transports bounded artifacts between the Architect-Curator and Executor. Transport does not create authority; it preserves the authority of the sender.

## Architect -> Executor
Relay the complete frozen milestone instruction, including:
- milestone ID;
- objective;
- approved requirements;
- authorized paths;
- explicit exclusions;
- required tests;
- acceptance criteria;
- stop conditions;
- withheld authorizations.

Prefer `docs/templates/MILESTONE_SCOPE_CONTRACT.md` for the packet shape.

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
