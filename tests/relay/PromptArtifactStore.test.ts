import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { PromptArtifactStore, type PromptIdentity, type PromptLocator } from '../../src/relay/PromptArtifactStore.js';

const MILESTONE = 'RELAY.1A-DURABLE-PROMPT-ARTIFACT-FOUNDATION';
const APPROVAL = 'Architect approval record: approved for Executor review';

async function withStore(run: (store: PromptArtifactStore, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'cdld-prompt-store-'));
  try { await run(new PromptArtifactStore({ agentWorkRoot: root }), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function staged(store: PromptArtifactStore, bytes = Buffer.from('Prompt\n', 'utf8')) {
  return store.stagePrompt({ milestoneId: MILESTONE, promptBytes: bytes });
}

async function authorized(store: PromptArtifactStore, bytes = Buffer.from('Prompt\n', 'utf8')) {
  const result = await staged(store, bytes);
  await store.authorizePrompt(result.identity, APPROVAL);
  return result;
}

function promptPath(root: string, identity: PromptIdentity): string {
  return path.join(root, 'prompts', identity.milestoneId, `${identity.promptSha256}.md`);
}

function manifestPath(root: string, identity: PromptIdentity): string {
  return path.join(root, 'prompts', identity.milestoneId, `${identity.promptSha256}.json`);
}

async function locator(root: string): Promise<PromptLocator> {
  return JSON.parse(await readFile(path.join(root, 'current', 'executor-prompt.json'), 'utf8')) as PromptLocator;
}

test('stages exact Buffer bytes and publishes content-addressed prompt and manifest', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from([0x23, 0x20, 0xc3, 0xa9, 0x0d, 0x0a, 0x09, 0x20]);
    const item = await staged(store, bytes);
    assert.deepEqual(await readFile(promptPath(root, item.identity)), bytes);
    assert.equal(item.identity.promptSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(item.identity.promptByteLength, bytes.length);
    assert.equal(item.manifest.promptPath, `prompts/${MILESTONE}/${item.identity.promptSha256}.md`);
    assert.equal(await readFile(manifestPath(root, item.identity), 'utf8').then((s) => JSON.parse(s).initialLifecycleStatus), 'STAGED');
  });
});

test('preserves LF bytes exactly', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('one\ntwo\n', 'utf8');
    const item = await staged(store, bytes);
    assert.deepEqual(await readFile(promptPath(root, item.identity)), bytes);
  });
});

test('preserves CRLF bytes exactly', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('one\r\ntwo\r\n', 'utf8');
    const item = await staged(store, bytes);
    assert.deepEqual(await readFile(promptPath(root, item.identity)), bytes);
  });
});

test('trailing newline changes prompt identity when bytes differ', async () => {
  await withStore(async (store) => {
    const a = await staged(store, Buffer.from('prompt', 'utf8'));
    const b = await staged(store, Buffer.from('prompt\n', 'utf8'));
    assert.notEqual(a.identity.promptSha256, b.identity.promptSha256);
    assert.notEqual(a.identity.promptByteLength, b.identity.promptByteLength);
  });
});

test('preserves UTF-8 non-ASCII bytes without normalization', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('é\r\n漢字🧭\n', 'utf8');
    const item = await staged(store, bytes);
    assert.deepEqual(await readFile(promptPath(root, item.identity)), bytes);
  });
});

test('stage -> authorize -> verified load returns exact Buffer bytes', async () => {
  await withStore(async (store) => {
    const bytes = Buffer.from('Frozen prompt\r\n', 'utf8');
    const item = await staged(store, bytes);
    const auth = await store.authorizePrompt(item.identity, APPROVAL);
    const loaded = await store.loadVerifiedAuthorizedPrompt();
    assert.equal(auth.currentLifecycleStatus, 'AUTHORIZED');
    assert.ok(Buffer.isBuffer(loaded.promptBytes));
    assert.deepEqual(loaded.promptBytes, bytes);
    assert.equal(loaded.authorization.approvalReference, APPROVAL);
  });
});

test('first authorization succeeds when no current locator exists', async () => {
  await withStore(async (store) => {
    const item = await staged(store, Buffer.from('first authorization'));
    const installed = await store.authorizePrompt(item.identity, APPROVAL);
    assert.equal(installed.currentLifecycleStatus, 'AUTHORIZED');
    assert.deepEqual((await store.loadVerifiedAuthorizedPrompt()).promptBytes, Buffer.from('first authorization'));
  });
});

