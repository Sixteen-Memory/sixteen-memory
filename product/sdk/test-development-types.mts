import { SixteenMemory } from "./index.mjs";
import type { IngestionJob } from "./index.mjs";

const client = new SixteenMemory({ baseUrl: "http://127.0.0.1:8790" });
const found = await client.search({ query: "preference", mode: "hybrid", filter: { field: "category", op: "eq", value: "support" } });
const mode: string = found.retrieval;
const jobs: IngestionJob[] = await client.ingestions("alice");
const indexed: number = (await client.reindex("alice")).indexed;
await client.login("synthetic");
void [mode, jobs, indexed];
const context = await client.context({ user_id: "alice", query: "preference", max_chars: 6000 });
const used: number = context.budget.used;
const review = await client.reviewMemories({ user_id: "alice" });
const changed: 0 = review.changed;
await client.searchEvidence({ user_id: "alice", query: "source quote" });
void [used, changed];
const conversation = await client.createConversation({ user_id: "alice", request_id: "c1", title: "Conversation", messages: [{ id: "m1", role: "user", content: "Hello", observed_at: "2026-11-09T00:00:00Z" }] });
await client.appendConversation(conversation.id, { request_id: "c2", expected_version: conversation.version, messages: [{ id: "m2", role: "assistant", content: "Hi", observed_at: "2026-11-09T00:00:01Z" }] });
const messages: number = (await client.conversation(conversation.id)).messages.length;
const organized = await client.organize({ user_id: "alice", request_id: "k1", conversation_ids: [conversation.id], mode: "review" });
const graphNodes: number = (await client.graph("alice")).nodes.length;
void [messages, organized, graphNodes];
// @ts-expect-error Complete-conversation messages require explicit observed timestamps.
await client.createConversation({ user_id: "alice", request_id: "bad", title: "Bad", messages: [{ id: "m", role: "user", content: "Missing time" }] });
// @ts-expect-error Character budgets are numbers.
await client.context({ user_id: "alice", query: "test", max_chars: "6000" });
// @ts-expect-error New context routes require an explicit user scope.
await client.context({ query: "test" });
// @ts-expect-error Unknown development retrieval mode.
await client.search({ query: "test", mode: "invented" });
// @ts-expect-error Missing input fields must not become any.
await client.ingest({ user_id: "alice" });
