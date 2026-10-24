import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { DiscoveryResult, DiscoveredPage } from '../../src/browser/BrowserDiscovery.js';
import { DISCOVERY_CLI_CONTRACT, parseDiscoveryContractOptions, runDiscoveryContractCli, type DiscoveryContractDependencies } from '../../src/cli/DiscoveryContract.js';
import { SMOKE_CLI_CONTRACT } from '../../src/cli/main.js';
import type { GasDiscoveryResult } from '../../src/gas/GasAdapter.js';
import { Timeline } from '../../src/trace/Timeline.js';

const ordinaryPage: DiscoveredPage = {
  pageId: 'page-1', contextId: 'context-1', url: 'https://ordinary.example/private/customer', title: 'private title',
  mode: 'BROWSER_ONLY', frames: [], executionContextIds: [1]
};

const gasPage: DiscoveredPage = {
  pageId: 'page-gas', contextId: 'context-gas', url: 'https://script.google.com/macros/s/deployment-secret/exec?user=private',
  title: 'private title approval-reference-sentinel',
  mode: 'BROWSER_PLUS_GAS', frames: [{ frameId: 'pw-frame-1', protocolFrameId: 'protocol-frame-1', name: 'frame-name-sentinel selector-sentinel',
    url: 'https://user:credential@script.google.com/macros/s/deployment-secret/exec/path-sentinel?query-sentinel=private', children: [] }],
  executionContextIds: []
};

function gasEvidence(options: { duplicateFrame?: boolean; malformed?: boolean } = {}): GasDiscoveryResult {
  const frameId = options.malformed ? '' : 'protocol-frame-1';
  const frames: GasDiscoveryResult['frames'] = [{ frameId, sessionId: 'child-session-1', targetId: 'child-target-1', parentFrameId: 'root-frame' }];
  const sessions: GasDiscoveryResult['sessions'] = [
    { targetId: 'root-target', sessionId: 'root-session', parentSessionId: '', detached: false },
    { targetId: 'child-target-1', sessionId: 'child-session-1', parentSessionId: 'root-session', detached: false }
  ];
  const targets: GasDiscoveryResult['targets'] = [
    { targetId: 'root-target', type: 'page', url: 'https://script.google.com/macros/s/deployment-secret/exec' },
    { targetId: 'child-target-1', type: 'iframe', url: 'https://usercodeapp.example/private/path' }
  ];
  if (options.duplicateFrame) {
    frames.push({ frameId, sessionId: 'child-session-2', targetId: 'child-target-2', parentFrameId: 'root-frame' });
    sessions.push({ targetId: 'child-target-2', sessionId: 'child-session-2', parentSessionId: 'root-session', detached: false });
    targets.push({ targetId: 'child-target-2', type: 'iframe', url: 'https://usercodeapp.example/other' });
  }
  return {
    active: true, profileName: 'private profile name', selectedTargetId: 'root-target', attachedSessionId: 'root-session',
    attachedTargets: [{ targetId: 'root-target', sessionId: 'root-session' }, { targetId: 'child-target-1', sessionId: 'child-session-1' }],
    profileTargetCandidates: ['child-target-1'], skippedAmbiguousProfileTargets: false,
    targets, sessions, frames,
    contexts: [{ targetId: 'child-target-1', sessionId: 'child-session-1', executionContextId: 42, frameId,
      origin: 'https://usercodeapp.example/private?token=private', name: 'private context name', defaultWorld: true, ignored: false, alive: true }]
  };
}

