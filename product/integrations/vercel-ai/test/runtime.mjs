/** Local-only integration against actual Workers/SQLite: v0.1 fixture and v0.2 candidate. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateText } from 'ai';
import { createSixteenMemory } from '../dist/index.js';
import { SixteenMemory } from '../../../sdk/index.mjs';
import { mockModel } from './helpers.mjs';

const directory = await mkdtemp(join(tmpdir(), 'sixteen-vercel-integration-'));
const config = JSON.parse(await readFile(new URL('../../../wrangler.jsonc', import.meta.url)));
const administrator = 'synthetic-runtime-administrator-key-only-123456';
const checks = [];
let runtime;
let providerCalls = 0;
try {
  const oldBundle = join(directory, 'v010.js');
  await build({ entryPoints: [fileURLToPath(new URL('../../../test/fixtures/v010/index.ts', import.meta.url))], outfile: oldBundle, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', keepNames: true, external: ['cloudflare:workers', 'node:crypto'], logLevel: 'silent' });
  const definitions = [
    ['baseline-v010', oldBundle],
    ['candidate-v021', fileURLToPath(new URL('../../../dist-worker/index.js', import.meta.url))],
  ];
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({ workers: definitions.map(([name, scriptPath]) => ({
      name, modules: true, scriptPath, modulesRoot: dirname(scriptPath),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: { ...config.vars, PROJECT_ID: name, ADMIN_KEY: administrator, EXTRACTION_ENABLED: 'false', EMBEDDINGS_ENABLED: 'false' },
      serviceBindings: { ASSETS: () => new Response('local fixture assets') },
      durableObjects: { PROJECTS: { className: 'MemoryProject', useSQLite: true } },
      ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
      outboundService: async request => { void request; providerCalls++; return new Response('Outbound provider calls are forbidden in this test', { status: 503 }); },
    })) }),
    resourcePersistencePath: join(directory, 'state'),
  });
  for (const [name] of definitions) {
    const worker = await runtime.getWorker(name);
    const transport = async (url, init = {}) => worker.fetch(url, { ...init, headers: { ...init.headers, 'CF-Connecting-IP': 'fixture-' + crypto.randomUUID() } });
    async function admin(path, body) {
      const response = await transport('https://memory.example' + path, { method: 'POST', headers: { Authorization: `Bearer ${administrator}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200); return response.json();
    }
    const writeKey = (await admin('/v1/keys', { name: 'adapter writer', user_id: 'alice', role: 'write' })).key;
    const readKey = (await admin('/v1/keys', { name: 'adapter reader', user_id: 'alice', role: 'read' })).key;
    const bobKey = (await admin('/v1/keys', { name: 'other user', user_id: 'bob', role: 'write' })).key;
    const memory = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: writeKey, userId: 'alice', fetch: transport });
    const message = { role: 'user', text: 'I prefer concise replies.', requestId: 'request-one', ref: 'synthetic-conversation', observedAt: '2026-11-01T08:00:00Z' };
    const saved = await memory.rememberUserMessage(message);
    const repeated = await memory.rememberUserMessage(message);
    assert.equal(saved.id, repeated.id); checks.push(`${name}: explicit idempotent write`);
    await assert.rejects(memory.rememberUserMessage({ ...message, text: 'Different payload for the same ID.' }), error => error.status === 409);
    const result = await memory.search('concise');
    assert.equal(result.memories[0].id, saved.id); assert.equal(result.memories[0].version, 1);
    const model = mockModel();
    await generateText({ model: memory.withMemory(model), prompt: 'concise reply preference', maxRetries: 0 });
    assert.ok(JSON.stringify(model.doGenerateCalls[0].prompt).includes(saved.id));
    checks.push(`${name}: real SDK retrieval and middleware`);
    const reader = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: readKey, userId: 'alice', fetch: transport });
    assert.equal((await reader.get(saved.id)).memories[0].id, saved.id);
    await assert.rejects(reader.rememberUserMessage({ ...message, requestId: 'read-cannot-write' }), error => error.status === 403);
    const other = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: bobKey, userId: 'bob', fetch: transport });
    await assert.rejects(other.get(saved.id), error => error.status === 403 || error.status === 404);
    const forged = createSixteenMemory({ baseUrl: 'https://memory.example', apiKey: bobKey, userId: 'alice', fetch: transport });
    await assert.rejects(forged.search('concise'), error => error.status === 403 || error.status === 404);
    checks.push(`${name}: server-enforced read/write and cross-user boundaries`);
    const sdk = new SixteenMemory({ baseUrl: 'https://memory.example', apiKey: writeKey, fetch: transport });
    let updated = await sdk.update(saved.id, { content: 'I now prefer detailed replies.', source: { type: 'conversation', ref: 'synthetic-update', text: 'I now prefer detailed replies.', observed_at: '2026-11-02T08:00:00Z' }, expires_at: null, expected_version: saved.version, reason: 'Explicit user correction' });
    assert.equal((await memory.get(saved.id)).memories[0].version, updated.version);
    await sdk.revoke(saved.id, updated.version, 'Explicit test deactivation');
    assert.equal((await memory.search('detailed')).context, '');
    await assert.rejects(memory.get(saved.id), error => error.code === 'memory_unavailable');
    updated = await sdk.get(saved.id);
    await sdk.delete(saved.id, updated.version);
    await assert.rejects(memory.get(saved.id), error => error.status === 404);
    await assert.rejects(memory.rememberUserMessage(message), error => error.status === 410);
    checks.push(`${name}: updates, deactivation, deletion and no stale cache`);
  }
  assert.equal(providerCalls, 0);
  console.log(JSON.stringify({ status: 'passed', checks, provider_calls: providerCalls, real_model_calls: 0, production_requests: 0 }, null, 2));
} finally {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
}
