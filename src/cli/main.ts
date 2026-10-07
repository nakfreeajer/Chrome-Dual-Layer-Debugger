import { pathToFileURL } from 'node:url';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';
import { GasAdapter, redactGasSecrets, type GasDiscoveryResult } from '../gas/GasAdapter.js';
import { mapCrossLayerIdentities } from '../core/CrossLayerMapper.js';
import { Timeline } from '../trace/Timeline.js';
import { FileJsonlTraceWriter } from '../trace/JsonlTraceWriter.js';
import { emitBrowserDiscovery, emitGasDiscovery, emitMappingEvidence, emitSessionEvent } from '../trace/DiscoveryEvents.js';
import { V1ObserverScopeIds } from '../browser/V1CorrelationObserver.js';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { runSmokeScenario } from '../testing/SmokeRunner.js';
import { parseSmokeScenario } from '../testing/SmokeScenarioParser.js';
import type { SmokeScenario, SmokeScenarioResult } from '../testing/SmokeScenario.js';
import type { TestingBackendId } from '../testing/ActionContract.js';
import { TestPageSession } from '../testing/TestPageSession.js';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { parseExploratoryProfile } from '../testing/ExploratoryProfileParser.js';
import { generateExploratoryPlan, validateExploratorySeed } from '../testing/ExploratoryGenerator.js';
import { runExploratoryProfile } from '../testing/ExploratoryRunner.js';
import type { ExploratoryProfile, ExploratoryReplayArtifact, GeneratedExploratoryPlan, ExploratoryResult } from '../testing/ExploratoryProfile.js';
import { buildFailureArtifact, resolveFailureArtifactPath, writeFailureArtifact, type TimelineEventRef } from '../testing/FailureArtifact.js';
import { isLoopbackHttpUrl, type FailureDiagnosticResult } from '../testing/FailureDiagnostics.js';
import { createHash } from 'node:crypto';
import type { TraceEvent } from '../trace/TraceEvent.js';

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
  if (args[0] === 'monkey') return runMonkeyCli(args.slice(1));
  if (args[0] === 'smoke') {
    return runSmokeCli(args.slice(1));
  }
  if (args[0] !== 'discover') throw new Error('Usage: node dist/src/cli/main.js discover [--endpoint URL] [--timeline PATH] [--observe-v1-ms N] | smoke --scenario FILE --backend PLAYWRIGHT|GAS_OOPIF --endpoint URL --approval-reference TEXT [--timeline PATH] | monkey --profile FILE --seed UINT32 --backend PLAYWRIGHT|GAS_OOPIF --endpoint URL --approval-reference TEXT [--timeline PATH] [--replay-artifact PATH]');
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

export interface MonkeyCliOptions {
  profilePath: string;
  seed: number;
  backend: TestingBackendId;
  endpoint: string;
  approvalReference: string;
  timelinePath: string;
  replayArtifactPath: string;
  failureArtifactPath?: string;
  syntheticFailureDetails?: boolean;
}

