import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { PromptArtifactStore } from '../../src/relay/PromptArtifactStore.js';
import { formatPromptRelayDescriptor } from '../../src/relay/PromptRelayDescriptor.js';
import { runPromptRelayCli } from '../../src/relay/PromptRelayCli.js';

const MILESTONE = 'RELAY-1B-SYNTHETIC';
const APPROVAL = 'synthetic approval reference';
const CLI_PATH = path.resolve('dist/src/relay/PromptRelayCli.js');

function descriptorFor(bytes: Buffer, milestoneId = MILESTONE): string {
  return formatPromptRelayDescriptor({
    milestoneId,
    promptSha256: createHash('sha256').update(bytes).digest('hex'),
    promptByteLength: bytes.length,
  });
}

async function withRoot(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'cdld-relay-cli-'));
  try { await run(cwd); } finally { await rm(cwd, { recursive: true, force: true }); }
}

async function writePrompt(cwd: string, bytes: Buffer, name = 'architect-prompt.md'): Promise<string> {
  const file = path.join(cwd, name);
  await writeFile(file, bytes);
  return file;
}

interface Capture { code: number; stdout: Buffer; stderr: string; }

async function invoke(cwd: string, args: string[]): Promise<Capture> {
  const out: Buffer[] = [];
  const errors: string[] = [];
  const code = await runPromptRelayCli(args, {
    cwd,
    stdout: (bytes) => out.push(Buffer.from(bytes)),
    stderr: (message) => errors.push(message),
  });
  return { code, stdout: Buffer.concat(out), stderr: errors.join('\n') };
}

function commonImportArgs(token: string, file: string): string[] {
  return ['import', '--descriptor', token, '--prompt-file', file, '--approval-reference', APPROVAL];
}

test('imports matching Architect descriptor and emits only that descriptor plus LF', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('synthetic architect prompt\n');
    const token = descriptorFor(bytes);
    const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(token, file));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.stdout, Buffer.from(`${token}\n`, 'ascii'));
    const loaded = await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt();
    assert.equal(loaded.identity.promptSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(loaded.identity.promptByteLength, bytes.length);
    assert.deepEqual(loaded.promptBytes, bytes);
  });
});

test('imports exact LF bytes unchanged', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('line one\nline two\n'); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt()).promptBytes, bytes);
  });
});

test('imports exact CRLF bytes unchanged', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('line one\r\nline two\r\n'); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt()).promptBytes, bytes);
  });
});

test('imports UTF-8 Unicode bytes without normalization', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('cafe\u0301 \u6f22\u5b57 \ud83e\udded\n', 'utf8'); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt()).promptBytes, bytes);
  });
});

test('preserves BOM as part of exact identity and bytes', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('prompt\n')]);
    const file = await writePrompt(cwd, bytes); const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.equal(result.code, 0, result.stderr);
    const loaded = await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt();
    assert.deepEqual(loaded.promptBytes, bytes); assert.equal(loaded.identity.promptByteLength, bytes.length);
  });
});

test('trailing newline changes descriptor identity and both imports retain their distinct bytes', async () => {
  await withRoot(async (cwd) => {
    const a = Buffer.from('prompt'); const b = Buffer.from('prompt\n');
    assert.notEqual(descriptorFor(a), descriptorFor(b));
    const firstFile = await writePrompt(cwd, a, 'a.md');
    const first = await invoke(cwd, commonImportArgs(descriptorFor(a), firstFile)); assert.equal(first.code, 0, first.stderr);
    const secondFile = await writePrompt(cwd, b, 'b.md');
    const second = await invoke(cwd, ['supersede', '--descriptor', descriptorFor(b), '--prompt-file', secondFile, '--approval-reference', APPROVAL]);
    assert.equal(second.code, 0, second.stderr);
    assert.deepEqual(second.stdout, Buffer.from(`${descriptorFor(b)}\n`, 'ascii'));
    assert.deepEqual((await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt()).promptBytes, b);
  });
});

