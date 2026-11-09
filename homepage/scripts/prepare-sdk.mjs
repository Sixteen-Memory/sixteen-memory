import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const sdk = new URL("../../product/sdk/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", sdk)));
const { info: { version: apiVersion } } = JSON.parse(await readFile(new URL("openapi.json", sdk)));
const downloads = new URL("../public/downloads/", import.meta.url);
await mkdir(downloads, { recursive: true });
// Keep the original single-file download working, including candidate methods.
await build({
  entryPoints: [fileURLToPath(new URL("index.mjs", sdk))],
  outfile: fileURLToPath(new URL("sixteen-memory-sdk.mjs", downloads)),
  bundle: true, format: "esm", platform: "neutral", target: "es2022",
});
for (const [source, target] of [
  ["client.mjs", "sixteen-memory-client.mjs"],
  ["client.d.mts", "sixteen-memory-client.d.mts"],
  ["service-types.d.ts", "service-types.d.ts"],
  ["schema.d.ts", "schema.d.ts"], ["openapi.json", "openapi.json"],
]) await copyFile(new URL(source, sdk), new URL(target, downloads));
const [{ filename }] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", fileURLToPath(downloads)], { cwd: sdk, encoding: "utf8" }));
const files = ["sixteen-memory-sdk.mjs", "sixteen-memory-client.mjs", "sixteen-memory-client.d.mts", "schema.d.ts", "service-types.d.ts", "openapi.json", filename];
const adapter = new URL("../../product/integrations/vercel-ai/", import.meta.url);
const [{ filename: adapterFile }] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", fileURLToPath(downloads)], { cwd: adapter, encoding: "utf8" }));
const pythonWheel = "sixteen_memory-0.3.1-py3-none-any.whl";
await copyFile(new URL("../../product/sdk-python/dist/" + pythonWheel, import.meta.url), new URL(pythonWheel, downloads));
const extraFiles = [adapterFile, pythonWheel];
for (const [source, target] of [
  ["../../product/examples/lifecycle.mjs", "lifecycle.mjs"],
  ["../../product/examples/lifecycle.py", "lifecycle.py"],
  ["../../product/examples/async-lifecycle.py", "async-lifecycle.py"],
  ["../../product/integrations/vercel-ai/examples/lifecycle.mjs", "vercel-lifecycle.mjs"],
  ["../../product/sdk/README.md", "javascript-guide.md"],
  ["../../product/sdk-python/README.md", "python-guide.md"],
  ["../../product/integrations/vercel-ai/README.md", "vercel-guide.md"],
]) { await copyFile(new URL(source, import.meta.url), new URL(target, downloads)); extraFiles.push(target); }
files.push(...extraFiles);
const sha256 = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(new URL(file, downloads))).digest("hex")])));
await writeFile(new URL("manifest.json", downloads), JSON.stringify({ sdk_version: version, api_version: apiVersion, package: filename, adapter_package: adapterFile, python_wheel: pythonWheel, sha256 }, null, 2) + "\n");
await writeFile(new URL("README.txt", downloads), `SixteenMemory typed SDK ${version}

Install the downloadable package from your server-side application:
npm install https://www.sixteenmemory.com/downloads/${filename}
import { SixteenMemory } from "@sixteen-memory/sdk";

No runtime dependencies. Node.js 20.3+. ESM JavaScript and TypeScript.
The package includes generated API types and OpenAPI 3.1.
It is distributed here, not published to the npm registry.
Base URL: https://console.sixteenmemory.com
OpenAPI: https://www.sixteenmemory.com/downloads/openapi.json
Docs: https://www.sixteenmemory.com/docs/

For direct ESM imports, keep sixteen-memory-client.mjs,
sixteen-memory-client.d.mts, service-types.d.ts and schema.d.ts together.
The old sixteen-memory-sdk.mjs URL remains a legacy source download.
The SDK includes v0.3 methods, async pagination and sanitized transport errors.
The generated OpenAPI currently describes the core v0.1 subset only; standalone
service-types.d.ts describes newer methods. Server models remain disabled.
Python 0.3.1 and Vercel AI 0.3.0 archives and lifecycle examples are included.
No packages are published to npm/PyPI. Read the guides before installing.
Provider-dependent operations require explicit server enablement and may cost money.
manifest.json records SHA-256 hashes of all release artifacts.
Never include keys in browser code, URLs or public repositories.
`);
console.log("Prepared typed SDK, OpenAPI and legacy source downloads.");