function harness(options: { pages?: DiscoveredPage[]; gas?: GasDiscoveryResult; browserError?: boolean; gasError?: boolean; disconnectError?: boolean } = {}) {
  const record = { gasCreated: 0, gasDisconnected: 0, browserDisconnected: 0, timeline: undefined as Timeline | undefined, output: '' };
  const result: DiscoveryResult = { connected: true, contexts: [{ contextId: 'context-1', pages: options.pages ?? [ordinaryPage] }] };
  const dependencies: DiscoveryContractDependencies = {
    createDiscovery() { return { async discover() { if (options.browserError) throw new Error('sensitive browser error'); return result; }, async disconnect() { record.browserDisconnected += 1; if (options.disconnectError) throw new Error('private cleanup detail'); } }; },
    createGasAdapter() { record.gasCreated += 1; return { async discover() { if (options.gasError) throw new Error('private GAS failure'); return options.gas ?? gasEvidence(); }, async disconnect() { record.gasDisconnected += 1; } }; },
    createTimeline() { return new Timeline({ runId: 'discovery-run-1' }); },
    async writeTimeline(_path, timeline) { record.timeline = timeline; },
    writeOutput(line) { record.output = line; }
  };
  return { record, dependencies };
}

test('discovery contract parser requires separately selected JSON mode and rejects bad options', () => {
  assert.deepEqual(DISCOVERY_CLI_CONTRACT, { contractId: 'cdld.discovery-cli', contractVersion: 1 });
  assert.deepEqual(parseDiscoveryContractOptions(['--format', 'json']), { endpoint: 'http://127.0.0.1:9222', timelinePath: '.agent-work/artifacts/timeline.jsonl' });
  for (const args of [[], ['--format', 'text'], ['--format', 'json', '--format', 'json'], ['--format', 'json', '--unknown', 'x'], ['--format', 'json', '--endpoint', 'https://user:pass@example.test'], ['--format', 'json', 'extra']]) {
    assert.throws(() => parseDiscoveryContractOptions(args), /DISCOVERY_OPTIONS_INVALID/);
  }
});

test('ordinary browser discovery returns structured identities and explicit unknown GAS mapping without claiming ownership', async () => {
  const { record, dependencies } = harness();
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 0);
  const response = JSON.parse(record.output) as Record<string, any>;
  assert.equal(response.contractId, 'cdld.discovery-cli');
  assert.equal(response.contractVersion, 1);
  assert.equal(response.outcome, 'COMPLETE');
  assert.equal(response.runId, 'discovery-run-1');
  assert.equal(response.browser.classification, 'BROWSER_ONLY');
  assert.equal(response.browser.contexts[0].pages[0].pageId, 'page-1');
  assert.equal(response.gas.length, 0);
  assert.equal(response.cleanup.fixtureOwnership, 'NOT_ASSESSED');
  assert.equal(response.cleanup.browserDiscoveryDisconnect, 'COMPLETED');
  assert.equal(record.gasCreated, 0);
  assert.equal(record.browserDisconnected, 1);
  assert.ok(record.timeline);
  assert.equal(record.timeline!.snapshot()[0].type, 'SESSION_STARTED');
  assert.equal(record.timeline!.snapshot().at(-1)?.type, 'SESSION_ENDED');
});

test('GAS evidence preserves exact target/session/context identity and only exact unique mappings are proven', async () => {
  const { record, dependencies } = harness({ pages: [gasPage] });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 0);
  const response = JSON.parse(record.output) as Record<string, any>;
  assert.equal(response.browser.classification, 'BROWSER_PLUS_GAS');
  assert.deepEqual(response.gas[0].targets.map((item: any) => item.targetId), ['root-target', 'child-target-1']);
  assert.equal(response.gas[0].sessions[1].sessionId, 'child-session-1');
  assert.equal(response.gas[0].contexts[0].executionContextId, 42);
  assert.equal(response.mappings.provenFrames[0].protocolFrameId, 'protocol-frame-1');
  assert.equal(response.mappings.provenContexts[0].executionContextId, 42);
  assert.equal(response.mappings.unresolved[0].kind, 'PLAYWRIGHT_PAGE_TO_GAS_TARGET');
  assert.equal(response.mappings.unresolved[0].state, 'UNKNOWN');
  assert.equal(response.cleanup.fixtureOwnership, 'NOT_ASSESSED');
  assert.equal(record.gasCreated, 1);
  assert.equal(record.gasDisconnected, 1);
});

