import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const file = new URL("../.dev.vars", import.meta.url);
let created = false;
try {
  const existing = await readFile(file, "utf8");
  if (process.argv.includes("--rotate")) {
    if (!/^ADMIN_KEY=.*$/m.test(existing)) throw new Error("ADMIN_KEY is missing; existing configuration was not changed.");
    await writeFile(file, existing.replace(/^ADMIN_KEY=.*$/m, `ADMIN_KEY=${randomBytes(32).toString("hex")}`), { mode: 0o600 });
    created = true;
  }
}
catch (error) {
  if (error.code !== "ENOENT") throw error;
  await writeFile(file, `ADMIN_KEY=${randomBytes(32).toString("hex")}\n`, { mode: 0o600, flag: "wx" });
  created = true;
}
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
console.log(`${created ? "Created" : "Using"} local-only administrator credential: ${fileURLToPath(file)}`);