test('rejects malformed UTF-8 before staging any prompt artifact', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from([0x61, 0xc3, 0x28]); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0); assert.match(result.stderr, /valid UTF-8/);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('rejects embedded NUL before staging', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from([0x61, 0, 0x62]); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(bytes), file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0); assert.match(result.stderr, /NUL/);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('rejects empty prompt file and zero-length descriptor', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.alloc(0); const file = await writePrompt(cwd, bytes);
    const token = 'CDLD-PROMPT-V1.' + Buffer.from(JSON.stringify({ schemaVersion: 1, project: 'Chrome-Dual-Layer-Debugger', repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger', milestoneId: MILESTONE, promptSha256: createHash('sha256').update(bytes).digest('hex'), promptByteLength: 0 })).toString('base64url');
    const result = await invoke(cwd, commonImportArgs(token, file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('SHA mismatch is rejected before staging and emits no descriptor', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('original prompt'); const file = await writePrompt(cwd, bytes);
    const altered = Buffer.from('tampered prompt'); const result = await invoke(cwd, commonImportArgs(descriptorFor(altered), file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0); assert.match(result.stderr, /SHA-256/);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('byte-length mismatch is rejected before staging', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('length mismatch'); const file = await writePrompt(cwd, bytes);
    const token = formatPromptRelayDescriptor({ milestoneId: MILESTONE, promptSha256: createHash('sha256').update(bytes).digest('hex'), promptByteLength: bytes.length + 1 });
    const result = await invoke(cwd, commonImportArgs(token, file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0); assert.match(result.stderr, /byte length/);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('descriptor validation failure does not mutate store', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('synthetic prompt'); const file = await writePrompt(cwd, bytes);
    const result = await invoke(cwd, ['import', '--descriptor', 'bad-token', '--prompt-file', file, '--approval-reference', APPROVAL]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
  });
});

test('active different authorization is not displaced by import', async () => {
  await withRoot(async (cwd) => {
    const store = new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') });
    const old = Buffer.from('old authorized prompt');
    const staged = await store.stagePrompt({ milestoneId: MILESTONE, promptBytes: old }); await store.authorizePrompt(staged.identity, APPROVAL);
    const next = Buffer.from('new prompt'); const file = await writePrompt(cwd, next);
    const result = await invoke(cwd, commonImportArgs(descriptorFor(next), file));
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    assert.deepEqual((await store.loadVerifiedAuthorizedPrompt()).promptBytes, old);
  });
});

test('resolve emits exact prompt bytes with no prefix, wrapper, suffix or newline', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('exact\r\n\u6f22\u5b57'); const file = await writePrompt(cwd, bytes);
    const token = descriptorFor(bytes); const imported = await invoke(cwd, commonImportArgs(token, file)); assert.equal(imported.code, 0, imported.stderr);
    const result = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.equal(result.code, 0, result.stderr); assert.deepEqual(result.stdout, bytes);
    assert.equal(createHash('sha256').update(result.stdout).digest('hex'), tokenHash(token));
  });
});

function tokenHash(token: string): string {
  const payload = Buffer.from(token.slice('CDLD-PROMPT-V1.'.length), 'base64url').toString('utf8');
  return (JSON.parse(payload) as { promptSha256: string }).promptSha256;
}

test('resolve errors emit zero prompt stdout bytes', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('not imported'); const token = descriptorFor(bytes);
    const result = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0); assert.notEqual(result.stderr.length, 0);
  });
});

test('wrong valid descriptor SHA and length cannot resolve and emit no prompt bytes', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('authorized prompt'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    assert.equal((await invoke(cwd, commonImportArgs(token, file))).code, 0);
    const wrongSha = formatPromptRelayDescriptor({ milestoneId: MILESTONE, promptSha256: 'f'.repeat(64), promptByteLength: bytes.length });
    const wrongLength = formatPromptRelayDescriptor({ milestoneId: MILESTONE, promptSha256: createHash('sha256').update(bytes).digest('hex'), promptByteLength: bytes.length + 1 });
    for (const wrong of [wrongSha, wrongLength]) {
      const result = await invoke(cwd, ['resolve', '--descriptor', wrong]);
      assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    }
  });
});

test('wrong milestone/project/repository descriptors are rejected before resolve output', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('authorized prompt'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    assert.equal((await invoke(cwd, commonImportArgs(token, file))).code, 0);
    const wrongMilestone = descriptorFor(bytes, 'OTHER-MILESTONE');
    const fields = { schemaVersion: 1, project: 'Wrong-Project', repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger', milestoneId: MILESTONE, promptSha256: createHash('sha256').update(bytes).digest('hex'), promptByteLength: bytes.length };
    const wrongProject = 'CDLD-PROMPT-V1.' + Buffer.from(JSON.stringify(fields)).toString('base64url');
    const wrongRepoFields = { ...fields, project: 'Chrome-Dual-Layer-Debugger', repository: 'wrong/repo' };
    const wrongRepo = 'CDLD-PROMPT-V1.' + Buffer.from(JSON.stringify(wrongRepoFields)).toString('base64url');
    for (const wrong of [wrongMilestone, wrongProject, wrongRepo]) {
      const result = await invoke(cwd, ['resolve', '--descriptor', wrong]);
      assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    }
  });
});

