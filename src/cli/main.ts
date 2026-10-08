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
import type { SmokeScenario, SmokeScenarioResult, SmokeTarget } from '../testing/SmokeScenario.js';
import type { TestingBackendId } from '../testing/ActionContract.js';
import { TestPageSession } from '../testing/TestPageSession.js';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { parseExploratoryProfile } from '../testing/ExploratoryProfileParser.js';
import { generateExploratoryPlan, validateExploratorySeed } from '../testing/ExploratoryGenerator.js';
import { runExploratoryProfile } from '../testing/ExploratoryRunner.js';
import type { FixtureLifecycleJournal, FixtureLifecycleSummary, SyntheticFixtureDriver } from '../testing/FixtureLifecycle.js';
import type { ExploratoryProfile, ExploratoryReplayArtifact, GeneratedExploratoryPlan, ExploratoryResult } from '../testing/ExploratoryProfile.js';
import { buildFailureArtifact, resolveFailureArtifactPath, writeFailureArtifact, type TimelineEventRef } from '../testing/FailureArtifact.js';
import { isLoopbackHttpUrl, type FailureDiagnosticResult } from '../testing/FailureDiagnostics.js';
import { createHash, randomUUID } from 'node:crypto';
import type { TraceEvent } from '../trace/TraceEvent.js';
import { parseRegressionSuite, regressionSuiteSha256 } from '../testing/RegressionSuiteParser.js';
import { compareRegressionSuiteResults, regressionOutcomeMatches, safeRegressionErrorCode, validateRegressionSuiteResultArtifact, type RegressionSuite, type RegressionSuiteCase, type RegressionSuiteResultArtifact } from '../testing/RegressionSuite.js';
import { normalizeRegressionOutcome, runRegressionSuite } from '../testing/RegressionSuiteRunner.js';
import { validateTestAuthorization } from '../testing/ActionContract.js';
import type { ActionBackend } from '../testing/ActionContract.js';

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
  if (args[0] === 'suite') return runRegressionSuiteCli(args.slice(1));
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
  fixtureLifecycle?: true;
}

export function parseMonkeyCliOptions(args: string[]): MonkeyCliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--profile', '--seed', '--backend', '--endpoint', '--approval-reference', '--timeline', '--replay-artifact', '--failure-artifact', '--synthetic-failure-details', '--fixture-lifecycle']);
  let syntheticFailureDetails = false;
  let fixtureLifecycle = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--synthetic-failure-details') {
      if (syntheticFailureDetails) throw new Error('Duplicate monkey argument: --synthetic-failure-details');
      syntheticFailureDetails = true;
      continue;
    }
    if (flag === '--fixture-lifecycle') {
      if (fixtureLifecycle) throw new Error('Duplicate monkey argument: --fixture-lifecycle');
      fixtureLifecycle = true;
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
    ...(syntheticFailureDetails ? { syntheticFailureDetails } : {}), ...(fixtureLifecycle ? { fixtureLifecycle: true as const } : {}) };
}

export function resolveMonkeyArtifactPath(path: string): string {
  const full = resolve(path);
  const fromRoot = relative(resolve('.agent-work/artifacts'), full);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) throw new Error('Timeline and replay paths must be inside .agent-work/artifacts');
  return full;
}

