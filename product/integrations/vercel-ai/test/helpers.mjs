import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';

export const key = 'synthetic-scoped-key-for-offline-tests-123';
export const options = { baseUrl: 'https://memory.example', apiKey: key, userId: 'alice' };
export const record = (overrides = {}) => ({
  id: 'memory-1', user_id: 'alice', content: 'The user prefers concise replies.',
  source: { type: 'conversation', ref: 'synthetic-1', text: 'Please keep replies concise.', observed_at: '2026-11-01T08:00:00Z' },
  version: 1, status: 'active', expires_at: null, ...overrides,
});
export const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
export const answer = (text = 'Fixture answer') => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] });
export const mockModel = (settings = {}) => new MockLanguageModelV4({ doGenerate: answer(), ...settings });
export const toolOptions = { toolCallId: 'fixture-call', messages: [], context: undefined };
export function fixtureFetch(rows = [record()]) {
  const requests = [];
  const transport = async (url, init) => {
    const pathname = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ pathname, body, init });
    assert.equal(init.headers.Authorization, `Bearer ${key}`);
    assert.equal(init.redirect, 'manual');
    if (pathname === '/v1/search') {
      assert.equal(body.mode, undefined); // The documented API defaults to lexical retrieval.
      return Response.json({ data: rows.filter(row => row.user_id === body.user_id) });
    }
    if (pathname === '/v1/memories' && init.method === 'POST') {
      const value = record({ ...body, id: 'saved-record' });
      rows.push(value);
      return Response.json(value);
    }
    const id = pathname.split('/').pop();
    const value = rows.find(row => row.id === id);
    return value ? Response.json(value) : Response.json({ error: { code: 'not_found' } }, { status: 404 });
  };
  return { fetch: transport, requests, rows };
}
