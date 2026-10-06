import { pathToFileURL } from 'node:url';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';
import { GasAdapter, redactGasSecrets, type GasDiscoveryResult } from '../gas/GasAdapter.js';
import { mapCrossLayerIdentities } from '../core/CrossLayerMapper.js';
import { Timeline } from '../trace/Timeline.js';
import { FileJsonlTraceWriter } from '../trace/JsonlTraceWriter.js';
import { emitBrowserDiscovery, emitGasDiscovery, emitMappingEvidence, emitSessionEvent } from '../trace/DiscoveryEvents.js';
import { V1ObserverScopeIds } from '../browser/V1CorrelationObserver.js';
import { readFile } from 'node:fs/promises';
import { runSmokeScenario } from '../testing/SmokeRunner.js';
import { parseSmokeScenario } from '../testing/SmokeScenarioParser.js';
import type { SmokeScenario, SmokeScenarioResult } from '../testing/SmokeScenario.js';
import type { TestingBackendId } from '../testing/ActionContract.js';
import { TestPageSession } from '../testing/TestPageSession.js';

const MAX_V1_OBSERVATION_MS = 300_000;

interface CliOptions { endpoint: string; timelinePath: string; observeV1Ms?: number; }

export function parseCliOptions(args: string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--endpoint', '--timeline', '--observe-v1-ms']);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error(`Unknown or unexpected argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  const observeText = values.get('--observe-v1-ms');
  let observeV1Ms: number | undefined;
  if (observeText !== undefined) {
    if (!/^\d+$/.test(observeText)) throw new Error('--observe-v1-ms must be a positive integer');
    observeV1Ms = Number(observeText);
    if (!Number.isSafeInteger(observeV1Ms) || observeV1Ms <= 0 || observeV1Ms > MAX_V1_OBSERVATION_MS) {
      throw new Error(`--observe-v1-ms must be between 1 and ${MAX_V1_OBSERVATION_MS}`);
    }
  }
  return {
    endpoint: values.get('--endpoint') ?? 'http://127.0.0.1:9222',
    timelinePath: values.get('--timeline') ?? '.agent-work/artifacts/timeline.jsonl',
    ...(observeV1Ms === undefined ? {} : { observeV1Ms })
  };
}