export function parseMonkeyCliOptions(args: string[]): MonkeyCliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--profile', '--seed', '--backend', '--endpoint', '--approval-reference', '--timeline', '--replay-artifact', '--failure-artifact', '--synthetic-failure-details']);
  let syntheticFailureDetails = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--synthetic-failure-details') {
      if (syntheticFailureDetails) throw new Error('Duplicate monkey argument: --synthetic-failure-details');
      syntheticFailureDetails = true;
      continue;
    }
    if (!allowed.has(flag)) throw new Error(`Unknown or unexpected monkey argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate monkey argument: ${flag}`);
    const value = args[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  for (const required of ['--profile', '--seed', '--backend', '--endpoint', '--approval-reference']) if (!values.has(required)) throw new Error(`${required} is required for monkey`);
  const seedText = values.get('--seed')!;
  if (!/^(0|[1-9]\d*)$/.test(seedText)) throw new Error('--seed must be a canonical unsigned 32-bit integer');
  const seed = validateExploratorySeed(Number(seedText));
  const backend = values.get('--backend');
  if (backend !== 'PLAYWRIGHT' && backend !== 'GAS_OOPIF') throw new Error('--backend must be PLAYWRIGHT or GAS_OOPIF');
  const endpoint = values.get('--endpoint')!;
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new Error('--endpoint must be an absolute HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol) || parsedEndpoint.username || parsedEndpoint.password) throw new Error('--endpoint must be an HTTP(S) URL without credentials');
  const approvalReference = values.get('--approval-reference')!;
  if (!approvalReference.trim() || approvalReference.length > 512 || approvalReference.includes('\0')) throw new Error('--approval-reference must be non-empty and bounded');
  if (syntheticFailureDetails && !values.has('--failure-artifact')) throw new Error('--synthetic-failure-details requires --failure-artifact');
  return { profilePath: values.get('--profile')!, seed, backend, endpoint, approvalReference,
    timelinePath: values.get('--timeline') ?? '.agent-work/artifacts/monkey-timeline.jsonl',
    replayArtifactPath: values.get('--replay-artifact') ?? '.agent-work/artifacts/monkey-replay.json',
    ...(values.has('--failure-artifact') ? { failureArtifactPath: values.get('--failure-artifact')! } : {}),
    ...(syntheticFailureDetails ? { syntheticFailureDetails } : {}) };
}

export function resolveMonkeyArtifactPath(path: string): string {
  const full = resolve(path);
  const fromRoot = relative(resolve('.agent-work/artifacts'), full);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) throw new Error('Timeline and replay paths must be inside .agent-work/artifacts');
  return full;
}

export interface MonkeyCliDependencies {
  readProfileFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; fixtureId: string; target: ExploratoryProfile['target'] }): Promise<Pick<TestPageSession, 'backend' | 'authorization' | 'close' | 'assertTargetEnvelope'> & Partial<Pick<TestPageSession, 'captureFailureDiagnostics'>>>;
  writeTimeline(path: string, timeline: Timeline): Promise<void>;
  writeReplay(path: string, artifact: ExploratoryReplayArtifact): Promise<void>;
  writeOutput(line: string): void;
  createTimeline(): Timeline;
  now(): number;
}

const defaultMonkeyCliDependencies: MonkeyCliDependencies = {
  async readProfileFile(path) {
    const info = await stat(path);
    if (!info.isFile() || info.size > 1_048_576) throw new Error('Profile file must be a regular file no larger than 1 MiB');
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  },
  openSession: (options) => TestPageSession.open(options),
  writeOutput(line) { console.log(line); },
  createTimeline() { return new Timeline(); },
  now() { return performance.now(); },
  async writeReplay(path, artifact) {
    const full = resolveMonkeyArtifactPath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, `${JSON.stringify(artifact)}\n`, { encoding: 'utf8', flag: 'wx' });
  },
  async writeTimeline(path, timeline) {
    const full = resolveMonkeyArtifactPath(path);
    const writer = new FileJsonlTraceWriter(full);
    try { for (const event of timeline.snapshot()) await writer.write(event); }
    finally { await writer.close(); }
  }
};

