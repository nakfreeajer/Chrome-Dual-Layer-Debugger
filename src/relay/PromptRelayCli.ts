import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import {
  PromptArtifactStore,
  type PromptIdentityInput,
} from './PromptArtifactStore.js';
import {
  parsePromptRelayDescriptor,
  promptRelayIdentity,
  type PromptRelayDescriptorV1,
} from './PromptRelayDescriptor.js';

export interface RelayCliIO {
  cwd?: string;
  stdout?: (bytes: Buffer) => void;
  stderr?: (message: string) => void;
}

interface ParsedArguments {
  command: 'import' | 'supersede' | 'revoke' | 'resolve';
  values: Map<string, string>;
}

const ARGUMENTS: Record<ParsedArguments['command'], readonly string[]> = {
  import: ['descriptor', 'prompt-file', 'approval-reference', 'agent-work-root'],
  supersede: ['descriptor', 'prompt-file', 'approval-reference', 'agent-work-root'],
  revoke: ['descriptor', 'approval-reference', 'agent-work-root'],
  resolve: ['descriptor', 'agent-work-root'],
};

const REQUIRED: Record<ParsedArguments['command'], readonly string[]> = {
  import: ['descriptor', 'prompt-file', 'approval-reference'],
  supersede: ['descriptor', 'prompt-file', 'approval-reference'],
  revoke: ['descriptor', 'approval-reference'],
  resolve: ['descriptor'],
};

function parseArguments(argv: readonly string[]): ParsedArguments {
  const args = [...argv];
  if (args[0] === 'relay') args.shift();
  const command = args.shift();
  if (command !== 'import' && command !== 'supersede' && command !== 'revoke' && command !== 'resolve') {
    throw new Error('Expected command: import, supersede, revoke, or resolve');
  }
  const allowed = new Set(ARGUMENTS[command]);
  const values = new Map<string, string>();
  while (args.length > 0) {
    const flag = args.shift()!;
    if (!flag.startsWith('--') || flag.length <= 2) throw new Error('Unexpected positional input');
    const name = flag.slice(2);
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${flag}`);
    if (values.has(name)) throw new Error(`Duplicate argument: ${flag}`);
    const value = args.shift();
    if (value === undefined || value.startsWith('--') || value.length === 0) throw new Error(`Missing or empty value for ${flag}`);
    values.set(name, value);
  }
  for (const name of REQUIRED[command]) {
    if (!values.has(name)) throw new Error(`Missing required argument: --${name}`);
  }
  return { command, values };
}

function get(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing required argument: --${name}`);
  return value;
}

function identityOf(descriptor: PromptRelayDescriptorV1): PromptIdentityInput {
  return promptRelayIdentity(descriptor);
}

function assertSameIdentity(actual: { project: string; repository: string } & PromptIdentityInput, expected: PromptRelayDescriptorV1): void {
  if (actual.project !== expected.project || actual.repository !== expected.repository ||
      actual.milestoneId !== expected.milestoneId || actual.promptSha256 !== expected.promptSha256 ||
      actual.promptByteLength !== expected.promptByteLength) {
    throw new Error('Verified prompt identity does not match descriptor');
  }
}

function assertPromptText(bytes: Buffer): void {
  if (bytes.length === 0) throw new Error('Prompt file must not be empty');
  if (bytes.includes(0)) throw new Error('Prompt file must not contain NUL bytes');
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Prompt file must be valid UTF-8');
  }
}

function assertBytesMatch(bytes: Buffer, descriptor: PromptRelayDescriptorV1): void {
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== descriptor.promptSha256) throw new Error('Prompt file SHA-256 does not match descriptor');
  if (bytes.length !== descriptor.promptByteLength) throw new Error('Prompt file byte length does not match descriptor');
}

function storeFor(values: Map<string, string>, cwd: string): PromptArtifactStore {
  const supplied = values.get('agent-work-root');
  const root = supplied === undefined ? path.resolve(cwd, '.agent-work') : path.resolve(cwd, supplied);
  return new PromptArtifactStore({ agentWorkRoot: root });
}

async function execute(parsed: ParsedArguments, cwd: string, stdout: (bytes: Buffer) => void): Promise<void> {
  const { command, values } = parsed;
  const descriptorToken = get(values, 'descriptor');
  const descriptor = parsePromptRelayDescriptor(descriptorToken);
  const identity = identityOf(descriptor);
  const store = storeFor(values, cwd);

  if (command === 'import' || command === 'supersede') {
    const promptFile = path.resolve(cwd, get(values, 'prompt-file'));
    const bytes = await readFile(promptFile);
    assertPromptText(bytes);
    assertBytesMatch(bytes, descriptor);
    const approvalReference = get(values, 'approval-reference');

    if (command === 'import') {
      const staged = await store.stagePrompt({ milestoneId: descriptor.milestoneId, promptBytes: bytes });
      assertSameIdentity(staged.identity, descriptor);
      await store.authorizePrompt(staged.identity, approvalReference);
      const loaded = await store.loadVerifiedAuthorizedPrompt();
      assertSameIdentity(loaded.identity, descriptor);
      if (!loaded.promptBytes.equals(bytes)) throw new Error('Verified prompt bytes do not match imported file');
      stdout(Buffer.from(`${descriptorToken}\n`, 'ascii'));
      return;
    }

    const current = await store.loadVerifiedAuthorizedPrompt();
    if (current.identity.milestoneId !== descriptor.milestoneId) {
      throw new Error('Supersession must keep the current milestoneId');
    }
    if (current.identity.project === descriptor.project && current.identity.repository === descriptor.repository &&
        current.identity.milestoneId === descriptor.milestoneId && current.identity.promptSha256 === descriptor.promptSha256 &&
        current.identity.promptByteLength === descriptor.promptByteLength) {
      throw new Error('Supersession descriptor must identify a different prompt');
    }
    const loaded = await store.supersedeCurrent({ promptBytes: bytes, approvalReference });
    assertSameIdentity(loaded.identity, descriptor);
    if (!loaded.promptBytes.equals(bytes)) throw new Error('Verified supersession bytes do not match prompt file');
    stdout(Buffer.from(`${descriptorToken}\n`, 'ascii'));
    return;
  }

  if (command === 'revoke') {
    const current = await store.loadVerifiedAuthorizedPrompt();
    assertSameIdentity(current.identity, descriptor);
    await store.revokeCurrent(get(values, 'approval-reference'));
    return;
  }

  const loaded = await store.loadVerifiedAuthorizedPrompt();
  assertSameIdentity(loaded.identity, descriptor);
  assertBytesMatch(loaded.promptBytes, descriptor);
  assertPromptText(loaded.promptBytes);
  // All validation completes before the exact original Buffer is emitted.
  stdout(loaded.promptBytes);
}

export async function runPromptRelayCli(argv: readonly string[], io: RelayCliIO = {}): Promise<number> {
  const cwd = path.resolve(io.cwd ?? process.cwd());
  const stdout = io.stdout ?? ((bytes: Buffer) => { process.stdout.write(bytes); });
  const stderr = io.stderr ?? ((message: string) => { process.stderr.write(`${message}\n`); });
  try {
    const parsed = parseArguments(argv);
    await execute(parsed, cwd, stdout);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown relay error';
    stderr(`relay: ${message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPromptRelayCli(process.argv.slice(2));
}