export interface MonkeyCliDependencies {
  readProfileFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; fixtureId: string; target: ExploratoryProfile['target']; fixtureLifecycle?: { driver: SyntheticFixtureDriver; runId: string; journal?: FixtureLifecycleJournal } }): Promise<Pick<TestPageSession, 'backend' | 'authorization' | 'close' | 'assertTargetEnvelope'> & Partial<Pick<TestPageSession, 'captureFailureDiagnostics' | 'beginFixtureRun' | 'finishFixtureRun'>>>;
  fixtureDriver?: SyntheticFixtureDriver;
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
  if (options.fixtureLifecycle && !dependencies.fixtureDriver) throw new Error('FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE');
  if (options.failureArtifactPath) await validateFailureArtifactDestination(options.failureArtifactPath, options.syntheticFailureDetails === true, profile.target);
  const plan: GeneratedExploratoryPlan = generateExploratoryPlan(profile, options.seed);
  const timeline = dependencies.createTimeline();
  if (options.failureArtifactPath && options.syntheticFailureDetails) await validateScreenshotDestination(options.failureArtifactPath, timeline.runId);
  const replayArtifactPath = options.replayArtifactPath === '.agent-work/artifacts/monkey-replay.json'
    ? `.agent-work/artifacts/monkey-replay-${timeline.runId}.json` : options.replayArtifactPath;
  const session = await dependencies.openSession({ endpoint: options.endpoint, backend: options.backend,
    approvalReference: options.approvalReference, fixtureId: profile.profileId, target: profile.target,
    ...(options.fixtureLifecycle ? { fixtureLifecycle: { driver: dependencies.fixtureDriver!, runId: timeline.runId } } : {}) });
  timeline.append(timeline.create({ source: 'CORE', category: 'SESSION', type: 'SESSION_STARTED', data: { profileId: profile.profileId, backend: options.backend } }));
  let result: ExploratoryResult | undefined;
  let failureDiagnostic: FailureDiagnosticResult | undefined;
  let failureArtifactStatus: string | undefined;
  let fixtureLifecycleSummary: FixtureLifecycleSummary | undefined;
  let fixtureRunStarted = false;
  let fixtureRunFinalized = false;
  let fixtureLifecycleUnknown = false;
  let executionError: unknown;
  try {
    if (options.fixtureLifecycle) requireFixtureRunMethods(session);
    if (options.fixtureLifecycle) {
      try { await session.beginFixtureRun!(); fixtureRunStarted = true; }
      catch (error) { fixtureLifecycleUnknown = true; throw error; }
    }
    result = await runExploratoryProfile({ backend: session.backend, profile, artifact: plan, timeline,
      authorization: session.authorization, assertTargetEnvelope: () => session.assertTargetEnvelope(), now: dependencies.now });
    if (fixtureRunStarted) {
      fixtureRunFinalized = true;
      try { await session.finishFixtureRun!(result.status === 'FAIL' ? 'FAIL' : 'PASS'); }
      catch (error) { fixtureLifecycleUnknown = true; throw error; }
    }
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
  } catch (error) {
    executionError = error;
    if (options.fixtureLifecycle && error instanceof Error && error.message === 'FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE') fixtureLifecycleUnknown = true;
  } finally {
    if (fixtureRunStarted && !fixtureRunFinalized) {
      fixtureRunFinalized = true;
      try { await session.finishFixtureRun!('UNKNOWN'); } catch { fixtureLifecycleUnknown = true; }
    }
    try {
      const closeResult = await session.close();
      if (closeResult) fixtureLifecycleSummary = closeResult;
    } catch (error) {
      if (!executionError) executionError = error;
      if (options.fixtureLifecycle) { fixtureLifecycleSummary = undefined; fixtureLifecycleUnknown = true; }
    }
    if (fixtureLifecycleUnknown) fixtureLifecycleSummary = unknownFixtureSummary(fixtureLifecycleSummary,
      options.fixtureLifecycle ? { runId: timeline.runId, fixtureId: profile.profileId, driverId: dependencies.fixtureDriver!.driverId } : undefined);
    timeline.append(timeline.create({ source: 'CORE', category: 'SESSION', type: 'SESSION_ENDED', data: { profileId: profile.profileId, backend: options.backend } }));
  }
  if (executionError) throw attachFixtureSummary(executionError, options.fixtureLifecycle ? fixtureLifecycleSummary : undefined);
  if (!result) throw new Error('Exploratory runner produced no result');
  await dependencies.writeReplay(replayArtifactPath, { kind: 'CDLD_TEST1C_REPLAY', schemaVersion: 1, ...plan,
    backend: options.backend, terminalStatus: result.status, stopReason: result.stopReason,
    generatedCount: result.generatedCount, executedCount: result.executedCount });
  await dependencies.writeTimeline(options.timelinePath, timeline);
  const cleanupVerified = !options.fixtureLifecycle || fixtureLifecycleSummary?.overallStatus === 'PASS';
  const finalStatus = cleanupVerified ? result.status : 'FAIL';
  dependencies.writeOutput(JSON.stringify({ ...result, status: finalStatus,
    ...(options.fixtureLifecycle ? { testStatus: result.status, fixtureLifecycle: fixtureLifecycleSummary ?? { overallStatus: 'UNKNOWN' } } : {}),
    ...(failureArtifactStatus ? { failureArtifactStatus } : {}) }));
  return result.status === 'FAIL' || !cleanupVerified ? 2 : 0;
}

