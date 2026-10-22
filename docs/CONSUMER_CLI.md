# Consumer smoke CLI contract

This document defines the versioned checkout-local consumer contract for CDLD's declarative smoke command. It is a supported CLI surface over a built CDLD checkout, not a published package, public Node export, SDK, or full Playwright API replacement. `package.json` remains `private: true`.

## Contract identity

Run the metadata command from any working directory:

```sh
node /absolute/path/to/Chrome-Dual-Layer-Debugger/dist/src/cli/main.js contract
```

It writes one JSON line to stdout:

```json
{"contractId":"cdld.smoke-cli","contractVersion":1}
```

The same `contractId` and `contractVersion` fields appear on every completed smoke result. `contractVersion` versions the consumer CLI/result contract; scenario input `schemaVersion` is a separate format version. Breaking changes to the smoke command or its result contract require a new contract version. Consumers should require the supported contract ID/version and tolerate additional result fields within that version.

## Build and invocation

Build CDLD once from its repository root:

```sh
npm run build
```

An independent Node runner invokes the built CLI with an argument array and no shell interpolation. From a consumer project, the supported smoke form is:

```sh
node /absolute/path/to/Chrome-Dual-Layer-Debugger/dist/src/cli/main.js smoke --scenario ./scenario.json --backend PLAYWRIGHT --endpoint http://127.0.0.1:9222 --approval-reference <human-approved-reference> [--timeline ./timeline.jsonl]
```

`--backend` accepts `PLAYWRIGHT` or `GAS_OOPIF`. `--endpoint` must be an absolute HTTP(S) URL without credentials. `--approval-reference` is required, non-empty and bounded. `--timeline` defaults to `.agent-work/artifacts/smoke-timeline.jsonl`. The exact built CLI path is checkout-local; there is no npm installation/bin contract in this version.

## Input and supported scope

Scenario input uses strict `schemaVersion: 1` JSON. It declares a scenario ID, an exact HTTP(S) page URL, and `scope: {"kind":"PAGE"}` or `scope: {"kind":"FRAME","url":"<exact-frame-url>"}`. It contains 1 to 100 uniquely identified steps. Unknown fields, unsupported operations, and operations not marked PASS on both backends are rejected before session creation. Assertions are restricted to non-mutating read operations.

The shared operation matrix lists 19 common operations as qualified for both backends and retains double-click, right-click, drag/drop, file input, and screenshot parity as explicit gaps or backend-specific scope. This contract does not claim that every operation has been independently exercised by a consuming project. The retained LIVE.1H/1I consumer evidence covers only one `PLAYWRIGHT` `PAGE` `readText` equality assertion per run. Consumer-facing GAS/OOPIF, FRAME lifecycle, and shared-browser lifecycle are not qualified by those runs.

The CLI connects to the supplied browser endpoint and creates/closes its runner-owned page. It does not launch or terminate the browser process or own its profile. `TestPageSession.close()` closes that runner-owned page and disconnects its adapters. A consumer that launches a disposable browser remains responsible for that browser process/profile lifecycle. Safe disconnect is only qualified within the evidence-backed scopes recorded by the project; it must not be generalized to every externally owned/shared browser.

`--fixture-lifecycle` is reserved for an explicitly injected trusted test driver. The normal CLI does not configure such a driver and fails closed with `FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE`; it is not part of the supported ordinary consumer invocation.

## Result and exit contract

For a completed smoke scenario, stdout contains one JSON line with these required fields:

```json
{
  "contractId": "cdld.smoke-cli",
  "contractVersion": 1,
  "scenarioId": "<scenario-id>",
  "backend": "PLAYWRIGHT",
  "status": "PASS",
  "runId": "<run-id>",
  "stepResults": [
    {"stepId":"<step-id>","kind":"assert","operation":"readText","ok":true}
  ]
}
```

Each step result contains `stepId`, `kind`, `operation`, and `ok`; a bounded `errorCode` may be present. `failedStepId`, fixture lifecycle fields, and failure-artifact status are conditional. Raw actual/expected values and selectors are not included in the normal CLI result. Timeline assertion evidence records value types rather than those values.

Exit codes:

- `0`: completed scenario PASS;
- `2`: completed scenario FAIL, including a fixture-lifecycle result that prevents PASS;
- `1`: usage, configuration, setup, or execution error before a completed result.

On code 1, a JSON result is not guaranteed. The current entrypoint writes the thrown error message to stderr; stderr is **not guaranteed to be uniformly sanitized**. Consumers must not persist or expose it as privacy-safe evidence without their own review/redaction. Unknown commands and extra arguments to `contract` fail with code 1 and no contract metadata on stdout.

## Authorization and privacy

`--approval-reference` is a caller-supplied audit reference, not authentication, a signature, or proof of Human approval. CDLD binds its TEST authorization record to the selected backend and target and the scenario fixture identity; the caller remains responsible for obtaining the required Human authorization before invoking a mutating scenario.

Normal stdout and Timeline evidence omit application values. Optional failure artifacts have separate retention rules. `--synthetic-failure-details` can retain bounded raw details and is restricted to explicitly permitted synthetic loopback fixtures; do not use it for business or customer data. Do not place secrets, credentials, or private application values in approval references or evidence paths.

## Qualification boundary

LIVE.1H and LIVE.1I remain `FAILED_LIVE_TEST`. Their `readText` assertions and three-event timelines passed as sub-evidence, but their host acceptance gates failed on added `chrome-extension:` service-worker targets. The reports do not establish those workers' provenance. Original target tuples were retained in both runs, but the full target sets changed. This contract does not alter those classifications or decide whether set equality is required.

This CLI contract does not accept CORE-04 Outcome A by itself, qualify GAS/OOPIF consumer behavior, close CORE-06/CORE-07, or declare Release 1 ready. F36 remains `INCONCLUSIVE / EXHAUSTED`; `HISTORICAL_STOP_TRIGGERED` and the unknown historical numeric/checkpoint state remain unchanged.
