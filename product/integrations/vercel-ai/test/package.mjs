import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'sixteen-integrated-packages-'));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
try {
  const archives = [];
  for (const path of ['../../../sdk/', '../']) {
    const [archive] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: new URL(path, import.meta.url), encoding: 'utf8' }));
    assert.ok(archive.files.every(file => !/^(test\/|src\/|node_modules\/)|end-to-end|local-runtime/.test(file.path)));
    archives.push(join(directory, archive.filename));
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  execFileSync('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', ...archives, 'ai@7.0.165', 'zod@4.6.7', '@types/node@22.19.0', '@types/json-schema@7.0.15'], { cwd: directory, stdio: 'pipe' });
  await writeFile(join(directory, 'consumer.mts'), `
    import { SixteenMemory, type Memory } from '@sixteen-memory/sdk';
    import { createSixteenMemory, createChatHandler, type ChatHandlerOptions } from '@sixteen-memory/vercel-ai';
    import { MockLanguageModelV4 } from 'ai/test';
    const sdk = new SixteenMemory({ baseUrl: 'https://memory.example' });
    const record: Memory = await sdk.get('id');
    const memory = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: 'synthetic-key-for-package-only-tests', userId: 'alice' });
    const config: ChatHandlerOptions = { model: new MockLanguageModelV4(), allowedOrigins: [], memoryBaseUrl: 'https://memory.example', authenticate: async () => null, rateLimit: async () => false };
    const handler: (request: Request) => Promise<Response> = createChatHandler(config);
    void [record, memory, handler];
    // @ts-expect-error Authentication is required.
    createChatHandler({ model: new MockLanguageModelV4(), memoryBaseUrl: 'https://memory.example' });
  `);
  execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], { cwd: directory, stdio: 'inherit' });
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { SixteenMemory } from '@sixteen-memory/sdk';
    import { createSixteenMemory, createChatHandler } from '@sixteen-memory/vercel-ai';
    import { MockLanguageModelV4 } from 'ai/test';
    let calls = 0;
    const original = SixteenMemory.prototype.search;
    SixteenMemory.prototype.search = async function (...args) { calls++; return original.apply(this, args); };
    const memory = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: 'synthetic-key-for-package-only-tests', userId: 'alice', fetch: async () => Response.json({data: []}) });
    assert.equal((await memory.search('test')).context, '');
    assert.equal(calls, 1);
    const handler = createChatHandler({ model: new MockLanguageModelV4(), allowedOrigins: [], memoryBaseUrl: 'https://memory.example', authenticate: async () => null, rateLimit: async () => true });
    assert.equal((await handler(new Request('https://app.example/chat', {method: 'POST'}))).status, 401);
  `], { cwd: directory, stdio: 'pipe' });
  const installed = JSON.parse(await readFile(join(directory, 'node_modules/@sixteen-memory/vercel-ai/package.json')));
  assert.equal(installed.peerDependencies['@sixteen-memory/sdk'], '^0.3.0');
  console.log('Both archives installed offline; shared SDK invoked by adapter; handler ESM and standalone TypeScript passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
