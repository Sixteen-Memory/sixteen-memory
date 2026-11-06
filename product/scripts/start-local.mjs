import { spawn } from "node:child_process";
import { mkdir, open, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function occupied(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
  });
}
for (const port of [4191, 8790]) {
  if (await occupied(port)) throw new Error(`Port ${port} is already in use. Existing processes were not changed.`);
}
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
const log = await open(new URL("../.local/dev.log", import.meta.url), "a", 0o600);
const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  cwd: root, detached: true, stdio: ["ignore", log.fd, log.fd],
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
child.unref();
await writeFile(new URL("../.local/dev.pid", import.meta.url), `${child.pid}\n`, { mode: 0o600 });
await log.close();
console.log(`Local development supervisor started: ${child.pid}. Log: .local/dev.log`);