export interface SmokeCliOptions {
  scenarioPath: string;
  backend: TestingBackendId;
  endpoint: string;
  approvalReference: string;
  timelinePath: string;
  failureArtifactPath?: string;
  syntheticFailureDetails?: boolean;
  fixtureLifecycle?: true;
}

export function parseSmokeCliOptions(args: string[]): SmokeCliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--scenario', '--backend', '--endpoint', '--approval-reference', '--timeline', '--failure-artifact', '--synthetic-failure-details', '--fixture-lifecycle']);
  let syntheticFailureDetails = false;
  let fixtureLifecycle = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--synthetic-failure-details') {
      if (syntheticFailureDetails) throw new Error('Duplicate smoke argument: --synthetic-failure-details');
      syntheticFailureDetails = true;
      continue;
    }
    if (flag === '--fixture-lifecycle') {
      if (fixtureLifecycle) throw new Error('Duplicate smoke argument: --fixture-lifecycle');
      fixtureLifecycle = true;
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
    ...(syntheticFailureDetails ? { syntheticFailureDetails } : {}), ...(fixtureLifecycle ? { fixtureLifecycle: true as const } : {})
  };
}

export interface SmokeCliDependencies {
  readScenarioFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; scenario: SmokeScenario; fixtureLifecycle?: { driver: SyntheticFixtureDriver; runId: string; journal?: FixtureLifecycleJournal } }): Promise<Pick<TestPageSession, 'backend' | 'authorization' | 'close'> & Partial<Pick<TestPageSession, 'captureFailureDiagnostics' | 'beginFixtureRun' | 'finishFixtureRun'>>>;
  fixtureDriver?: SyntheticFixtureDriver;
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
  if (options.fixtureLifecycle && !dependencies.fixtureDriver) throw new Error('FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE');
  if (options.failureArtifactPath) await validateFailureArtifactDestination(options.failureArtifactPath, options.syntheticFailureDetails === true, scenario.target);
  const timeline = dependencies.createTimeline();
  if (options.failureArtifactPath && options.syntheticFailureDetails) await validateScreenshotDestination(options.failureArtifactPath, timeline.runId);
  const session = await dependencies.openSession({
    endpoint: options.endpoint, backend: options.backend, approvalReference: options.approvalReference, scenario,
    ...(options.fixtureLifecycle ? { fixtureLifecycle: { driver: dependencies.fixtureDriver!, runId: timeline.runId } } : {})
  });
  let result: SmokeScenarioResult | undefined;
  let failureDiagnostic: FailureDiagnosticResult | undefined;
  let failureArtifactStatus: string | undefined;
  let fixtureLifecycleSummary: FixtureLifecycleSummary | undefined;
  let executionError: unknown;
  let fixtureRunStarted = false;
  let fixtureRunFinalized = false;
  let fixtureLifecycleUnknown = false;
  try {
    if (options.fixtureLifecycle) requireFixtureRunMethods(session);
    if (options.fixtureLifecycle) {
      try { await session.beginFixtureRun!(); fixtureRunStarted = true; }
      catch (error) { fixtureLifecycleUnknown = true; throw error; }
    }
    result = await runSmokeScenario({ backend: session.backend, scenario, timeline, authorization: session.authorization });
    if (fixtureRunStarted) {
      fixtureRunFinalized = true;
      try { await session.finishFixtureRun!(result.status === 'PASS' ? 'PASS' : 'FAIL'); }
      catch (error) { fixtureLifecycleUnknown = true; throw error; }
    }
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
    if (options.fixtureLifecycle && error instanceof Error && error.message === 'FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE') fixtureLifecycleUnknown = true;
  } finally {
    if (fixtureRunStarted && !fixtureRunFinalized) {
      fixtureRunFinalized = true;
      try { await session.finishFixtureRun!('UNKNOWN'); } catch { fixtureLifecycleUnknown = true; }
    }
    try {
      const closeResult = await session.close();
      if (closeResult) fixtureLifecycleSummary = closeResult;
    } catch (error) {
      executionError ??= error;
      if (options.fixtureLifecycle) { fixtureLifecycleSummary = undefined; fixtureLifecycleUnknown = true; }
    }
    if (fixtureLifecycleUnknown) fixtureLifecycleSummary = unknownFixtureSummary(fixtureLifecycleSummary,
      options.fixtureLifecycle ? { runId: timeline.runId, fixtureId: scenario.scenarioId, driverId: dependencies.fixtureDriver!.driverId } : undefined);
  }
  if (executionError) throw attachFixtureSummary(executionError, options.fixtureLifecycle ? fixtureLifecycleSummary : undefined);
  if (!result) throw new Error('Smoke runner produced no result');
  await dependencies.writeTimeline(options.timelinePath, timeline);
  const output = {
    scenarioId: result.scenarioId,
    backend: result.backend,
    status: (!options.fixtureLifecycle || fixtureLifecycleSummary?.overallStatus === 'PASS') ? result.status : 'FAIL',
    runId: result.runId,
    stepResults: result.stepResults.map((step) => ({ stepId: step.stepId, kind: step.kind, operation: step.operation, ok: step.ok, ...(step.errorCode ? { errorCode: step.errorCode } : {}) })),
    ...(result.failedStepId ? { failedStepId: result.failedStepId } : {}),
    ...(options.fixtureLifecycle ? { testStatus: result.status, fixtureLifecycle: fixtureLifecycleSummary ?? { overallStatus: 'UNKNOWN' } } : {}),
    ...(failureArtifactStatus ? { failureArtifactStatus } : {})
  };
  dependencies.writeOutput(JSON.stringify(output));
  return result.status === 'PASS' && (!options.fixtureLifecycle || fixtureLifecycleSummary?.overallStatus === 'PASS') ? 0 : 2;
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

