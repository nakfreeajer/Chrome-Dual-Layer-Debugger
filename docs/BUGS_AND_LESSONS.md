# Bugs and Lessons

Record only proven defects, incidents, or reusable prevention lessons. Do not promote speculation into permanent governance.

## Current reusable lessons

### L-001 — Do not duplicate GAS recursive target discovery
The existing `gas-remote-debug` project already maintains browser-root target/session/frame/execution-context discovery for GAS/OOPIF cases. Reimplementing the same ownership in Chrome-Dual-Layer-Debugger would create competing registries and unnecessary complexity.

### L-002 — Prefer public Playwright CDP access for ordinary pages
Playwright already exposes public page/frame `CDPSession` capability. Normal browser observation should use that boundary before adding a second browser-wide raw CDP connection.

### L-003 — Detection and discovery are separate concerns
GAS mode selection can remain a simple URL-prefix decision. Complex target/context discovery belongs after mode selection inside the GAS adapter.


### L-004 - Correlation does not prove transparent runner semantics
V0.1G showed that a debugger-owned wrapper can correlate calls and still change observable failure behavior: reconstructing native Apps Script `ScriptError` behavior as a JavaScript `Error` is not equivalent. Successful correlation is not proof of semantic transparency. Prefer an explicit cooperative contract over impersonating arbitrary native `google.script.run` behavior; leave ordinary calls untouched.
