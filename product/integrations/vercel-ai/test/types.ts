import { generateText, streamText, wrapLanguageModel } from 'ai';
import type { ToolSet } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createSixteenMemory } from '../dist/index.js';

const memory = createSixteenMemory({ baseUrl: 'https://example.invalid', apiKey: 'synthetic-unused-key-for-typechecking', userId: 'test-user' });
const tools: ToolSet = memory.tools;
const model = new MockLanguageModelV4();
// Compile-only interoperability checks; this file is never executed.
void generateText({ model: memory.withMemory(model), tools, prompt: 'Hello', maxRetries: 0 });
void streamText({ model: wrapLanguageModel({ model, middleware: memory.middleware }), prompt: 'Hello', maxRetries: 0 });
void memory.rememberUserMessage({ role: 'user', text: 'A preference', requestId: 'req-1', ref: 'chat-1', observedAt: '2026-11-08T00:00:00Z' });
// @ts-expect-error An assistant response is not an accepted write source.
void memory.rememberUserMessage({ role: 'assistant', text: 'Done', requestId: 'req-1', ref: 'chat-1', observedAt: '2026-11-08T00:00:00Z' });
// @ts-expect-error Scope is configuration-owned, not an input to search.
void memory.search('query', { userId: 'another-user' });