function requireFixtureRunMethods(session: { beginFixtureRun?: () => Promise<void>; finishFixtureRun?: (outcome: 'PASS' | 'FAIL' | 'UNKNOWN') => Promise<void> }): asserts session is { beginFixtureRun: () => Promise<void>; finishFixtureRun: (outcome: 'PASS' | 'FAIL' | 'UNKNOWN') => Promise<void> } {
  if (typeof session.beginFixtureRun !== 'function' || typeof session.finishFixtureRun !== 'function') {
    throw new Error('FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE');
  }
}

function unknownFixtureSummary(summary: FixtureLifecycleSummary | undefined, identity?: { runId: string; fixtureId: string; driverId: string }): FixtureLifecycleSummary | undefined {
  if (summary) return { ...summary, cleanupVerificationStatus: 'UNKNOWN', overallStatus: 'UNKNOWN' };
  if (!identity) return undefined;
  return { schemaVersion: 1, ...identity, setupStatus: 'UNKNOWN', ownershipStatus: 'UNKNOWN', resetStatus: 'UNKNOWN',
    resetVerificationStatus: 'UNKNOWN', targetBindingStatus: 'UNKNOWN', runStatus: 'UNKNOWN', browserResourceClosureStatus: 'UNKNOWN',
    teardownStatus: 'UNKNOWN', cleanupVerificationStatus: 'UNKNOWN', overallStatus: 'UNKNOWN' };
}

