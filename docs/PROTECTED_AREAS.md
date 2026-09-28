# Protected Areas

The following areas require explicit scope before mutation:

- Browser process lifecycle beyond attach/disconnect.
- Navigation, page close, browser close, click/type/input mutation against an existing user browser.
- Raw browser-root CDP ownership outside the GAS adapter.
- `gas-remote-debug` source repository.
- Authentication material, browser profiles, cookies, tokens, credentials, authenticated URLs, or private logs.
- Any AFFOTECH repository, deployment, tenant data, or business data.
- Release/tag/deployment actions.
- Official project documentation outside the bounded Architect-Curator curation task.

## Default read-only principle
Observation milestones default to read-only. A capability being technically possible does not authorize its use.

## Dependency boundary
Chrome-Dual-Layer-Debugger may consume `gas-remote-debug` through an explicit dependency/integration boundary. It must not silently vendor, fork, or modify that repository.
