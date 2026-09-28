import { pathToFileURL } from 'node:url';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';

function parseEndpoint(args: string[]): string {
  const flagIndex = args.indexOf('--endpoint');
  if (flagIndex === -1) return 'http://127.0.0.1:9222';
  const endpoint = args[flagIndex + 1];
  if (!endpoint || endpoint.startsWith('--')) throw new Error('--endpoint requires a URL');
  return endpoint;
}

export async function runCli(args: string[]): Promise<void> {
  if (args[0] !== 'discover') throw new Error('Usage: node dist/src/cli/main.js discover [--endpoint URL]');
  const discovery = new PlaywrightBrowserDiscovery(parseEndpoint(args));
  try {
    const result = await discovery.discover();
    console.log('Browser connected');
    console.log(`Contexts: ${result.contexts.length}`);
    for (const context of result.contexts) {
      console.log(context.contextId);
      for (const page of context.pages) {
        console.log(page.pageId);
        console.log(`  url: ${page.url}`);
        if (page.title !== undefined) console.log(`  title: ${page.title}`);
        console.log(`  mode: ${page.mode}`);
        console.log('  frames:');
        printFrames(page.frames);
        console.log(`  execution contexts observed: ${page.executionContextIds.length}`);
      }
    }
  } finally {
    await discovery.disconnect();
  }
}

function printFrames(frames: Awaited<ReturnType<PlaywrightBrowserDiscovery['discover']>>['contexts'][number]['pages'][number]['frames'], depth = 2): void {
  for (const frame of frames) {
    console.log(`${' '.repeat(depth)}${frame.frameId}: ${frame.url}${frame.name ? ` (${frame.name})` : ''}`);
    printFrames(frame.children, depth + 2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