test('revoked prompt cannot resolve', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('revoked prompt'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    assert.equal((await invoke(cwd, commonImportArgs(token, file))).code, 0);
    const revoked = await invoke(cwd, ['revoke', '--descriptor', token, '--approval-reference', 'human withdrawal']);
    assert.equal(revoked.code, 0, revoked.stderr); assert.equal(revoked.stdout.length, 0);
    const result = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
  });
});

test('stale descriptor after supersession cannot resolve', async () => {
  await withRoot(async (cwd) => {
    const old = Buffer.from('old'); const oldFile = await writePrompt(cwd, old, 'old.md'); const oldToken = descriptorFor(old);
    assert.equal((await invoke(cwd, commonImportArgs(oldToken, oldFile))).code, 0);
    const next = Buffer.from('replacement'); const nextFile = await writePrompt(cwd, next, 'next.md'); const nextToken = descriptorFor(next);
    assert.equal((await invoke(cwd, ['supersede', '--descriptor', nextToken, '--prompt-file', nextFile, '--approval-reference', APPROVAL])).code, 0);
    const result = await invoke(cwd, ['resolve', '--descriptor', oldToken]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    assert.deepEqual((await invoke(cwd, ['resolve', '--descriptor', nextToken])).stdout, next);
  });
});

test('corrupt and missing locators cannot produce prompt stdout', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('prompt'); const token = descriptorFor(bytes);
    const missing = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.notEqual(missing.code, 0); assert.equal(missing.stdout.length, 0);
    const currentDir = path.join(cwd, '.agent-work', 'current'); const { mkdir } = await import('node:fs/promises');
    await mkdir(currentDir, { recursive: true }); await writeFile(path.join(currentDir, 'executor-prompt.json'), '{bad');
    const corrupt = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.notEqual(corrupt.code, 0); assert.equal(corrupt.stdout.length, 0);
  });
});

test('malformed lifecycle evidence cannot produce prompt stdout', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('authorized then corrupted'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    assert.equal((await invoke(cwd, commonImportArgs(token, file))).code, 0);
    const locatorPath = path.join(cwd, '.agent-work', 'current', 'executor-prompt.json');
    const locator = JSON.parse(await readFile(locatorPath, 'utf8')) as { authorizationLifecycle: { path: string } };
    await writeFile(path.join(cwd, '.agent-work', ...locator.authorizationLifecycle.path.split('/')), '{malformed');
    const result = await invoke(cwd, ['resolve', '--descriptor', token]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
  });
});

test('revoke requires exact current descriptor and stale token leaves current active', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('current'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    assert.equal((await invoke(cwd, commonImportArgs(token, file))).code, 0);
    const stale = descriptorFor(Buffer.from('other'));
    const rejected = await invoke(cwd, ['revoke', '--descriptor', stale, '--approval-reference', 'withdrawal']);
    assert.notEqual(rejected.code, 0); assert.equal(rejected.stdout.length, 0);
    assert.deepEqual((await invoke(cwd, ['resolve', '--descriptor', token])).stdout, bytes);
    const revoked = await invoke(cwd, ['revoke', '--descriptor', token, '--approval-reference', 'withdrawal']);
    assert.equal(revoked.code, 0, revoked.stderr);
  });
});

test('cross-milestone supersession is rejected without changing current prompt', async () => {
  await withRoot(async (cwd) => {
    const store = new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') });
    const old = Buffer.from('old'); const staged = await store.stagePrompt({ milestoneId: MILESTONE, promptBytes: old }); await store.authorizePrompt(staged.identity, APPROVAL);
    const next = Buffer.from('new'); const file = await writePrompt(cwd, next);
    const result = await invoke(cwd, ['supersede', '--descriptor', descriptorFor(next, 'OTHER-MILESTONE'), '--prompt-file', file, '--approval-reference', APPROVAL]);
    assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    assert.deepEqual((await store.loadVerifiedAuthorizedPrompt()).promptBytes, old);
  });
});

