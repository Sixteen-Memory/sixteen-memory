/**
 * Explicitly invoked live smoke check. Creates isolated synthetic records and
 * temporary scoped keys, then deletes/revokes only what this run created.
 * Never reads real user collections or invokes model routes.
 */
import assert from "node:assert/strict";
import { readFile, lstat } from "node:fs/promises";
import { SixteenMemory } from "../sdk/index.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

if (process.env.LIVE_VERIFY_APPROVED !== "yes") throw Error("Live synthetic verification requires explicit approval");
const base = new URL(process.env.SIXTEEN_BASE_URL ?? "");
if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw Error("Explicit HTTPS target required");
const credentialPath = process.env.PRODUCTION_ADMIN_FILE;
if (!credentialPath) throw Error("Production credential file path required");
const stat = await lstat(credentialPath);
if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) throw Error("Credential file must be private");
const apiKey = (await readFile(credentialPath, "utf8")).trim();
const admin = new SixteenMemory({ baseUrl: base.href, apiKey, timeoutMs: 25000 });
const user = "release-" + crypto.randomUUID();
const keys = [], memories = [], conversations = [], checks = [];
let client, failure;
try {
  const health = await admin.health(); assert.equal(health.version, "0.3.0");
  assert.equal(health.extraction, "explicit"); assert.equal(health.model_configured, false);
  checks.push("health-030-models-disabled");
  const writer = await admin.createKey({ name: user + "-write", user_id: user, role: "write" }); keys.push(writer.record.id);
  const reader = await admin.createKey({ name: user + "-read", user_id: user, role: "read" }); keys.push(reader.record.id);
  const write = new SixteenMemory({ baseUrl: base.href, apiKey: writer.key, timeoutMs: 25000 });
  const read = new SixteenMemory({ baseUrl: base.href, apiKey: reader.key, timeoutMs: 25000 });
  const memoryInput = { user_id: user, request_id: user + "-memory", content: "Synthetic release preference",
    source: { type: "manual", ref: user, text: "Synthetic EvidenceNeedle. Do not omit the condition.", observed_at: new Date().toISOString() }, expires_at: new Date(Date.now() + 3600000).toISOString() };
  const memory = await write.add(memoryInput); memories.push(memory);
  assert.equal((await write.add(memoryInput)).id, memory.id);
  assert.equal((await read.searchEvidence({ user_id: user, query: "EvidenceNeedle" })).data[0].memory_id, memory.id);
  assert.equal((await read.context({ user_id: user, query: "EvidenceNeedle" })).memories[0].id, memory.id);
  checks.push("memory-evidence-context");
  const input = { user_id: user, request_id: user + "-conversation", title: "Synthetic release check",
    messages: [{ id: "m1", role: "user", content: "Synthetic ConversationNeedle.", observed_at: new Date().toISOString() }],
    expires_at: new Date(Date.now() + 3600000).toISOString() };
  const conversation = await write.createConversation(input); conversations.push(conversation);
  assert.equal((await write.createConversation(input)).id, conversation.id);
  assert.equal((await read.searchConversations({ user_id: user, query: "ConversationNeedle" })).data[0].conversation_id, conversation.id);
  assert.equal((await read.conversation(conversation.id)).messages[0].content, input.messages[0].content);
  await assert.rejects(read.createConversation(input), e => e.status === 403);
  await assert.rejects(read.searchConversations({ user_id: user + "-other", query: "ConversationNeedle" }), e => e.status === 404);
  checks.push("conversation-idempotency-scope-readonly");
  assert.deepEqual((await read.wiki(user)).data, []);
  assert.deepEqual((await read.graph(user)).nodes, []);
  await assert.rejects(write.organize({ user_id: user, request_id: user + "-organize", conversation_ids: [conversation.id] }), e => e.status === 503);
  checks.push("knowledge-disabled-honestly");
  client = new Client({ name: "sixteen-release-check", version: "0.3.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/v1/mcp", base), { requestInit: { headers: { Authorization: "Bearer " + reader.key }, redirect: "error" } });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 7);
  const toolResult = await client.callTool({ name: "search_conversations", arguments: { query: "ConversationNeedle" } });
  assert.equal(JSON.parse(toolResult.content[0].text).data.data[0].conversation_id, conversation.id);
  checks.push("official-mcp-client-live");
} catch (error) {
  failure = error instanceof Error ? (error.code ?? error.name) : "verification_failed";
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => undefined);
  const cleanupErrors = [];
  for (const row of conversations) try { await admin.deleteConversation(row.id, row.version); } catch { cleanupErrors.push("conversation"); }
  for (const row of memories) try { await admin.delete(row.id, row.version); } catch { cleanupErrors.push("memory"); }
  for (const id of keys) try { await admin.revokeKey(id); } catch { cleanupErrors.push("key"); }
  if (cleanupErrors.length) process.exitCode = 1;
  console.log(JSON.stringify({ status: failure || cleanupErrors.length ? "failed" : "passed", failure, checks, synthetic_user: user,
    created: { memories: memories.length, conversations: conversations.length, keys: keys.length },
    cleanup_errors: cleanupErrors, real_model_calls: 0, production_customer_data_read: false }, null, 2));
}
