import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { SixteenMemory, MemoryApiError } from '@sixteen-memory/sdk';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { createChatHandler, createSixteenMemory } from '../dist/index.js';
import { localRuntime } from '../test/local-runtime.mjs';

// No existing database, API key, provider credential or paid model is used.
const runtime = await localRuntime();
const checks = [];
let server;
try {
  for (const version of ['v010', 'v021']) {
    const fetch = await runtime.transport(version);
    const baseUrl = 'https://memory.example';
    const admin = new SixteenMemory({ baseUrl, apiKey: runtime.administrator, fetch });
    const writer = await admin.createKey({ name: 'Alice writer', role: 'write', user_id: 'alice' });
    const bobKey = await admin.createKey({ name: 'Bob writer', role: 'write', user_id: 'bob' });
    const memory = createSixteenMemory({ baseUrl, apiKey: writer.key, userId: 'alice', fetch });
    const sdk = new SixteenMemory({ baseUrl, apiKey: writer.key, fetch });
    const event = { role: 'user', requestId: 'explicit-user-event', ref: 'chat-1', text: 'I prefer concise replies.', observedAt: '2026-11-08T00:00:00Z' };
    const saved = await memory.rememberUserMessage(event);
    assert.equal((await memory.rememberUserMessage(event)).id, saved.id);
    const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
    const evidenceText = prompt => JSON.stringify(prompt).includes(saved.id) ? `Mock: found memory ${saved.id}` : 'Mock: no memory';
    const model = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => ({ content: [{ type: 'text', text: evidenceText(prompt) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }),
      doStream: async ({ prompt }) => ({ stream: simulateReadableStream({
        chunks: [{ type: 'text-start', id: '1' }, { type: 'text-delta', id: '1', delta: evidenceText(prompt) }, { type: 'text-end', id: '1' }, { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage }],
        initialDelayInMs: null, chunkDelayInMs: null,
      }) }),
    });
    // This loopback application has explicit session mapping and per-session quota.
    const sessions = new Map([
      ['Bearer synthetic-alice-session', { userId: 'alice', memoryApiKey: writer.key }],
      ['Bearer synthetic-bob-session', { userId: 'bob', memoryApiKey: bobKey.key }],
    ]);
    const counts = new Map();
    const handler = createChatHandler({
      memoryBaseUrl: baseUrl, memoryFetch: fetch, model, allowedOrigins: ['https://app.example'],
      authenticate: async request => sessions.get(request.headers.get('authorization')) ?? null,
      rateLimit: async (_request, session) => {
        const count = (counts.get(session.userId) ?? 0) + 1; counts.set(session.userId, count);
        return count <= 20;
      },
    });
    server = createServer(async (incoming, outgoing) => {
      const abort = new AbortController();
      incoming.on('aborted', () => abort.abort());
      outgoing.on('close', () => { if (!outgoing.writableEnded) abort.abort(); });
      try {
        const request = new Request('https://app.example' + incoming.url, {
          method: incoming.method, headers: incoming.headers,
          ...(incoming.method === 'GET' ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
          signal: abort.signal,
        });
        const response = await handler(request);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) for await (const chunk of response.body) outgoing.write(chunk);
        outgoing.end();
      } catch { outgoing.destroy(); }
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const chatUrl = `http://127.0.0.1:${server.address().port}/chat`;
    const chat = (message, token = 'alice', stream = false, extra = {}) => globalThis.fetch(chatUrl, {
      method: 'POST', headers: { Authorization: `Bearer synthetic-${token}-session`, 'Content-Type': 'application/json', Origin: 'https://app.example' },
      body: JSON.stringify({ message, stream, ...extra }),
    });
    assert.equal((await chat('concise', 'unknown')).status, 401);
    assert.equal((await chat('concise', 'alice', false, { userId: 'bob' })).status, 400);
    const response = await chat('concise');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).memoryIds, [saved.id]);
    assert.ok((await (await chat('concise', 'alice', true)).text()).includes(saved.id));
    assert.deepEqual((await (await chat('concise', 'bob')).json()).memoryIds, []);
    assert.equal((await sdk.list()).data.length, 1); // Answers were not auto-saved.
    const current = await sdk.get(saved.id);
    const updated = await sdk.update(saved.id, {
      content: 'I prefer detailed replies.', source: { ...current.source, text: 'I prefer detailed replies.' },
      reason: 'Explicit correction', expected_version: current.version,
    });
    await assert.rejects(sdk.delete(saved.id, current.version), error => error instanceof MemoryApiError && error.code === 'version_conflict');
    assert.equal((await sdk.history(saved.id)).length, 2);
    assert.deepEqual((await (await chat('detailed')).json()).memoryIds, [saved.id]);
    const revoked = await sdk.revoke(saved.id, updated.version, 'Explicit deactivation');
    assert.deepEqual((await (await chat('detailed')).json()).memoryIds, []);
    assert.equal((await sdk.exportPage()).data.length, 1);
    await sdk.delete(saved.id, revoked.version);
    assert.deepEqual((await (await chat('detailed')).json()).memoryIds, []);
    await assert.rejects(memory.rememberUserMessage(event), error => error.status === 410);
    const closing = once(server, 'close'); server.close(); server.closeAllConnections(); await closing; server = undefined;
    checks.push({ version, storage: 'real local SQLite', transport: 'HTTP chat -> shared SDK -> Worker', auth: true, idempotency: true, json: true, streaming: true, user_isolation: true, history: true, version_conflict: true, deactivate_delete: true, auto_saved_answers: 0 });
  }
  assert.equal(runtime.outboundCalls(), 0);
  console.log(JSON.stringify({ status: 'passed', checks, provider: 'official AI SDK mock', external_model_calls: 0, production_requests: 0 }, null, 2));
} finally {
  server?.close(); server?.closeAllConnections();
  await runtime.dispose();
}