test('after revocation a different milestone can be imported normally', async () => {
  await withRoot(async (cwd) => {
    const old = Buffer.from('old'); const oldFile = await writePrompt(cwd, old, 'old.md'); const oldToken = descriptorFor(old);
    assert.equal((await invoke(cwd, commonImportArgs(oldToken, oldFile))).code, 0);
    assert.equal((await invoke(cwd, ['revoke', '--descriptor', oldToken, '--approval-reference', 'withdrawal'])).code, 0);
    const next = Buffer.from('next milestone'); const nextFile = await writePrompt(cwd, next, 'next.md'); const nextToken = descriptorFor(next, 'RELAY-1C-SYNTHETIC');
    const imported = await invoke(cwd, commonImportArgs(nextToken, nextFile));
    assert.equal(imported.code, 0, imported.stderr);
    assert.deepEqual((await new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt()).promptBytes, next);
  });
});

test('argument parser fails closed for unknown, duplicate, missing and positional inputs', async () => {
  await withRoot(async (cwd) => {
    const cases = [
      ['unknown'],
      ['resolve', '--descriptor', 'x', '--wat', 'y'],
      ['resolve', '--descriptor', 'x', '--descriptor', 'y'],
      ['resolve', '--descriptor'],
      ['resolve', 'unexpected', '--descriptor', 'x'],
      ['resolve', '--descriptor', ''],
    ];
    for (const args of cases) {
      const result = await invoke(cwd, args);
      assert.notEqual(result.code, 0); assert.equal(result.stdout.length, 0);
    }
  });
});

test('separate Node processes import then resolve exact prompt bytes', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('process boundary\r\n\u6f22\u5b57\n'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    const imported = spawnSync(process.execPath, [CLI_PATH, 'import', '--descriptor', token, '--prompt-file', file, '--approval-reference', APPROVAL], { cwd, encoding: 'buffer' });
    assert.equal(imported.status, 0, imported.stderr.toString());
    assert.deepEqual(imported.stdout, Buffer.from(`${token}\n`, 'ascii'));
    const resolved = spawnSync(process.execPath, [CLI_PATH, 'resolve', '--descriptor', token], { cwd, encoding: 'buffer' });
    assert.equal(resolved.status, 0, resolved.stderr.toString());
    assert.deepEqual(resolved.stdout, bytes);
    assert.equal(createHash('sha256').update(resolved.stdout).digest('hex'), tokenHash(token));
    assert.equal(resolved.stdout.length, bytes.length);
  });
});

test('separate-process mismatch returns failure, zero stdout and creates no authorization', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('tamper test prompt'); const changed = Buffer.from('different prompt'); const file = await writePrompt(cwd, bytes);
    const result = spawnSync(process.execPath, [CLI_PATH, 'import', '--descriptor', descriptorFor(changed), '--prompt-file', file, '--approval-reference', APPROVAL], { cwd, encoding: 'buffer' });
    assert.notEqual(result.status, 0); assert.equal(result.stdout.length, 0); assert.notEqual(result.stderr.length, 0);
    await assert.rejects(readFile(path.join(cwd, '.agent-work', 'prompts')));
    await assert.rejects(new PromptArtifactStore({ agentWorkRoot: path.join(cwd, '.agent-work') }).loadVerifiedAuthorizedPrompt());
  });
});

test('separate-process resolve failure writes zero prompt bytes to stdout', async () => {
  await withRoot(async (cwd) => {
    const token = descriptorFor(Buffer.from('not present'));
    const result = spawnSync(process.execPath, [CLI_PATH, 'resolve', '--descriptor', token], { cwd, encoding: 'buffer' });
    assert.notEqual(result.status, 0); assert.equal(result.stdout.length, 0); assert.notEqual(result.stderr.length, 0);
  });
});

test('canonical direct CLI invocation resolves without an npm forwarding layer', async () => {
  await withRoot(async (cwd) => {
    const bytes = Buffer.from('direct invocation'); const file = await writePrompt(cwd, bytes); const token = descriptorFor(bytes);
    const imported = spawnSync(process.execPath, [CLI_PATH, 'import', '--descriptor', token, '--prompt-file', file, '--approval-reference', APPROVAL], { cwd, encoding: 'buffer' });
    assert.equal(imported.status, 0, imported.stderr.toString());
    const resolved = spawnSync(process.execPath, [CLI_PATH, 'resolve', '--descriptor', token], { cwd, encoding: 'buffer' });
    assert.equal(resolved.status, 0, resolved.stderr.toString()); assert.deepEqual(resolved.stdout, bytes);
  });
});