test('direct authorization cannot displace a different currently authorized prompt', async () => {
  await withStore(async (store, root) => {
    const a = await authorized(store, Buffer.from('prompt A'));
    const b = await staged(store, Buffer.from('prompt B'));
    const before = await readFile(path.join(root, 'current', 'executor-prompt.json'));
    await assert.rejects(store.authorizePrompt(b.identity, 'approval for B'), /already currently authorized/);
    assert.deepEqual(await readFile(path.join(root, 'current', 'executor-prompt.json')), before);
    assert.equal((await store.loadVerifiedAuthorizedPrompt()).identity.promptSha256, a.identity.promptSha256);
  });
});

test('a changed same-milestone decision requires explicit supersession', async () => {
  await withStore(async (store) => {
    const a = await authorized(store, Buffer.from('decision A'));
    const b = await store.stagePrompt({
      milestoneId: MILESTONE,
      promptBytes: Buffer.from('decision B'),
      supersedes: a.identity,
    });
    await assert.rejects(store.authorizePrompt(b.identity, 'approval for B'), /supersedeCurrent/);
    const replacement = await store.supersedeCurrent({ promptBytes: Buffer.from('decision B'), approvalReference: 'explicit supersession approval' });
    assert.equal(replacement.identity.promptSha256, b.identity.promptSha256);
    assert.equal(replacement.manifest.supersedes?.promptSha256, a.identity.promptSha256);
  });
});

test('different-milestone authorization cannot displace an active prompt', async () => {
  await withStore(async (store, root) => {
    const a = await authorized(store, Buffer.from('active milestone A'));
    const b = await store.stagePrompt({ milestoneId: 'OTHER-MILESTONE', promptBytes: Buffer.from('milestone B') });
    const before = await readFile(path.join(root, 'current', 'executor-prompt.json'));
    await assert.rejects(store.authorizePrompt(b.identity, 'approval for milestone B'), /already currently authorized/);
    assert.deepEqual(await readFile(path.join(root, 'current', 'executor-prompt.json')), before);
    assert.equal((await store.loadVerifiedAuthorizedPrompt()).identity.promptSha256, a.identity.promptSha256);
  });
});

test('a different prompt can be authorized after a fully verified revocation', async () => {
  await withStore(async (store) => {
    await authorized(store, Buffer.from('revoked prompt'));
    await store.revokeCurrent('approval to revoke old prompt');
    const next = await store.stagePrompt({ milestoneId: 'NEXT-MILESTONE', promptBytes: Buffer.from('new prompt') });
    await store.authorizePrompt(next.identity, 'approval for new prompt');
    assert.equal((await store.loadVerifiedAuthorizedPrompt()).identity.promptSha256, next.identity.promptSha256);
  });
});

test('same revoked identity cannot be re-authorized', async () => {
  await withStore(async (store) => {
    const item = await authorized(store, Buffer.from('one-time prompt'));
    await store.revokeCurrent('approval to revoke');
    await assert.rejects(store.authorizePrompt(item.identity, 'attempted replay approval'), /revoked prompt identity/);
  });
});

test('tampered revoked lifecycle prevents authorizing a different prompt and preserves locator', async () => {
  await withStore(async (store, root) => {
    await authorized(store, Buffer.from('old prompt'));
    const revokeRef = await store.revokeCurrent('revoke approval');
    const next = await store.stagePrompt({ milestoneId: MILESTONE, promptBytes: Buffer.from('new prompt') });
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    const before = await readFile(locatorPathname);
    await writeFile(path.join(root, ...revokeRef.path.split('/')), 'tampered revocation');
    await assert.rejects(store.authorizePrompt(next.identity, 'new approval'));
    assert.deepEqual(await readFile(locatorPathname), before);
  });
});

test('missing revoked lifecycle prevents authorizing a different prompt and preserves locator', async () => {
  await withStore(async (store, root) => {
    await authorized(store, Buffer.from('old prompt'));
    const revokeRef = await store.revokeCurrent('revoke approval');
    const next = await store.stagePrompt({ milestoneId: MILESTONE, promptBytes: Buffer.from('new prompt') });
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    const before = await readFile(locatorPathname);
    await unlink(path.join(root, ...revokeRef.path.split('/')));
    await assert.rejects(store.authorizePrompt(next.identity, 'new approval'));
    assert.deepEqual(await readFile(locatorPathname), before);
  });
});

