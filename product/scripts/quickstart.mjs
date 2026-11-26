import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const productDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(join(productDir, ".dev.vars"))) {
  execFileSync(process.execPath, [join(productDir, "scripts/prepare-local.mjs")], {
    cwd: productDir,
    stdio: "inherit",
  });
}

if (!existsSync(join(productDir, "dist-worker/index.js"))) {
  execFileSync(npmCmd, ["run", "build"], {
    cwd: productDir,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
}

console.log("\nStarting SixteenMemory locally:");
console.log("  Console : http://127.0.0.1:4191");
console.log("  API     : http://127.0.0.1:8790  (Health: /health)");
console.log("  Admin   : read ADMIN_KEY from product/.dev.vars (mode 0600, Git-ignored)\n");

const child = spawn(process.execPath, [join(productDir, "scripts/dev.mjs")], {
  cwd: productDir,
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
