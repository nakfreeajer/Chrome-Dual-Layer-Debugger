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


### L-005 - Content addressing does not govern current authorization
RELAY.1A review found that a mutable current locator could otherwise silently displace an active authorized prompt even though each prompt and manifest was immutable. Authorization transitions must be guarded by verified durable lifecycle evidence; changed decisions require explicit supersession. Completed supersession evidence must also reject replay of a stale prior locator.

### L-006 - Byte identity requires hash gates
A publication hash mismatch exposed mojibake in a reviewed patch representation for a synthetic Unicode fixture. Byte-level diagnosis distinguished content changes from line-ending changes; the accepted current fixture was independently reviewed. Exact SHA-256 gates remain authoritative whenever exact prompt bytes matter. The responsible tool or process was not determined, so no attribution is made.

### L-007 - Child/OOPIF marker visibility requires an explicit observer gate
V0.1J/V0.1K live fixture evidence showed that an early Playwright observer and raw child/OOPIF CDP observed cooperative completion markers while a late Playwright Page console observer did not. The validated production marker path is raw child/OOPIF Runtime evidence fused with Playwright Network evidence in the same V0.1I recognizer. For decisive observer comparisons, hold synthetic calls behind an explicit fixture start gate until all intended controls report ready. This lesson is bounded to the accepted Apps Script fixture behavior and does not make target/session identity correlation authority.

### L-008 - Compare normalized state structurally across backends
TEST.1A live parity exposed an assertion helper comparing independently read object-valued state by reference identity. Equivalent state snapshots from Playwright and GAS/OOPIF are distinct objects, so identity comparison falsely failed. Cross-backend assertions must compare the declared structural values; a focused regression test now covers this contract.

### L-009 - Authorize TEST work before the first browser mutation
TEST.1B review found that validating authorization only when an action executes is too late if the public session API can create or navigate a runner-owned page first. Validate explicit TEST intent and approval preconditions before page creation/navigation, then retain target-bound authorization after exact target selection.

### L-010 - Public Playwright OOPIF Frames may lack a unique page-tree identity
An OOPIF may appear as a public Playwright `Frame` while the page CDP `Page.getFrameTree` result has no unique corresponding node. Preserve an accepted normalized frame identity when deterministically available; otherwise assign a stable debugger-local identity to the exact selected Frame and do not claim it is a protocol `FrameId`.
