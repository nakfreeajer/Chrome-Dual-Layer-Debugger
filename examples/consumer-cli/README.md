# Offline consumer CLI example

This example shows how another Node project can invoke the existing compiled CDLD CLI from its own working directory. It is a local development process contract; CDLD remains `private: true` and this does not create a published SDK, package export, or drop-in Playwright replacement.

Build CDLD once from the CDLD repository root:

```sh
npm run build
```

The consumer must provide the absolute path to that build's `dist/src/cli/main.js`, a suite JSON file, and two result artifacts previously produced for that exact suite. The result artifacts must be under the consumer working directory's `.agent-work/artifacts/` directory, which is the existing `suite compare` safety boundary.

From the consumer project's directory:

```sh
node /absolute/path/to/Chrome-Dual-Remote-Debugger/examples/consumer-cli/run.mjs \
  /absolute/path/to/Chrome-Dual-Remote-Debugger/dist/src/cli/main.js \
  ./suite.json \
  ./.agent-work/artifacts/playwright-result.json \
  ./.agent-work/artifacts/gas-oopif-result.json
```

The wrapper starts Node with an argument array and `shell: false`; no command text is interpolated into a shell. Its stdout is one privacy-reduced JSON status. Exit code `0` means the existing CLI comparison returned `PASS`; exit code `2` means the comparison returned `FAIL` or `NOT_COMPARABLE`; exit code `1` means the CLI could not be started, returned an unexpected result/exit, or the arguments were invalid. Diagnostics use safe reason codes and do not echo paths or artifact values.

`suite compare` reads and validates the suite/result JSON files. It does not attach to a browser or connect to CDP. This offline comparison proves only that an independent consumer process can use the existing CLI contract. It does **not** prove authentic Playwright execution, Chrome behavior, GAS/OOPIF integration, fixture ownership, or safe browser cleanup. Those outcomes remain separately unqualified.

The consumer owns its application, suite, test data, and expected outcomes. It must not add browser-root CDP or recursive GAS/OOPIF discovery to this example; those capabilities remain behind CDLD's existing backend boundary.