export async function runCli(args: string[]): Promise<number> {
  if (args[0] === 'smoke') {
    return runSmokeCli(args.slice(1));
  }
  if (args[0] !== 'discover') throw new Error('Usage: node dist/src/cli/main.js discover [--endpoint URL] [--timeline PATH] [--observe-v1-ms N] | smoke --scenario FILE --backend PLAYWRIGHT|GAS_OOPIF --endpoint URL --approval-reference TEXT [--timeline PATH]');
  const { endpoint, timelinePath, observeV1Ms } = parseCliOptions(args.slice(1));
  const discovery = new PlaywrightBrowserDiscovery(endpoint);
  const gasAdapter = new GasAdapter();
  const timeline = new Timeline();
  const observers: ReturnType<PlaywrightBrowserDiscovery['createV1Observer']>[] = [];
  const observerIds = new V1ObserverScopeIds();
  emitSessionEvent(timeline, 'SESSION_STARTED');
  console.log(`Run ID: ${timeline.runId}`);
  try {
    const result = await discovery.discover();
    emitBrowserDiscovery(timeline, result, redactGasSecrets);
    console.log('Browser connected');
    console.log(`Contexts: ${result.contexts.length}`);
    for (const context of result.contexts) {
      console.log(context.contextId);
      for (const page of context.pages) {
        console.log(page.pageId);
        console.log(`  url: ${redactGasSecrets(page.url)}`);
        console.log(`  mode: ${page.mode}`);
        console.log('  frames:');
        printFrames(page.frames);
        console.log(`  execution contexts observed: ${page.executionContextIds.length}`);
        if (page.mode === 'BROWSER_PLUS_GAS') {
          const gas = await gasAdapter.discover(page, endpoint);
          if (gas.active) {
            emitGasDiscovery(timeline, gas, redactGasSecrets);
            const mappings = mapCrossLayerIdentities([page], gas);
            emitMappingEvidence(timeline, mappings);
            printGasEvidence(gas, [page]);
          }
        }
      }
    }
    if (observeV1Ms !== undefined) {
      const eligiblePages = result.contexts.flatMap((context) => context.pages).filter((page) => page.mode === 'BROWSER_PLUS_GAS');
      for (const page of eligiblePages) {
        const observer = discovery.createV1Observer(page.pageId, timeline, observerIds);
        await observer.start();
        observers.push(observer);
      }
      if (observers.length) {
        console.log(`V1 observation: ${observers.length} page observer(s), ${observeV1Ms} ms`);
        await new Promise<void>((resolve) => setTimeout(resolve, observeV1Ms));
      }
    }
  } finally {
    try {
      for (const observer of observers) {
        try {
          const { result } = await observer.stop();
          console.log(`V1 observer ${observer.observerScopeId}: proven=${result.proven.length}, uncorrelated=${result.uncorrelated.filter((item) => item.emitTraceEvent).length}`);
        } catch (error) {
          console.error(`V1 observer ${observer.observerScopeId} cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      try {
        await gasAdapter.disconnect();
      } finally {
        try {
          await discovery.disconnect();
        } finally {
          emitSessionEvent(timeline, 'SESSION_ENDED');
          const writer = new FileJsonlTraceWriter(timelinePath);
          try {
            for (const event of timeline.snapshot()) await writer.write(event);
          } finally {
            await writer.close();
          }
          console.log(`Timeline appended: ${timelinePath} (${timeline.snapshot().length} events)`);
        }
      }
    }
  }
  return 0;
}

export interface SmokeCliOptions {
  scenarioPath: string;
  backend: TestingBackendId;
  endpoint: string;
  approvalReference: string;
  timelinePath: string;
}

export function parseSmokeCliOptions(args: string[]): SmokeCliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--scenario', '--backend', '--endpoint', '--approval-reference', '--timeline']);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error(`Unknown or unexpected smoke argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate smoke argument: ${flag}`);
    const value = args[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  for (const required of ['--scenario', '--backend', '--endpoint', '--approval-reference']) {
    if (!values.has(required)) throw new Error(`${required} is required for smoke`);
  }
  const backend = values.get('--backend');
  if (backend !== 'PLAYWRIGHT' && backend !== 'GAS_OOPIF') throw new Error('--backend must be PLAYWRIGHT or GAS_OOPIF');
  const endpoint = values.get('--endpoint')!;
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new Error('--endpoint must be an absolute HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol) || parsedEndpoint.username || parsedEndpoint.password) throw new Error('--endpoint must be an HTTP(S) URL without credentials');
  const approvalReference = values.get('--approval-reference')!;
  if (!approvalReference.trim() || approvalReference.length > 512 || approvalReference.includes('\0')) throw new Error('--approval-reference must be non-empty and bounded');
  return {
    scenarioPath: values.get('--scenario')!,
    backend,
    endpoint,
    approvalReference,
    timelinePath: values.get('--timeline') ?? '.agent-work/artifacts/smoke-timeline.jsonl'
  };
}

export interface SmokeCliDependencies {
  readScenarioFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; scenario: SmokeScenario }): Promise<Pick<TestPageSession, 'backend' | 'authorization' | 'close'>>;
  writeTimeline(path: string, timeline: Timeline): Promise<void>;
  writeOutput(line: string): void;
  createTimeline(): Timeline;
}

const defaultSmokeCliDependencies: SmokeCliDependencies = {
  async readScenarioFile(path) { return JSON.parse(await readFile(path, 'utf8')) as unknown; },
  openSession: (options) => TestPageSession.open(options),
  writeOutput(line) { console.log(line); },
  createTimeline() { return new Timeline(); },
  async writeTimeline(path, timeline) {
    const writer = new FileJsonlTraceWriter(path);
    try { for (const event of timeline.snapshot()) await writer.write(event); }
    finally { await writer.close(); }
  }
};

/** Returns 0 for PASS and 2 for a completed scenario FAIL; configuration/runtime errors throw. */
export async function runSmokeCli(args: string[], dependencies: SmokeCliDependencies = defaultSmokeCliDependencies): Promise<number> {
  const options = parseSmokeCliOptions(args);
  const scenario = parseSmokeScenario(await dependencies.readScenarioFile(options.scenarioPath));
  const timeline = dependencies.createTimeline();
  const session = await dependencies.openSession({
    endpoint: options.endpoint, backend: options.backend, approvalReference: options.approvalReference, scenario
  });
  let result: SmokeScenarioResult | undefined;
  let executionError: unknown;
  try {
    result = await runSmokeScenario({ backend: session.backend, scenario, timeline, authorization: session.authorization });
  } catch (error) {
    executionError = error;
  } finally {
    await session.close();
  }
  if (executionError) throw executionError;
  if (!result) throw new Error('Smoke runner produced no result');
  await dependencies.writeTimeline(options.timelinePath, timeline);
  const output = {
    scenarioId: result.scenarioId,
    backend: result.backend,
    status: result.status,
    runId: result.runId,
    stepResults: result.stepResults.map((step) => ({ stepId: step.stepId, kind: step.kind, operation: step.operation, ok: step.ok, ...(step.errorCode ? { errorCode: step.errorCode } : {}) })),
    ...(result.failedStepId ? { failedStepId: result.failedStepId } : {})
  };
  dependencies.writeOutput(JSON.stringify(output));
  return result.status === 'PASS' ? 0 : 2;
}

function printGasEvidence(gas: GasDiscoveryResult, pages: Parameters<typeof mapCrossLayerIdentities>[0]): void {
  const mappings = mapCrossLayerIdentities(pages, gas);
  console.log('  gas:');
  console.log(`    profile: ${gas.profileName}`);
  console.log(`    attached target/session pairs: ${gas.attachedTargets.map((entry) => `${entry.targetId}/${entry.sessionId}`).join(', ') || 'none'}`);
  console.log(`    profile-selected iframe target candidates: ${gas.profileTargetCandidates.join(', ') || 'none'}`);
  console.log(`    skipped ambiguous profile targets: ${gas.skippedAmbiguousProfileTargets}`);
  console.log('    targets:');
  for (const target of gas.targets) console.log(`      ${target.targetId} ${target.type} ${redactGasSecrets(target.url)}`);
  console.log('    sessions:');
  for (const session of gas.sessions) console.log(`      ${session.sessionId} target=${session.targetId} parent=${session.parentSessionId || 'ROOT'} detached=${session.detached}`);
  console.log('    frames:');
  for (const frame of gas.frames) console.log(`      ${frame.frameId} session=${frame.sessionId} target=${frame.targetId} parent=${frame.parentFrameId || 'ROOT'} url=${redactGasSecrets(frame.url || '')}`);
  console.log('    contexts:');
  for (const context of gas.contexts) console.log(`      target=${context.targetId} session=${context.sessionId} frame=${context.frameId} executionContext=${context.executionContextId} default=${context.defaultWorld} name=${redactGasSecrets(context.name)} origin=${redactGasSecrets(context.origin)}`);
  console.log('    proven mappings:');
  for (const mapping of mappings.provenFrames) console.log(`      PAGE ${mapping.pageId} FRAME ${mapping.playwrightFrameId} == GAS FRAME ${mapping.gasFrameId} protocolFrameId=${mapping.protocolFrameId} session=${mapping.gasSessionId} target=${mapping.gasTargetId} evidence=${mapping.evidence}`);
  for (const mapping of mappings.provenContexts) console.log(`      PAGE ${mapping.pageId} FRAME ${mapping.playwrightFrameId} == GAS executionContext=${mapping.executionContextId} frame=${mapping.gasFrameId} session=${mapping.gasSessionId}`);
  console.log(`    unmapped Playwright pages: ${mappings.unmappedPlaywrightPageIds.join(', ') || 'none'}`);
  console.log(`    unmapped Playwright frames: ${mappings.unmappedPlaywrightFrameIds.join(', ') || 'none'}`);
  console.log(`    unmapped GAS frames: ${mappings.unmappedGasFrameIds.join(', ') || 'none'}`);
  console.log(`    unmapped GAS execution contexts: ${mappings.unmappedGasContextIds.join(', ') || 'none'}`);
}

function printFrames(frames: Awaited<ReturnType<PlaywrightBrowserDiscovery['discover']>>['contexts'][number]['pages'][number]['frames'], depth = 2): void {
  for (const frame of frames) {
    console.log(`${' '.repeat(depth)}${frame.frameId}: ${redactGasSecrets(frame.url)}${frame.name ? ` (${frame.name})` : ''}`);
    printFrames(frame.children, depth + 2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
