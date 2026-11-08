import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateReadableStream } from 'ai/test';
import { createChatHandler } from '../dist/index.js';
import { fixtureFetch, mockModel, options, usage } from './helpers.mjs';

const request = (body, extra = {}) => new Request('https://app.example/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer app-session', Origin: 'https://app.example' },
  body: JSON.stringify(body), ...extra,
});
function setup(extra = {}) {
  const fixture = fixtureFetch();
  const model = mockModel();
  const handler = createChatHandler({
    memoryBaseUrl: options.baseUrl, model, memoryFetch: fixture.fetch,
    allowedOrigins: ['https://app.example'],
    authenticate: async req => req.headers.get('Authorization') === 'Bearer app-session' ? { userId: 'alice', memoryApiKey: options.apiKey } : null,
    rateLimit: async () => true, ...extra,
  });
  return { fixture, model, handler };
}
test('authenticated chat uses shared SDK, returns citations and does not auto-save', async () => {
  const { handler, fixture, model } = setup();
  const response = await handler(request({ message: 'concise' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { text: 'Fixture answer', memoryIds: ['memory-1'] });
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].pathname, '/v1/search');
  assert.ok(JSON.stringify(model.doGenerateCalls[0].prompt).includes('memory-1'));
});
test('method, authentication, origin, quota and spoofed scope fail before retrieval', async () => {
  for (const [extra, req, status] of [
    [{}, new Request('https://app.example/chat'), 405],
    [{ authenticate: async () => null }, request({ message: 'test' }), 401],
    [{}, request({ message: 'test' }, { headers: { Origin: 'https://other.example' } }), 403],
    [{ rateLimit: async () => false }, request({ message: 'test' }), 429],
    [{}, request({ message: 'test', userId: 'bob' }), 400],
    [{}, request({ message: 'test', stream: 'yes' }), 400],
    [{}, request({ message: 'test' }, { headers: { Authorization: 'Bearer app-session' } }), 415],
    [{}, request({ message: 'x'.repeat(66000) }), 413],
  ]) {
    const { handler, fixture, model } = setup(extra);
    assert.equal((await handler(req)).status, status);
    assert.equal(fixture.requests.length, 0); assert.equal(model.doGenerateCalls.length, 0);
  }
});
test('streaming keeps output and memory context while failures are sanitized', async () => {
  const model = mockModel({ doStream: async () => ({ stream: simulateReadableStream({
    chunks: [{ type: 'text-start', id: '1' }, { type: 'text-delta', id: '1', delta: 'Streamed response' }, { type: 'text-end', id: '1' }, { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage }],
    initialDelayInMs: null, chunkDelayInMs: null,
  }) }) });
  const { handler } = setup({ model });
  assert.equal(await (await handler(request({ message: 'concise', stream: true }))).text(), 'Streamed response');
  assert.ok(JSON.stringify(model.doStreamCalls[0].prompt).includes('memory-1'));
  const failed = setup({ memoryFetch: async () => new Response('private body', { status: 503 }) });
  const response = await failed.handler(request({ message: 'test', stream: true }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'http_error' } });
  assert.equal(failed.model.doGenerateCalls.length, 0);
});
test('cancellation and malformed JSON do not call a model', async () => {
  const { handler, model } = setup();
  const controller = new AbortController(); controller.abort();
  assert.equal((await handler(request({ message: 'test' }, { signal: controller.signal }))).status, 499);
  assert.equal((await handler(request({}, { body: 'invalid' }))).status, 400);
  assert.equal(model.doGenerateCalls.length, 0);
});
test('midstream provider failure fails the body without exposing the raw cause', async () => {
  const model = mockModel({ doStream: async () => ({ stream: simulateReadableStream({
    chunks: [{ type: 'error', error: new Error('private provider credential') }],
    initialDelayInMs: null, chunkDelayInMs: null,
  }) }) });
  const response = await setup({ model }).handler(request({ message: 'test', stream: true }));
  await assert.rejects(response.text(), error => error.message === 'generation_failed');
});