test('malformed current locator cannot be overwritten by authorization', async () => {
  await withStore(async (store, root) => {
    const item = await staged(store, Buffer.from('candidate'));
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(locatorPathname), { recursive: true }));
    const corrupt = Buffer.from('{corrupt current locator');
    await writeFile(locatorPathname, corrupt);
    await assert.rejects(store.authorizePrompt(item.identity, 'candidate approval'));
    assert.deepEqual(await readFile(locatorPathname), corrupt);
  });
});

test('identity-corrupt current locator cannot be overwritten by authorization', async () => {
  await withStore(async (store, root) => {
    await authorized(store, Buffer.from('current prompt'));
    const b = await staged(store, Buffer.from('candidate prompt'));
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    const broken = await locator(root) as unknown as Record<string, unknown>;
    broken.promptSha256 = '0'.repeat(64);
    const corruptBytes = Buffer.from(JSON.stringify(broken, null, 2) + '\n');
    await writeFile(locatorPathname, corruptBytes);
    await assert.rejects(store.authorizePrompt(b.identity, 'candidate approval'));
    assert.deepEqual(await readFile(locatorPathname), corruptBytes);
  });
});

test('completed supersession rejects replay of the stale prior locator', async () => {
  await withStore(async (store, root) => {
    const old = await authorized(store, Buffer.from('old locator replay target'));
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    const staleLocator = await readFile(locatorPathname);
    await store.supersedeCurrent({ promptBytes: Buffer.from('replacement target'), approvalReference: 'approved replacement' });
    await writeFile(locatorPathname, staleLocator);
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /superseded/);
    assert.equal(old.identity.promptSha256, (JSON.parse(staleLocator.toString('utf8')) as PromptLocator).promptSha256);
  });
});

test('authorization requires an explicit non-empty approval reference', async () => {
  await withStore(async (store) => {
    const item = await staged(store);
    await assert.rejects(store.authorizePrompt(item.identity, ''), /approvalReference/);
    await assert.rejects(store.authorizePrompt(item.identity, '   '), /approvalReference/);
  });
});

test('hash-valid STAGED content is not executable without an authorized locator', async () => {
  await withStore(async (store) => {
    await staged(store);
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('identical existing content is reused only after complete verification', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('repeatable\n');
    const first = await staged(store, bytes);
    const second = await staged(store, bytes);
    assert.deepEqual(second.identity, first.identity);
    assert.deepEqual(await readFile(promptPath(root, first.identity)), bytes);
    const events = await readdir(path.join(root, 'prompts', MILESTONE, 'lifecycle'));
    assert.equal(events.length, 1);
  });
});

test('immutable prompt publication refuses to replace a conflicting existing path', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('immutable bytes');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const target = path.join(root, 'prompts', MILESTONE, `${digest}.md`);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true }));
    await writeFile(target, 'preexisting conflicting bytes');
    await assert.rejects(store.stagePrompt({ milestoneId: MILESTONE, promptBytes: bytes }));
    assert.equal(await readFile(target, 'utf8'), 'preexisting conflicting bytes');
  });
});

test('immutable manifest publication refuses to replace a conflicting existing path', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('manifest collision');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const target = path.join(root, 'prompts', MILESTONE, `${digest}.json`);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true }));
    await writeFile(target, 'not the canonical manifest');
    await assert.rejects(store.stagePrompt({ milestoneId: MILESTONE, promptBytes: bytes }));
    assert.equal(await readFile(target, 'utf8'), 'not the canonical manifest');
  });
});

test('rejects invalid milestone path traversal and absolute forms', async () => {
  await withStore(async (store) => {
    for (const milestoneId of ['../escape', 'a/child', 'a\\child', 'C:drive', '..', '/absolute']) {
      await assert.rejects(store.stagePrompt({ milestoneId, promptBytes: Buffer.from('x') }));
    }
  });
});

test('missing prompt fails verified loading', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    await unlink(promptPath(root, item.identity));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('missing manifest fails verified loading', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    await unlink(manifestPath(root, item.identity));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('corrupt prompt fails SHA-256 verification', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    await writeFile(promptPath(root, item.identity), Buffer.alloc(item.identity.promptByteLength, 0x58));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /SHA-256/);
  });
});

test('prompt byte-length mismatch fails independently of digest mismatch', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    const bytes = await readFile(promptPath(root, item.identity));
    const l = await locator(root);
    l.promptByteLength += 1;
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l, null, 2) + '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.identity.promptSha256);
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /identity|length|manifest/i);
  });
});