function attachFixtureSummary(error: unknown, summary: FixtureLifecycleSummary | undefined): unknown {
  if (!summary) return error;
  const wrapped = error instanceof Error ? error : new Error('Fixture lifecycle execution failed', { cause: error });
  (wrapped as Error & { fixtureLifecycle?: FixtureLifecycleSummary }).fixtureLifecycle = summary;
  return wrapped;
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

const REGRESSION_SUITE_MAX_BYTES = 256 * 1024;
const REGRESSION_RESULT_MAX_BYTES = 256 * 1024;

export type RegressionSuiteCliOptions =
  | { command: 'run'; suitePath: string; backend: TestingBackendId; endpoint: string; approvalReference: string; resultPath: string; fixtureLifecycle: boolean }
  | { command: 'compare'; suitePath: string; leftResultPath: string; rightResultPath: string };

export function parseRegressionSuiteCliOptions(args: string[]): RegressionSuiteCliOptions {
  const command = args[0];
  if (command !== 'run' && command !== 'compare') throw new Error('Usage: suite run --suite FILE --backend PLAYWRIGHT|GAS_OOPIF --endpoint URL --approval-reference TEXT [--result-artifact PATH] [--fixture-lifecycle] | suite compare --suite FILE --left-result PATH --right-result PATH');
  const rest = args.slice(1);
  const values = new Map<string, string>();
  let fixtureLifecycle = false;
  const allowed = command === 'run'
    ? new Set(['--suite', '--backend', '--endpoint', '--approval-reference', '--result-artifact', '--fixture-lifecycle'])
    : new Set(['--suite', '--left-result', '--right-result']);
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--fixture-lifecycle' && command === 'run') {
      if (fixtureLifecycle) throw new Error('Duplicate suite argument: --fixture-lifecycle');
      fixtureLifecycle = true;
      continue;
    }
    if (!allowed.has(flag)) throw new Error(`Unknown or unexpected suite argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate suite argument: ${flag}`);
    const value = rest[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  const required = command === 'run' ? ['--suite', '--backend', '--endpoint', '--approval-reference'] : ['--suite', '--left-result', '--right-result'];
  for (const key of required) if (!values.has(key)) throw new Error(`${key} is required for suite ${command}`);
  if (command === 'compare') return { command, suitePath: values.get('--suite')!, leftResultPath: values.get('--left-result')!, rightResultPath: values.get('--right-result')! };
  const backend = values.get('--backend');
  if (backend !== 'PLAYWRIGHT' && backend !== 'GAS_OOPIF') throw new Error('--backend must be PLAYWRIGHT or GAS_OOPIF');
  const endpoint = values.get('--endpoint')!;
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new Error('--endpoint must be an absolute HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol) || parsedEndpoint.username || parsedEndpoint.password) throw new Error('--endpoint must be an HTTP(S) URL without credentials');
  const approvalReference = values.get('--approval-reference')!;
  if (!approvalReference.trim() || approvalReference.length > 512 || approvalReference.includes('\0')) throw new Error('--approval-reference must be non-empty and bounded');
  return { command, suitePath: values.get('--suite')!, backend, endpoint, approvalReference,
    resultPath: values.get('--result-artifact') ?? `.agent-work/artifacts/test1f-suite-${randomUUID()}.json`, fixtureLifecycle };
}

export function resolveRegressionSuiteArtifactPath(path: string): string {
  const full = resolveFailureArtifactPath(path);
  const fromRoot = relative(resolve('.agent-work/artifacts'), full);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) throw new Error('Regression suite artifacts must remain inside .agent-work/artifacts');
  return full;
}

async function readBoundedJson(path: string, maximumBytes: number, label: string): Promise<unknown> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1 || details.size > maximumBytes) throw new Error(`${label} size is invalid`);
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function writeBoundedJsonNoClobber(path: string, value: unknown, maximumBytes: number): Promise<void> {
  const full = resolveRegressionSuiteArtifactPath(path);
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  if (bytes.length < 1 || bytes.length > maximumBytes) throw new Error('Regression suite artifact size is invalid');
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: 'wx' });
}

function regressionTarget(testCase: RegressionSuiteCase) {
  return testCase.kind === 'SMOKE' ? testCase.scenario.target : testCase.profile.target;
}

export interface RegressionSuiteCliDependencies {
  readJsonFile(path: string): Promise<unknown>;
  openSession(options: { endpoint: string; backend: TestingBackendId; approvalReference: string; scenario: { scenarioId: string; target: SmokeTarget }; fixtureId: string; fixtureLifecycle?: { driver: SyntheticFixtureDriver; runId: string } }): Promise<TestPageSession>;
  fixtureDriver?: SyntheticFixtureDriver;
  createTimeline(): Timeline;
  writeTimeline(timeline: Timeline): Promise<void>;
  writeResultArtifact(path: string, artifact: RegressionSuiteResultArtifact): Promise<void>;
  readResultArtifact(path: string): Promise<unknown>;
  writeOutput(line: string): void;
}

