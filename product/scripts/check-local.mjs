import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SixteenMemory } from "../sdk/index.mjs";

const key = (await readFile(new URL("../.dev.vars", import.meta.url), "utf8")).split("\n").find(line => line.startsWith("ADMIN_KEY=")).slice(10);
const base = "http://127.0.0.1:8790";
const client = new SixteenMemory({ baseUrl: base, apiKey: key });
for (const path of ["/.dev.vars", "/.local/dev.log", "/@fs" + new URL("../.dev.vars", import.meta.url).pathname]) {
  const response = await fetch("http://127.0.0.1:4191" + path);
  assert.ok([403, 404].includes(response.status), `Sensitive path exposed: ${path}`);
}
const user = "local-visual-fixture";
const existing = await client.list({ user_id: user });
for (const row of existing.data) await client.delete(row.id, row.version);
if (process.argv.includes("--clear")) {
  console.log("Local visual fixtures removed.");
} else {
  for (const [ref, content, type] of [
    ["synthetic-case-101", "合成验收：设备已重启，网络配置恢复后问题解决。", "business"],
    ["synthetic-session-102", "合成验收：后续沟通使用中文，处理进展需提供来源。", "conversation"],
    ["synthetic-note-103", "合成验收：当前处理状态需要业务事件确认。", "manual"],
  ]) {
    const row = await client.add({
      request_id: crypto.randomUUID(), user_id: user, content,
      source: { type, ref, text: content, observed_at: new Date().toISOString() }, expires_at: null,
    });
    assert.equal(row.content, content);
  }
  const response = await fetch("http://127.0.0.1:4191/v1/session", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:4191" },
    body: JSON.stringify({ api_key: key }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie").split(";")[0];
  const me = await fetch("http://127.0.0.1:4191/v1/me", { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  const bad = await fetch("http://127.0.0.1:4191/v1/session", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ api_key: key }),
  });
  assert.equal(bad.status, 403);
  await fetch("http://127.0.0.1:4191/v1/session", { method: "DELETE", headers: { Cookie: cookie, Origin: "http://127.0.0.1:4191" } });
  console.log("PASS: local SDK fixtures and same-origin development proxy; no cloud/model calls.");
}