test('wrong project in locator fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root) as unknown as Record<string, unknown>;
    l.project = 'Other-Project';
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /project/);
  });
});

test('wrong repository in locator fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root) as unknown as Record<string, unknown>;
    l.repository = 'someone/else';
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /project|repository/);
  });
});

test('wrong milestone in locator fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    l.milestoneId = 'OTHER-MILESTONE';
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('malformed manifest fails closed', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    await writeFile(manifestPath(root, item.identity), '{invalid');
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /Manifest SHA-256/);
  });
});

test('manifest identity mismatch fails closed even when locator manifest hash matches', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    const file = manifestPath(root, item.identity);
    const manifest = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    manifest.repository = 'wrong/repo';
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(file, bytes);
    const l = await locator(root);
    l.manifestSha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l, null, 2) + '\n');
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /Manifest project/);
  });
});

test('manifest path traversal fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    l.manifestPath = '../escape.json';
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /path/);
  });
});

test('absolute manifest path fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    l.manifestPath = path.resolve(root, 'manifest.json');
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /path/);
  });
});

test('missing authorization lifecycle evidence fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    await unlink(path.join(root, ...l.authorizationLifecycle.path.split('/')));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('malformed lifecycle evidence fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    await writeFile(path.join(root, ...l.authorizationLifecycle.path.split('/')), '{broken');
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /Lifecycle SHA-256/);
  });
});

test('manifest byte-length identity mismatch fails closed', async () => {
  await withStore(async (store, root) => {
    const item = await authorized(store);
    const file = manifestPath(root, item.identity);
    const manifest = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    manifest.promptByteLength = Number(manifest.promptByteLength) + 1;
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(file, bytes);
    const l = await locator(root);
    l.manifestSha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l, null, 2));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /identity mismatch/);
  });
});

test('locator SHA mismatch fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    l.promptSha256 = '0'.repeat(64);
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('missing locator fails closed', async () => {
  await withStore(async (store) => {
    await assert.rejects(store.loadVerifiedAuthorizedPrompt());
  });
});

test('malformed locator fails closed', async () => {
  await withStore(async (store, root) => {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(root, 'current'), { recursive: true }));
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), '{bad json');
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /malformed JSON/);
  });
});

test('locator lifecycle conflict fails closed', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const l = await locator(root);
    l.currentLifecycle = { ...l.currentLifecycle, sha256: 'f'.repeat(64) };
    await writeFile(path.join(root, 'current', 'executor-prompt.json'), JSON.stringify(l));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /conflict/);
  });
});

test('revoked prompt is not returned by verified loader', async () => {
  await withStore(async (store, root) => {
    await authorized(store);
    const reference = await store.revokeCurrent('Human approval reference: revoke');
    const revokedBytes = await readFile(path.join(root, ...reference.path.split('/')));
    assert.equal(createHash('sha256').update(revokedBytes).digest('hex'), reference.sha256);
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /authorized|revocation/i);
  });
});

test('supersession creates a new artifact and preserves old bytes', async () => {
  await withStore(async (store, root) => {
    const oldBytes = Buffer.from('old decision\r\n');
    const old = await authorized(store, oldBytes);
    const nextBytes = Buffer.from('replacement decision\n');
    const loaded = await store.supersedeCurrent({ promptBytes: nextBytes, approvalReference: 'Architect correction approval' });
    assert.notEqual(loaded.identity.promptSha256, old.identity.promptSha256);
    assert.deepEqual(loaded.promptBytes, nextBytes);
    assert.deepEqual(await readFile(promptPath(root, old.identity)), oldBytes);
    assert.equal(loaded.manifest.supersedes?.promptSha256, old.identity.promptSha256);
  });
});

test('superseded prompt is no longer returned as current', async () => {
  await withStore(async (store) => {
    const old = await authorized(store, Buffer.from('old'));
    await store.supersedeCurrent({ promptBytes: Buffer.from('new'), approvalReference: 'replacement approved' });
    assert.notEqual((await store.loadVerifiedAuthorizedPrompt()).identity.promptSha256, old.identity.promptSha256);
  });
});

