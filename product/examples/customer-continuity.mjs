import { SixteenMemory } from "../sdk/index.mjs";

const baseUrl = process.env.SIXTEEN_BASE_URL ?? "http://127.0.0.1:8790";
const apiKey = process.env.SIXTEEN_API_KEY;
const userId = process.env.SIXTEEN_USER_ID ?? "example-user";
if (!apiKey) throw new Error("Set SIXTEEN_API_KEY to a write key scoped to SIXTEEN_USER_ID.");
const memory = new SixteenMemory({ baseUrl, apiKey });
const evidence = (text) => ({
  type: "business", ref: "synthetic-ticket-1", text, observed_at: new Date().toISOString(),
});
let entry = await memory.add({
  request_id: crypto.randomUUID(), user_id: userId,
  content: "设备已重启，问题仍存在，等待网络排查。",
  source: evidence("重启完成。问题仍在，下一步排查网络。"), expires_at: null,
});
try {
  console.log("New session:", await memory.search({ user_id: userId, query: "设备 网络" }));
  entry = await memory.update(entry.id, {
    content: "网络配置已恢复，问题解决。", source: evidence("网络配置恢复，客户确认问题解决。"),
    expires_at: null, expected_version: entry.version, reason: "收到业务确认",
  });
  console.log("Current:", await memory.search({ user_id: userId, query: "问题解决" }));
  console.log("History:", await memory.history(entry.id));
} finally {
  console.log("Cleanup:", await memory.delete(entry.id, entry.version));
}
