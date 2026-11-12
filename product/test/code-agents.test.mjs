import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { clientConfig, connectionOptions } from "../integrations/code-agents/config.mjs";
import { checkConnection } from "../integrations/code-agents/check.mjs";

const baseUrl = "https://memory.example";
test("native client configurations reference environment keys, never their values", () => {
  const codex = clientConfig("codex", { baseUrl });
  assert.equal(codex, '[mcp_servers.sixteen-memory]\nurl = "https://memory.example/v1/mcp"\nbearer_token_env_var = "SIXTEEN_MEMORY_API_KEY"\n');
  const claude = JSON.parse(clientConfig("claude-code", { baseUrl, keyEnv: "MY_MEMORY_KEY" }));
  assert.deepEqual(claude, { mcpServers: { "sixteen-memory": {
    type: "http", url: baseUrl + "/v1/mcp", headers: { Authorization: "Bearer ${MY_MEMORY_KEY}" },
  } } });
  const key = "never-print-this-secret-0123456789012345";
  const stdout = execFileSync(process.execPath, ["integrations/code-agents/cli.mjs", "config", "claude-code", "--base-url", baseUrl],
    { env: { ...process.env, SIXTEEN_MEMORY_API_KEY: key }, encoding: "utf8" });
  assert.ok(!stdout.includes(key));
  assert.equal(JSON.parse(stdout).mcpServers["sixteen-memory"].type, "http");
});
test("configuration refuses unsafe origins and injected values", () => {
  for (const url of ["http://memory.example", "https://user:password@memory.example", baseUrl + "/v1/mcp",
    baseUrl + "?token=secret", baseUrl + "#secret", "file:///tmp/mcp", "https://${HOST}", baseUrl + "\n", "https:\\\\memory.example"]) {
    assert.throws(() => connectionOptions({ baseUrl: url }), undefined, url);
  }
  for (const keyEnv of ["", "TOKEN\ninjected", "TOKEN}", "TOKEN=value"]) {
    assert.throws(() => connectionOptions({ baseUrl, keyEnv }));
  }
  for (const url of ["http://localhost:8790", "http://127.0.0.1:8790/", "http://[::1]:8790"]) {
    assert.match(connectionOptions({ baseUrl: url }).endpoint, /\/v1\/mcp$/);
  }
  assert.throws(() => clientConfig("unknown", { baseUrl }), /unsupported_client/);
});
test("check needs a read-only key and refuses redirects without accessing tools", async () => {
  let calls = 0;
  await assert.rejects(checkConnection({ baseUrl }, { env: {}, fetch: async () => { calls++; } }), /missing_key/);
  assert.equal(calls, 0);
  const env = { SIXTEEN_MEMORY_API_KEY: "synthetic-key-012345678901234567890123" };
  for (const role of ["admin", "write"]) {
    await assert.rejects(checkConnection({ baseUrl }, { env, fetch: async () => {
      calls++; return Response.json({ role, user_id: "test" });
    } }), /read_only_scoped_key_required/);
  }
  let redirects = 0;
  await assert.rejects(checkConnection({ baseUrl }, { env, fetch: async (_url, init) => {
    redirects++; assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://other.example" } });
  } }), error => error.code === "redirect_denied");
  assert.equal(redirects, 1);
});
test("CLI errors omit malicious argument values and secrets", () => {
  const secret = "PRIVATE_SENTINEL_01234567890123456789";
  try {
    execFileSync(process.execPath, ["integrations/code-agents/cli.mjs", "--" + secret], { encoding: "utf8", stdio: "pipe" });
    assert.fail("expected CLI failure");
  } catch (error) {
    assert.equal(error.status, 1); assert.equal(error.stdout, "");
    assert.ok(!error.stderr.includes(secret));
    assert.match(error.stderr, /No client configuration was changed/);
  }
});
