import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = await mkdtemp(join(tmpdir(), "sixteen-sdk-consumer-"));
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
try {
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
    cwd: new URL("../sdk/", import.meta.url), encoding: "utf8",
  }));
  assert.deepEqual(pack.files.map(file => file.path).sort(), ["LICENSE", "README.md", "client.d.mts", "client.mjs", "openapi.json", "package.json", "schema.d.ts", "service-types.d.ts"]);
  await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(directory, pack.filename)], { cwd: directory, stdio: "pipe" });
  await writeFile(join(directory, "consumer.mts"), await readFile(new URL("../sdk/test-types.mts", import.meta.url)));
  for (const flags of [["--module", "NodeNext", "--moduleResolution", "NodeNext"], ["--module", "ESNext", "--moduleResolution", "Bundler"]]) {
    execFileSync(process.execPath, [tsc, "--noEmit", "--strict", "--target", "ES2022", ...flags, "consumer.mts"], { cwd: directory, stdio: "pipe" });
  }
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { SixteenMemory, MemoryApiError } from "@sixteen-memory/sdk";
    const client = new SixteenMemory({ baseUrl: "https://memory.example", fetch: async () => Response.json({status: "ok"}) });
    assert.equal((await client.health()).status, "ok");
    assert.equal(typeof client.ingest, "function"); assert.equal(typeof client.context, "function"); assert.equal(typeof client.listAll, "function");
    assert.equal(new MemoryApiError(409, "conflict", "Changed").status, 409);
  `], { cwd: directory, stdio: "pipe" });
  console.log("SDK archive: allowlisted files only; clean offline install; NodeNext/Bundler types and ESM import passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