const defaultRegressionSuiteCliDependencies: RegressionSuiteCliDependencies = {
  async readJsonFile(path) { return readBoundedJson(path, REGRESSION_SUITE_MAX_BYTES, 'Regression suite'); },
  openSession(options) { return TestPageSession.open(options); },
  createTimeline() { return new Timeline(); },
  writeOutput(line) { console.log(line); },
  async writeTimeline(timeline) {
    const writer = new FileJsonlTraceWriter(`.agent-work/artifacts/test1f-suite-${timeline.runId}.jsonl`);
    try { for (const event of timeline.snapshot()) await writer.write(event); }
    finally { await writer.close(); }
  },
  writeResultArtifact(path, artifact) { return writeBoundedJsonNoClobber(path, artifact, REGRESSION_RESULT_MAX_BYTES); },
  async readResultArtifact(path) { return readBoundedJson(resolveRegressionSuiteArtifactPath(path), REGRESSION_RESULT_MAX_BYTES, 'Regression result'); }
};

function caseStepCount(testCase: RegressionSuiteCase): number {
  return testCase.kind === 'SMOKE' ? testCase.scenario.steps.length : testCase.expected.steps.length;
}

function syntheticSetupFailure(testCase: RegressionSuiteCase, code: string) {
  const steps = testCase.kind === 'SMOKE'
    ? testCase.scenario.steps.map((step) => ({ stepId: step.stepId, operation: step.operation, state: 'NOT_RUN' as const }))
    : testCase.expected.steps.map((step) => ({ stepId: step.stepId, operation: step.operation, candidateId: step.candidateId, state: 'NOT_RUN' as const }));
  return { status: 'FAIL' as const, stopReason: code, generatedCount: caseStepCount(testCase), executedCount: 0, steps };
}

function lifecycleStatus(summary: FixtureLifecycleSummary | undefined, requested: boolean): 'NOT_REQUESTED' | 'VERIFIED' | 'FAILED' | 'UNKNOWN' {
  if (!requested) return 'NOT_REQUESTED';
  if (!summary) return 'UNKNOWN';
  const cleanupEvidence = [summary.setupStatus, summary.ownershipStatus, summary.resetStatus, summary.resetVerificationStatus,
    summary.targetBindingStatus, summary.browserResourceClosureStatus, summary.teardownStatus, summary.cleanupVerificationStatus];
  if (cleanupEvidence.includes('FAILED')) return 'FAILED';
  return cleanupEvidence.every((status) => status === 'VERIFIED') ? 'VERIFIED' : 'UNKNOWN';
}