test('GAS discovery failure reports an explicit unknown relationship without inventing identities', async () => {
  const { record, dependencies } = harness({ pages: [gasPage], gasError: true });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 2);
  const response = JSON.parse(record.output) as Record<string, any>;
  assert.equal(response.gas[0].status, 'FAILED');
  assert.ok(response.mappings.unresolved.some((item: any) => item.kind === 'PLAYWRIGHT_PAGE_TO_GAS_TARGET'
    && item.state === 'UNKNOWN' && item.reason === 'GAS_DISCOVERY_FAILED'));
  assert.equal(response.mappings.provenFrames.length, 0);
  assert.equal(response.mappings.provenContexts.length, 0);
  const failedMapping = response.mappings.unresolved.find((item: any) => item.reason === 'GAS_DISCOVERY_FAILED');
  assert.equal(Object.hasOwn(failedMapping, 'targetId'), false);
  assert.equal(Object.hasOwn(failedMapping, 'sessionId'), false);
  assert.equal(record.output.includes('deployment-secret'), false);
});

test('duplicate exact protocol-frame candidates are reported ambiguous, never joined', async () => {
  const { record, dependencies } = harness({ pages: [gasPage], gas: gasEvidence({ duplicateFrame: true }) });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 0);
  const response = JSON.parse(record.output) as Record<string, any>;
  assert.equal(response.mappings.provenFrames.length, 0);
  assert.equal(response.mappings.provenContexts.length, 0);
  assert.ok(response.mappings.unresolved.some((item: any) => item.state === 'AMBIGUOUS'));
});

test('exact frame proof survives missing runtime context while inconsistent target/session evidence is rejected', async () => {
  const missing = gasEvidence();
  missing.contexts = [];
  const first = harness({ pages: [gasPage], gas: missing });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], first.dependencies), 0);
  const response = JSON.parse(first.record.output) as Record<string, any>;
  assert.equal(response.mappings.provenContexts.length, 0);
  assert.ok(response.mappings.provenFrames.some((item: any) => item.protocolFrameId === 'protocol-frame-1'));
  assert.equal(response.gas[0].contexts.length, 0);

  const inconsistent = gasEvidence();
  inconsistent.contexts[0].targetId = 'different-target';
  const second = harness({ pages: [gasPage], gas: inconsistent });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], second.dependencies), 2);
  const malformed = JSON.parse(second.record.output) as Record<string, any>;
  assert.equal(malformed.gas[0].status, 'MALFORMED_EVIDENCE');
  assert.equal(malformed.mappings.provenFrames.length, 0);
});

test('machine output omits URLs, titles, names, and synthetic sensitive values', async () => {
  const gas = gasEvidence();
  gas.profileName = 'profile-name-sentinel approval-reference-sentinel';
  gas.targets[1].url = 'https://user:credential@usercodeapp.example/path-sentinel?query-sentinel=private';
  gas.frames[0].url = 'https://user:credential@usercodeapp.example/frame-path-sentinel?frame-query-sentinel=private';
  gas.contexts[0].origin = 'https://user:credential@usercodeapp.example/context-path-sentinel?context-query-sentinel=private';
  gas.contexts[0].name = 'context-name-sentinel selector-sentinel';
  gas.matchedRuntimeContext = { targetId: 'child-target-1', sessionId: 'child-session-1', executionContextId: 42, frameId: 'protocol-frame-1' };
  const { record, dependencies } = harness({ pages: [gasPage], gas });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 0);
  const persistedTimeline = JSON.stringify(record.timeline?.snapshot()) ?? '';
  for (const privateValue of [
    'deployment-secret', 'user=private', 'private title', 'profile-name-sentinel', 'context-name-sentinel',
    'frame-name-sentinel', 'selector-sentinel', 'approval-reference-sentinel', 'path-sentinel', 'query-sentinel',
    'credential', 'frame-query-sentinel', 'context-query-sentinel'
  ]) {
    assert.equal(record.output.includes(privateValue), false, `stdout excludes ${privateValue}`);
    assert.equal(persistedTimeline.includes(privateValue), false, `Timeline sidecar excludes ${privateValue}`);
  }
  assert.deepEqual(record.timeline?.snapshot().map((event) => event.type), ['SESSION_STARTED', 'SESSION_ENDED']);
});