test('replacement publication failure before locator switch preserves prior authorization', async () => {
  await withStore(async (store, root) => {
    const old = await authorized(store, Buffer.from('original'));
    const next = Buffer.from('replacement');
    const digest = createHash('sha256').update(next).digest('hex');
    const manifestTarget = path.join(root, 'prompts', MILESTONE, `${digest}.json`);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(manifestTarget), { recursive: true }));
    await writeFile(manifestTarget, 'conflicting manifest');
    await assert.rejects(store.supersedeCurrent({ promptBytes: next, approvalReference: 'approved replacement' }));
    const recovered = await store.loadVerifiedAuthorizedPrompt();
    assert.equal(recovered.identity.promptSha256, old.identity.promptSha256);
  });
});

test('fresh store instance recovers authorized bytes from durable state', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('restart recovery');
    await authorized(store, bytes);
    const recovered = await new PromptArtifactStore({ agentWorkRoot: root }).loadVerifiedAuthorizedPrompt();
    assert.deepEqual(recovered.promptBytes, bytes);
  });
});

test('second Node process recovers the exact authorized prompt', async () => {
  await withStore(async (store, root) => {
    const bytes = Buffer.from('second process recovery\r\n');
    await authorized(store, bytes);
    const moduleUrl = pathToFileURL(path.resolve('dist/src/relay/PromptArtifactStore.js')).href;
    const code = `import { PromptArtifactStore } from ${JSON.stringify(moduleUrl)}; const s = new PromptArtifactStore({agentWorkRoot: process.env.CDLD_TEST_PROMPT_ROOT}); const p = await s.loadVerifiedAuthorizedPrompt(); process.stdout.write(JSON.stringify({sha:p.identity.promptSha256,len:p.promptBytes.length,b64:p.promptBytes.toString('base64')}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
      env: { ...process.env, CDLD_TEST_PROMPT_ROOT: root },
    });
    assert.equal(child.status, 0, child.stderr);
    const data = JSON.parse(child.stdout) as { sha: string; len: number; b64: string };
    assert.equal(data.sha, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(data.len, bytes.length);
    assert.deepEqual(Buffer.from(data.b64, 'base64'), bytes);
  });
});

test('loader rejects an authorization reference that points only to STAGED state', async () => {
  await withStore(async (store, root) => {
    const item = await staged(store);
    const locatorPathname = path.join(root, 'current', 'executor-prompt.json');
    const stagedRef = item.stagedLifecycle;
    const manifestBytes = await readFile(manifestPath(root, item.identity));
    const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
    const locatorValue = {
      schemaVersion: 1, project: 'Chrome-Dual-Layer-Debugger', repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger',
      milestoneId: MILESTONE, promptSha256: item.identity.promptSha256, promptByteLength: item.identity.promptByteLength,
      manifestPath: `prompts/${MILESTONE}/${item.identity.promptSha256}.json`, manifestSha256,
      authorizationLifecycle: stagedRef, currentLifecycleStatus: 'AUTHORIZED', currentLifecycle: stagedRef,
    };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(locatorPathname), { recursive: true }));
    await writeFile(locatorPathname, JSON.stringify(locatorValue));
    await assert.rejects(store.loadVerifiedAuthorizedPrompt(), /authorization record/);
  });
});

test('manifest records superseded full identity without modifying prior manifest bytes', async () => {
  await withStore(async (store, root) => {
    const old = await authorized(store, Buffer.from('old manifest target'));
    const before = await readFile(manifestPath(root, old.identity));
    const next = await store.supersedeCurrent({ promptBytes: Buffer.from('new manifest target'), approvalReference: 'approved' });
    const after = await readFile(manifestPath(root, old.identity));
    assert.deepEqual(after, before);
    assert.deepEqual(next.manifest.supersedes, {
      project: 'Chrome-Dual-Layer-Debugger',
      repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger',
      milestoneId: old.identity.milestoneId,
      promptSha256: old.identity.promptSha256,
      promptByteLength: old.identity.promptByteLength,
    });
  });
});

test('approval metadata is persisted as immutable lifecycle evidence', async () => {
  await withStore(async (store, root) => {
    const item = await staged(store);
    await store.authorizePrompt(item.identity, APPROVAL);
    const loaded = await store.loadVerifiedAuthorizedPrompt();
    const lifecycle = JSON.parse(await readFile(path.join(root, ...loaded.authorization.previousLifecycle!.path.split('/')), 'utf8')) as { status: string };
    assert.equal(lifecycle.status, 'STAGED');
    assert.equal(loaded.authorization.approvalReference, APPROVAL);
  });
});
