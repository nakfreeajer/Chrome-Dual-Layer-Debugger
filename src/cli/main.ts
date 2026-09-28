import { pathToFileURL } from 'node:url';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';
import { GasAdapter, redactGasSecrets, type GasDiscoveryResult } from '../gas/GasAdapter.js';
import { mapCrossLayerIdentities } from '../core/CrossLayerMapper.js';
import { Timeline } from '../trace/Timeline.js';
import { FileJsonlTraceWriter } from '../trace/JsonlTraceWriter.js';
import { emitBrowserDiscovery, emitGasDiscovery, emitMappingEvidence, emitSessionEvent } from '../trace/DiscoveryEvents.js';

function parseEndpoint(args: string[]): string {
  const flagIndex = args.indexOf('--endpoint');
  if (flagIndex === -1) return 'http://127.0.0.1:9222';
  const endpoint = args[flagIndex + 1];
  if (!endpoint || endpoint.startsWith('--')) throw new Error('--endpoint requires a URL');
  return endpoint;
}

function parseTimelinePath(args: string[]): string {
  const flagIndex = args.indexOf('--timeline');
  if (flagIndex === -1) return '.agent-work/artifacts/timeline.jsonl';
  const path = args[flagIndex + 1];
  if (!path || path.startsWith('--')) throw new Error('--timeline requires a file path');
  return path;
}

export async function runCli(args: string[]): Promise<void> {
  if (args[0] !== 'discover') throw new Error('Usage: node dist/src/cli/main.js discover [--endpoint URL]');
  const endpoint = parseEndpoint(args);
  const timelinePath = parseTimelinePath(args);
  const discovery = new PlaywrightBrowserDiscovery(endpoint);
  const gasAdapter = new GasAdapter();
  const timeline = new Timeline();
  emitSessionEvent(timeline, 'SESSION_STARTED');
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
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