test('malformed identities fail closed without serializing malformed raw evidence', async () => {
  const { record, dependencies } = harness({ pages: [gasPage], gas: gasEvidence({ malformed: true }) });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], dependencies), 2);
  const response = JSON.parse(record.output) as Record<string, any>;
  assert.equal(response.outcome, 'PARTIAL');
  assert.equal(response.errorCode, 'GAS_EVIDENCE_INVALID');
  assert.equal(response.gas[0].status, 'MALFORMED_EVIDENCE');
  assert.equal(response.mappings.provenFrames.length, 0);
  assert.equal(record.output.includes('"frameId":""'), false);
});

test('discovery and disconnect errors are bounded and all acquired adapters get disconnect attempts', async () => {
  const browserFailure = harness({ browserError: true });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], browserFailure.dependencies), 1);
  const failed = JSON.parse(browserFailure.record.output) as Record<string, any>;
  assert.equal(failed.errorCode, 'BROWSER_DISCOVERY_FAILED');
  assert.equal(browserFailure.record.browserDisconnected, 1);
  assert.equal(browserFailure.record.output.includes('sensitive browser error'), false);

  const gasFailure = harness({ pages: [gasPage], gasError: true, disconnectError: true });
  assert.equal(await runDiscoveryContractCli(['--format', 'json'], gasFailure.dependencies), 2);
  const partial = JSON.parse(gasFailure.record.output) as Record<string, any>;
  assert.equal(partial.errorCode, 'GAS_DISCOVERY_FAILED');
  assert.equal(gasFailure.record.gasDisconnected, 1);
  assert.equal(gasFailure.record.browserDisconnected, 1);
  assert.equal(partial.cleanup.gasAdapterDisconnects[0].status, 'COMPLETED');
  assert.equal(partial.cleanup.browserDiscoveryDisconnect, 'FAILED');
  assert.equal(gasFailure.record.output.includes('private GAS failure'), false);
  assert.equal(gasFailure.record.output.includes('private cleanup detail'), false);
});

test('an independent Node consumer parses the emitted contract and smoke CLI v1 stays unchanged', async () => {
  const { record, dependencies } = harness();
  await runDiscoveryContractCli(['--format', 'json'], dependencies);
  const child = spawnSync(process.execPath, ['-e', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const x=JSON.parse(s);if(x.contractId!=="cdld.discovery-cli"||x.contractVersion!==1||!x.runId||!x.browser||!x.cleanup)process.exit(3);process.stdout.write("PARSED")})'],
    { input: record.output, encoding: 'utf8', shell: false, windowsHide: true, timeout: 5_000 });
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'PARSED');
  assert.equal(child.stderr, '');
  assert.deepEqual(SMOKE_CLI_CONTRACT, { contractId: 'cdld.smoke-cli', contractVersion: 1 });
});

test('compiled CLI routes discover JSON mode offline and keeps the smoke contract command unchanged', () => {
  const cliPath = fileURLToPath(new URL('../../src/cli/main.js', import.meta.url));
  const invalid = spawnSync(process.execPath, [cliPath, 'discover', '--format', 'json', '--endpoint', 'https://user:credential@invalid.example'],
    { encoding: 'utf8', shell: false, windowsHide: true, timeout: 5_000 });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, '');
  assert.equal(invalid.stdout.trimEnd().split(/\r?\n/).length, 1);
  const result = JSON.parse(invalid.stdout) as Record<string, any>;
  assert.equal(result.contractId, 'cdld.discovery-cli');
  assert.equal(result.contractVersion, 1);
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.errorCode, 'INVALID_OPTIONS');
  assert.equal(result.browser.status, 'NOT_STARTED');
  assert.equal(invalid.stdout.includes('credential'), false);

  const smoke = spawnSync(process.execPath, [cliPath, 'contract'],
    { encoding: 'utf8', shell: false, windowsHide: true, timeout: 5_000 });
  assert.equal(smoke.status, 0);
  assert.equal(smoke.stderr, '');
  assert.equal(smoke.stdout, '{"contractId":"cdld.smoke-cli","contractVersion":1}\n');
});
