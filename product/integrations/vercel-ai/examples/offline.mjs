/** Run `npm run example` here. No credentials, external service, or paid model required. */
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createSixteenMemory } from '../dist/index.js';

const records = [];
const memory = createSixteenMemory({
  baseUrl: 'https://example.invalid',
  apiKey: 'synthetic-offline-key-not-a-live-credential',
  userId: 'demo-user',
  fetch: async (url, init) => {
    const input = JSON.parse(init.body);
    if (new URL(url).pathname === '/v1/memories') {
      const record = { ...input, id: 'demo-memory', version: 1, status: 'active' };
      records.push(record); return Response.json(record);
    }
    return Response.json({ data: records.filter(record => record.user_id === input.user_id) });
  },
});
await memory.rememberUserMessage({
  role: 'user', requestId: 'demo-message-1', ref: 'demo-chat',
  text: 'I prefer concise replies.', observedAt: '2026-11-08T00:00:00Z',
});
const model = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => ({
  content: [{ type: 'text', text: JSON.stringify(prompt).includes('demo-memory') ? 'Fixture: retrieved the saved preference.' : 'Fixture: no memory context.' }],
  finishReason: { unified: 'stop', raw: undefined },
  usage: { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } },
  warnings: [],
}) });
const result = await generateText({ model: memory.withMemory(model), prompt: 'How should you reply?', maxRetries: 0 });
console.log(result.text);
console.log('Official AI SDK mock model; no real-model quality or cost claim.');