/** Generates and executes a fully validated deterministic bounded profile. */
export async function runMonkeyCli(args: string[], dependencies: MonkeyCliDependencies = defaultMonkeyCliDependencies): Promise<number> {
  const options = parseMonkeyCliOptions(args);
  resolveMonkeyArtifactPath(options.timelinePath);
  resolveMonkeyArtifactPath(options.replayArtifactPath);
  const profile = parseExploratoryProfile(await dependencies.readProfileFile(options.profilePath));
  if (options.failureArtifactPath) await validateFailureArtifactDestination(options.failureArtifactPath, options.syntheticFailureDetails === true, profile.target);
  const plan: GeneratedExploratoryPlan = generateExploratoryPlan(profile, options.seed);
  const timeline = dependencies.createTimeline();
  if (options.failureArtifactPath && options.syntheticFailureDetails) await validateScreenshotDestination(options.failureArtifactPath, timeline.runId);
  const replayArtifactPath = options.replayArtifactPath === '.agent-work/artifacts/monkey-replay.json'
    ? `.agent-work/artifacts/monkey-replay-${timeline.runId}.json` : options.replayArtifactPath;
  const session = await dependencies.openSession({ endpoint: options.endpoint, backend: options.backend,
    approvalReference: options.approvalReference, fixtureId: profile.profileId, target: profile.target });
  timeline.append(timeline.create({ source: 'CORE', category: 'SESSION', type: 'SESSION_STARTED', data: { profileId: profile.profileId, backend: options.backend } }));
  let result: ExploratoryResult;
  let failureDiagnostic: FailureDiagnosticResult | undefined;
  let failureArtifactStatus: string | undefined;
  try {
    result = await runExploratoryProfile({ backend: session.backend, profile, artifact: plan, timeline,
      authorization: session.authorization, assertTargetEnvelope: () => session.assertTargetEnvelope(), now: dependencies.now });
    if (result.status === 'FAIL' && options.failureArtifactPath) {
      const failed = result.actionResults.at(-1);
      const refs = failureRefs(timeline, result.runId, failed?.stepId, result.stopReason === 'TARGET_ENVELOPE_VIOLATION');
      try {
        failureDiagnostic = session.captureFailureDiagnostics
          ? await session.captureFailureDiagnostics(failed ? profile.candidates.find((item) => item.candidateId === failed.candidateId)?.selector : undefined, options.syntheticFailureDetails === true)
          : emptyFailureDiagnostics(options.syntheticFailureDetails === true);
      } catch { failureDiagnostic = { dom: { status: 'ERROR' }, runtime: { status: 'ERROR' }, screenshot: { status: options.syntheticFailureDetails ? 'ERROR' : 'NOT_REQUESTED' } }; }
      const artifact = buildFailureArtifact({ timeline, backend: options.backend, runnerKind: 'MONKEY', profileId: profile.profileId,
        stepId: failed?.stepId, operation: failed?.operation, errorCode: failed?.errorCode, stopReason: result.stopReason,
        target: { scopeKind: profile.target.scope.kind, targetId: session.authorization.targetId, pageUrl: profile.target.pageUrl, ...(profile.target.scope.kind === 'FRAME' ? { scopeUrl: profile.target.scope.url } : {}) },
        refs, selector: failed ? profile.candidates.find((item) => item.candidateId === failed.candidateId)?.selector : undefined,
        syntheticDetails: options.syntheticFailureDetails, diagnostics: safeDiagnosticMetadata(failureDiagnostic) });
      try { await persistFailureWithScreenshot(options.failureArtifactPath, artifact, failureDiagnostic, timeline.runId); failureArtifactStatus = 'WRITTEN'; }
      catch { failureArtifactStatus = 'WRITE_ERROR'; }
    }
  } finally {
    await session.close();
    timeline.append(timeline.create({ source: 'CORE', category: 'SESSION', type: 'SESSION_ENDED', data: { profileId: profile.profileId, backend: options.backend } }));
  }
  await dependencies.writeReplay(replayArtifactPath, { kind: 'CDLD_TEST1C_REPLAY', schemaVersion: 1, ...plan,
    backend: options.backend, terminalStatus: result.status, stopReason: result.stopReason,
    generatedCount: result.generatedCount, executedCount: result.executedCount });
  await dependencies.writeTimeline(options.timelinePath, timeline);
  dependencies.writeOutput(JSON.stringify({ ...result, ...(failureArtifactStatus ? { failureArtifactStatus } : {}) }));
  return result.status === 'FAIL' ? 2 : 0;
}

export interface SmokeCliOptions {
  scenarioPath: string;
  backend: TestingBackendId;
  endpoint: string;
  approvalReference: string;
  timelinePath: string;
  failureArtifactPath?: string;
  syntheticFailureDetails?: boolean;
}

