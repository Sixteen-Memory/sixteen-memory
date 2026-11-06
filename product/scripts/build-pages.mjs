import { cp, mkdir } from "node:fs/promises";
await mkdir(new URL("../dist-pages/", import.meta.url), { recursive: true });
await cp(new URL("../dist/", import.meta.url), new URL("../dist-pages/", import.meta.url), { recursive: true });
await cp(new URL("../pages/_worker.js", import.meta.url), new URL("../dist-pages/_worker.js", import.meta.url));
console.log("Pages assets prepared; no deployment performed.");
