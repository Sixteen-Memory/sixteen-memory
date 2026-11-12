import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { clientConfig } from "./config.mjs";

// Optional native parser check. No model, key, user config or live service needed.
const root = await mkdtemp(join(tmpdir(), "sixteen-native-config-"));
const options = { baseUrl: "http://127.0.0.1:1" };
const run = promisify(execFile);
try {
  const codexHome = join(root, "codex");
  const claudeHome = join(root, "claude");
  const project = join(root, "project");
  for (const path of [codexHome, claudeHome, project]) await mkdir(path);
  await writeFile(join(codexHome, "config.toml"), clientConfig("codex", options));
  await writeFile(join(project, ".mcp.json"), clientConfig("claude-code", options));
  const env = { PATH: process.env.PATH, HOME: root, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome,
    DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    SIXTEEN_MEMORY_API_KEY: "synthetic-unused-key-01234567890123456789" };
  const codex = await run(process.env.CODEX_BIN || "codex", ["mcp", "get", "sixteen-memory", "--json"],
    { cwd: root, env, timeout: 15000, maxBuffer: 16384 });
  const parsed = JSON.parse(codex.stdout);
  assert.equal(parsed.transport.url, options.baseUrl + "/v1/mcp");
  assert.equal(parsed.transport.bearer_token_env_var, "SIXTEEN_MEMORY_API_KEY");
  const claude = await run(process.env.CLAUDE_BIN || "claude", ["mcp", "get", "sixteen-memory"],
    { cwd: project, env, timeout: 15000, maxBuffer: 16384 });
  assert.match(claude.stdout, /sixteen-memory/);
  assert.match(claude.stdout, /http/i);
  assert.match(claude.stdout, /Pending approval/i);
  console.log(JSON.stringify({ status: "passed", codex_config_parsed: true, claude_config_parsed: true,
    claude_project_approval_preserved: true, model_calls: 0, user_config_changed: false }));
} finally { await rm(root, { recursive: true, force: true }); }