export function parseSmokeCliOptions(args: string[]): SmokeCliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--scenario', '--backend', '--endpoint', '--approval-reference', '--timeline', '--failure-artifact', '--synthetic-failure-details']);
  let syntheticFailureDetails = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--synthetic-failure-details') {
      if (syntheticFailureDetails) throw new Error('Duplicate smoke argument: --synthetic-failure-details');
      syntheticFailureDetails = true;
      continue;
    }
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
  if (syntheticFailureDetails && !values.has('--failure-artifact')) throw new Error('--synthetic-failure-details requires --failure-artifact');
  return {
    scenarioPath: values.get('--scenario')!,
    backend,
    endpoint,
    approvalReference,
    timelinePath: values.get('--timeline') ?? '.agent-work/artifacts/smoke-timeline.jsonl',
    ...(values.has('--failure-artifact') ? { failureArtifactPath: values.get('--failure-artifact')! } : {}),
    ...(syntheticFailureDetails ? { syntheticFailureDetails } : {})
  };
}

export interface SmokeCliDependencies {
  readScenarioFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; scenario: SmokeScenario }): Promise<Pick<TestPageSession, 'backend' | 'authorization' | 'close'> & Partial<Pick<TestPageSession, 'captureFailureDiagnostics'>>>;
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
  if (options.failureArtifactPath) await validateFailureArtifactDestination(options.failureArtifactPath, options.syntheticFailureDetails === true, scenario.target);
  const timeline = dependencies.createTimeline();
  if (options.failureArtifactPath && options.syntheticFailureDetails) await validateScreenshotDestination(options.failureArtifactPath, timeline.runId);
  const session = await dependencies.openSession({
    endpoint: options.endpoint, backend: options.backend, approvalReference: options.approvalReference, scenario
  });
  let result: SmokeScenarioResult | undefined;
  let failureDiagnostic: FailureDiagnosticResult | undefined;
  let failureArtifactStatus: string | undefined;
  let executionError: unknown;
  try {
    result = await runSmokeScenario({ backend: session.backend, scenario, timeline, authorization: session.authorization });
    if (result.status === 'FAIL' && options.failureArtifactPath) {
      const failed = scenario.steps.find((step) => step.stepId === result!.failedStepId);
      const stepResult = result.stepResults.find((entry) => entry.stepId === result!.failedStepId);
      const refs = failureRefs(timeline, result.runId, result.failedStepId, false);
      try { failureDiagnostic = session.captureFailureDiagnostics
        ? await session.captureFailureDiagnostics(failed?.selector, options.syntheticFailureDetails === true)
        : emptyFailureDiagnostics(options.syntheticFailureDetails === true); }
      catch { failureDiagnostic = { dom: { status: 'ERROR' }, runtime: { status: 'ERROR' }, screenshot: { status: options.syntheticFailureDetails ? 'ERROR' : 'NOT_REQUESTED' } }; }
      const artifact = buildFailureArtifact({ timeline, backend: options.backend, runnerKind: 'SMOKE', scenarioId: scenario.scenarioId,
        stepId: result.failedStepId, operation: failed?.operation, predicate: failed?.kind === 'assert' ? failed.predicate : undefined,
        errorCode: stepResult?.errorCode, target: { scopeKind: scenario.target.scope.kind, targetId: session.authorization.targetId,
          pageUrl: scenario.target.pageUrl, ...(scenario.target.scope.kind === 'FRAME' ? { scopeUrl: scenario.target.scope.url } : {}) }, refs,
        actual: failed?.kind === 'assert' ? stepResult?.value : undefined,
        expected: failed?.kind === 'assert' ? failed.expected : undefined, selector: failed?.selector,
        syntheticDetails: options.syntheticFailureDetails, diagnostics: safeDiagnosticMetadata(failureDiagnostic) });
      try { await persistFailureWithScreenshot(options.failureArtifactPath, artifact, failureDiagnostic, timeline.runId); failureArtifactStatus = 'WRITTEN'; }
      catch { failureArtifactStatus = 'WRITE_ERROR'; }
    }
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
    ...(result.failedStepId ? { failedStepId: result.failedStepId } : {}),
    ...(failureArtifactStatus ? { failureArtifactStatus } : {})
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

async function validateFailureArtifactDestination(path: string, syntheticDetails: boolean, target: SmokeScenario['target']): Promise<void> {
  const full = resolveFailureArtifactPath(path);
  if (syntheticDetails && (!isLoopbackHttpUrl(target.pageUrl) || (target.scope.kind === 'FRAME' && !isLoopbackHttpUrl(target.scope.url)))) {
    throw new Error('Synthetic failure details require a loopback PAGE and, for FRAME scope, a loopback FRAME');
  }
  try { await access(full); throw new Error('Failure artifact path already exists'); }
  catch (error) {
    if (error instanceof Error && error.message === 'Failure artifact path already exists') throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function emptyFailureDiagnostics(syntheticDetails: boolean): FailureDiagnosticResult {
  return { dom: { status: 'NOT_AVAILABLE' }, runtime: { status: 'NOT_AVAILABLE' }, screenshot: { status: syntheticDetails ? 'ERROR' : 'NOT_REQUESTED' } };
}

function failureScreenshotPath(path: string, runId: string): string {
  const full = resolveFailureArtifactPath(path);
  const safeRun = createHash('sha256').update(runId).digest('hex').slice(0, 16);
  const extension = extname(full) || '.json';
  return resolveFailureArtifactPath(`${full.slice(0, full.length - extension.length)}.${safeRun}.png`);
}

async function validateScreenshotDestination(path: string, runId: string): Promise<void> {
  try { await access(failureScreenshotPath(path, runId)); throw new Error('Failure screenshot path already exists'); }
  catch (error) {
    if (error instanceof Error && error.message === 'Failure screenshot path already exists') throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function safeDiagnosticMetadata(result: FailureDiagnosticResult | undefined): Record<string, unknown> {
  if (!result) return { status: 'ERROR' };
  const screenshot = result.screenshot;
  return {
    dom: result.dom,
    runtime: result.runtime,
    screenshot: { status: screenshot.status, ...(screenshot.byteLength !== undefined ? { byteLength: screenshot.byteLength } : {}), ...(screenshot.sha256 ? { sha256: screenshot.sha256 } : {}) }
  };
}

async function persistFailureWithScreenshot(path: string, artifact: Record<string, unknown>, diagnostics: FailureDiagnosticResult | undefined, runId: string): Promise<void> {
  const full = resolveFailureArtifactPath(path);
  const screenshot = diagnostics?.screenshot;
  if (screenshot?.status === 'CAPTURED' && screenshot.bytes) {
    const sidecarFull = failureScreenshotPath(path, runId);
    await mkdir(dirname(sidecarFull), { recursive: true });
    await writeFile(sidecarFull, screenshot.bytes, { flag: 'wx' });
    const diagnosticsValue = artifact.diagnostics && typeof artifact.diagnostics === 'object' ? artifact.diagnostics as Record<string, unknown> : {};
    diagnosticsValue.screenshot = { status: screenshot.status, byteLength: screenshot.byteLength, sha256: screenshot.sha256, sidecar: basename(sidecarFull) };
    artifact.diagnostics = diagnosticsValue;
  }
  await writeFailureArtifact(full, artifact);
}

function failureRefs(timeline: Timeline, runId: string, stepId: string | undefined, includeExploratoryTerminal: boolean): TimelineEventRef[] {
  const matching = timeline.snapshot().filter((event) => event.runId === runId);
  const refs: TimelineEventRef[] = [];
  const add = (event: TraceEvent | undefined) => { if (event && !refs.some((item) => item.eventId === event.eventId)) refs.push({ runId: event.runId, eventId: event.eventId }); };
  if (stepId) {
    for (const type of ['ASSERTION_FAILED', 'EXPLORATORY_ACTION_PLANNED', 'ACTION_STARTED', 'ACTION_COMPLETED', 'ACTION_FAILED']) {
      add(matching.find((event) => event.type === type && (event.data as Record<string, unknown> | undefined)?.stepId === stepId));
    }
  }
  if (includeExploratoryTerminal) add([...matching].reverse().find((event) => event.type === 'EXPLORATORY_RUN_FAILED'));
  return refs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
