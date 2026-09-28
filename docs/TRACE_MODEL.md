# Trace Model

Each observation has its own `eventId`. Related observations may also carry a shared `traceId` only when correlation is evidenced.

Sources begin with:

- `CORE`
- `PLAYWRIGHT`
- `CDP`
- `GAS`

Important identity fields include page, target, session, frame, and execution context. GAS events should preserve the exact owning CDP `sessionId` and `executionContextId` in event data when relevant.

## Correlation rule

Do not infer a shared trace from timing alone. An event remains uncorrelated until a deterministic link is available.

Future GAS tracing should propagate a trace token across:

browser action -> frontend handler -> google.script.run -> GAS execution -> return/failure -> browser callback -> UI mutation.
