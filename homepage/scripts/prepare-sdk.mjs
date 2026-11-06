import { mkdir, copyFile, writeFile } from "node:fs/promises";

// Ship the existing client, not a second hand-maintained SDK implementation.
const source = new URL("../../product/sdk/index.mjs", import.meta.url);
const downloads = new URL("../public/downloads/", import.meta.url);
await mkdir(downloads, { recursive: true });
await copyFile(source, new URL("sixteen-memory-sdk.mjs", downloads));
await writeFile(new URL("README.txt", downloads), `SixteenMemory JavaScript SDK — source preview

Source: product/sdk/index.mjs in this project.
No runtime dependencies. Use Node.js 20+ with a server-side API key.
Save sixteen-memory-sdk.mjs beside the example that imports it.
Base URL: https://console.sixteenmemory.com
Quickstart: https://console.sixteenmemory.com/quickstart

The online v0.1 API supports explicit-memory lifecycle operations.
The source also contains experimental ingestion, evidence and reindex methods;
those methods are not enabled on the online v0.1 deployment.
MCP is planned, not an available server.
Never include keys in browser code, URLs or public repositories.
`);
console.log("Prepared existing SDK source for download.");
