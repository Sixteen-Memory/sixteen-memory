import { SixteenMemory, MemoryApiError, type Memory, type Source } from "@sixteen-memory/sdk";

const client = new SixteenMemory({ baseUrl: "https://memory.example", apiKey: "synthetic" });
const source: Source = { type: "manual", ref: "example", text: "Concise replies.", observed_at: "2026-11-01T00:00:00Z" };
const saved: Memory = await client.add({ request_id: "example", user_id: "alice", content: source.text, source });
const result = await client.search({ query: "replies", user_id: "alice", limit: 10 });
await client.search({ query: "replies" }, { signal: new AbortController().signal });
await client.list({});
await client.me();
await client.login("synthetic-console-key");
await client.logout();
const score: number = result.data[0].score;
const cursor: string | null = (await client.list({ status: "all" })).next_cursor;
const history: number = (await client.history(saved.id))[0].version;
await client.update(saved.id, { expected_version: saved.version, reason: "Correction", source, content: "Brief replies.", expires_at: null });
await client.revoke(saved.id, saved.version, "User request");
const removed: false = (await client.delete(saved.id, saved.version)).backup_cleanup_confirmed;
const exported: string = (await client.exportPage()).exported_at;
const key: string = (await client.createKey({ name: "Reader", role: "read", user_id: "alice" })).key;
const error = new MemoryApiError(409, "version_conflict", "Changed");
void [score, cursor, history, removed, exported, key, error];

// @ts-expect-error Source is mandatory.
await client.add({ request_id: "r", user_id: "alice", content: "missing source" });
// @ts-expect-error Concurrency version is mandatory.
await client.update(saved.id, { reason: "Correction", source, content: "Brief." });
// @ts-expect-error Invalid lifecycle status.
await client.list({ status: "deleted" });
// v0.3 client exposes semantic options; server configuration still governs availability.
await client.search({ query: "replies", mode: "semantic" });
// @ts-expect-error Ingestion requires a complete input.
await client.ingest({});
// @ts-expect-error Versions are numbers.
await client.delete(saved.id, "1");
// @ts-expect-error No custom fields on a typed memory.
saved.arbitrary_field;

const all = await client.listAll({ user_id: "alice", filter: { field: "category", op: "eq", value: "support" } });
for await (const page of client.listPages({ user_id: "alice" })) { const records: Memory[] = page.data; void records; }
const conversation = await client.createConversation({ user_id: "alice", request_id: "chat", title: "Chat", messages: [{ id: "m1", role: "user", content: "Hi", observed_at: "2026-11-09T00:00:00Z" }] });
const messages = await client.conversationMessagesAll(conversation.id);
await client.context({ user_id: "alice", query: "preference" });
void [all, messages];