export async function runRegressionSuiteCli(args: string[], dependencies: RegressionSuiteCliDependencies = defaultRegressionSuiteCliDependencies): Promise<number> {
  const options = parseRegressionSuiteCliOptions(args);
  const parsed = parseRegressionSuite(await dependencies.readJsonFile(options.suitePath));
  if (options.command === 'compare') {
    const leftPath = resolveRegressionSuiteArtifactPath(options.leftResultPath);
    const rightPath = resolveRegressionSuiteArtifactPath(options.rightResultPath);
    const comparison = compareRegressionSuiteResults(parsed, await dependencies.readResultArtifact(leftPath), await dependencies.readResultArtifact(rightPath));
    dependencies.writeOutput(JSON.stringify(comparison));
    return comparison.status === 'PASS' ? 0 : 2;
  }
  if (!parsed.eligibleBackends.includes(options.backend)) throw new Error('BACKEND_NOT_SUITE_ELIGIBLE');
  const resultPath = resolveRegressionSuiteArtifactPath(options.resultPath);
  if (options.fixtureLifecycle) {
    if (!dependencies.fixtureDriver) throw new Error('FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE');
    if (options.backend !== 'PLAYWRIGHT' || parsed.cases.some((testCase) => regressionTarget(testCase).scope.kind !== 'PAGE')) throw new Error('FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED');
  }
  const artifact = await runRegressionSuite({ suite: parsed, backend: options.backend, fixtureLifecycleRequested: options.fixtureLifecycle, async executeCase(testCase, backend) {
    const timeline = dependencies.createTimeline();
    emitSessionEvent(timeline, 'SESSION_STARTED');
    const target = regressionTarget(testCase);
    const scenarioId = testCase.kind === 'SMOKE' ? testCase.scenario.scenarioId : testCase.profile.profileId;
    let session: TestPageSession | undefined;
    let fixtureRunStarted = false;
    let fixtureRunFinalized = false;
    let fixtureSummary: FixtureLifecycleSummary | undefined;
    let actual;
    let executionCode: string | undefined;
    try {
      session = await dependencies.openSession({ endpoint: options.endpoint, backend, approvalReference: options.approvalReference,
        scenario: { scenarioId, target }, fixtureId: scenarioId,
        ...(options.fixtureLifecycle ? { fixtureLifecycle: { driver: dependencies.fixtureDriver!, runId: timeline.runId } } : {}) });
      validateTestAuthorization(backend, session.backend.targetId, session.authorization);
      if (session.backend.backend !== backend || session.authorization.fixtureId !== scenarioId) throw new Error('TARGET_MISMATCH');
      if (options.fixtureLifecycle) {
        if (!session.beginFixtureRun || !session.finishFixtureRun) throw new Error('FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE');
        await session.beginFixtureRun();
        fixtureRunStarted = true;
      }
      await session.assertTargetEnvelope();
      if (testCase.kind === 'SMOKE') {
        const result = await runSmokeScenario({ backend: session.backend, scenario: testCase.scenario, timeline, authorization: session.authorization });
        actual = normalizeRegressionOutcome(testCase, result);
      } else {
        const plan = generateExploratoryPlan(testCase.profile, testCase.seed);
        const result = await runExploratoryProfile({ backend: session.backend, profile: testCase.profile, artifact: plan, timeline,
          authorization: session.authorization, assertTargetEnvelope: () => session!.assertTargetEnvelope() });
        actual = normalizeRegressionOutcome(testCase, result);
      }
      await session.assertTargetEnvelope();
      if (fixtureRunStarted) {
        fixtureRunFinalized = true;
        await session.finishFixtureRun!(regressionOutcomeMatches(testCase.expected, actual) ? 'PASS' : 'FAIL');
      }
    } catch (error) {
      executionCode = error instanceof Error ? safeRegressionErrorCode(error.message) ?? (error.message === 'FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE' ? undefined : 'RUNNER_FAILED') : 'RUNNER_FAILED';
      actual = syntheticSetupFailure(testCase, executionCode ?? 'RUNNER_FAILED');
    } finally {
      if (fixtureRunStarted && !fixtureRunFinalized && session?.finishFixtureRun) {
        fixtureRunFinalized = true;
        try { await session.finishFixtureRun('UNKNOWN'); } catch { executionCode ??= 'RUNNER_FAILED'; }
      }
      if (session) {
        try { const closed = await session.close(); if (closed) fixtureSummary = closed; }
        catch { executionCode ??= 'RUNNER_FAILED'; }
      }
      emitSessionEvent(timeline, 'SESSION_ENDED');
      await dependencies.writeTimeline(timeline);
    }
    const cleanup = lifecycleStatus(fixtureSummary, options.fixtureLifecycle);
    if (executionCode && actual.status !== 'FAIL') actual = syntheticSetupFailure(testCase, executionCode);
    return { runId: timeline.runId, outcome: actual, fixtureCleanupStatus: cleanup };
  } });
  const checked = validateRegressionSuiteResultArtifact(artifact, parsed);
  await dependencies.writeResultArtifact(resultPath, checked);
  dependencies.writeOutput(JSON.stringify({ suiteId: checked.suiteId, suiteSha256: checked.suiteSha256, backend: checked.backend,
    suiteStatus: checked.suiteStatus, comparableFixtureState: checked.comparableFixtureState,
    cases: checked.caseResults.map(({ caseId, runId, comparisonStatus, errorCode, fixtureCleanupStatus }) => ({ caseId, ...(runId ? { runId } : {}), comparisonStatus, ...(errorCode ? { errorCode } : {}), fixtureCleanupStatus })) }));
  return checked.suiteStatus === 'PASS' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
