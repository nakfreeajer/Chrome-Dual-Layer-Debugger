# Consumer discovery CLI contract

This checkout-local contract provides machine-readable, read-only discovery through CDLD's existing Playwright discovery and `GasAdapter`/`gas-remote-debug` integration. It does not add a discovery engine and does not change `cdld.smoke-cli` version 1.

## Identity and invocation

Contract identity is `cdld.discovery-cli`, version `1`. Build the checkout, then invoke the compiled CLI using an argument array (no shell interpolation) from an independent Node consumer:

```sh
npm run build
node /absolute/path/to/Chrome-Dual-Layer-Debugger/dist/src/cli/main.js discover --format json --endpoint http://127.0.0.1:9222
```

The existing human-readable `discover` mode remains the default. The machine mode is selected only by `--format json`. It accepts `--endpoint` and optional `--timeline`; unknown, duplicate, missing, or unsupported arguments fail closed. The default timeline remains `.agent-work/artifacts/timeline.jsonl`; explicit timeline paths must pass the existing artifact-path containment rule.

## Result shape

Machine mode writes one JSON object plus LF to stdout and no human-readable progress lines. A completed result has this shape (arrays may be empty):

```json
{
  "contractId": "cdld.discovery-cli",
  "contractVersion": 1,
  "outcome": "COMPLETE",
  "runId": "<timeline-run-id>",
  "browser": {
    "status": "DISCOVERED",
    "classification": "BROWSER_ONLY",
    "contexts": [{
      "contextId": "<browser-context-id>",
      "pages": [{
        "pageId": "<page-id>",
        "mode": "BROWSER_ONLY",
        "frames": [{"frameId":"<frame-id>","children":[]}],
        "executionContextIds": []
      }]
    }]
  },
  "gas": [],
  "mappings": {
    "provenFrames": [],
    "provenContexts": [],
    "unresolved": [{
      "kind": "PLAYWRIGHT_PAGE_TO_GAS_TARGET",
      "state": "UNKNOWN",
      "reason": "PLAYWRIGHT_TARGET_ID_NOT_EXPOSED"
    }]
  },
  "cleanup": {
    "gasAdapterDisconnects": [],
    "browserDiscoveryDisconnect": "COMPLETED",
    "fixtureOwnership": "NOT_ASSESSED"
  },
  "timeline": {"eventCount": 2, "eventTypes": ["SESSION_STARTED", "SESSION_ENDED"]}
}
```

For GAS-classified pages, `gas` reports privacy-reduced target, session, frame and execution-context identities exposed by `GasAdapter`. URLs, titles, frame names, context names, approval references and raw errors are omitted from the machine response. Cross-layer frame mappings are `PROVEN` only when the existing mapper finds exact unique protocol-frame identity evidence. Missing evidence is `UNKNOWN`; conflicting exact candidates are `AMBIGUOUS`. Playwright page-to-GAS-target mapping remains `UNKNOWN` because the current public Playwright discovery result does not expose a native TargetId. Mapping states never use URL similarity, timing or target proximity.

`outcome` is `COMPLETE`, `PARTIAL` or `FAILED`. A bounded `errorCode` may be returned; raw exception messages are not serialized. Disconnect states describe adapter/discovery disconnect attempts only. `fixtureOwnership` is always `NOT_ASSESSED`: discovery does not establish fixture ownership, and successful disconnect does not prove complete shared-browser lifecycle safety. The response does not claim that tabs were created, navigated, closed or modified by this mode.

Exit codes are `0` for `COMPLETE`, `2` for a partial result after browser discovery, and `1` for invalid options or failure before browser discovery. Every contract-mode failure writes the bounded JSON response; raw exception messages are not emitted by this mode.

## Privacy and qualification boundary

The JSON discovery mode's Timeline sidecar contains only `SESSION_STARTED` and `SESSION_ENDED` lifecycle events. It deliberately does not pass browser or GAS discovery objects through the general discovery emitters, because those emitters retain descriptive frame/context/profile values and URL paths. Detailed privacy-reduced identities and mappings are returned in the contract JSON instead. The legacy human-readable `discover` mode and its existing Timeline behavior are unchanged. Expected option, browser, GAS, disconnect, and Timeline-write failures use bounded JSON error codes; an unexpected process-level exception may still be printed by the outer CLI handler, so stderr must not be treated as privacy-safe.

Offline injected tests establish result serialization, fail-closed mapping, cleanup-reporting behavior, and a compiled CLI routing path that rejects invalid options before constructing a browser connection. They do not qualify successful process-level browser discovery, live GAS/OOPIF discovery, every browser version, all possible runtime identities, fixture ownership, or shared-browser lifecycle. The existing `cdld.smoke-cli` contract and human-readable discovery behavior remain separate and unchanged in semantics.
