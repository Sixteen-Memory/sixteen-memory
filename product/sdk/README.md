# JavaScript SDK

**A source client with no runtime dependencies.**

[Local setup](../../docs/QUICKSTART.md) · [Examples](../examples/README.md) · [Source](index.mjs)

This is not a published npm package. Import it from a Node.js module at the repository root:

```js
import { SixteenMemory, MemoryApiError } from "./product/sdk/index.mjs";

const memory = new SixteenMemory({
  baseUrl: "http://127.0.0.1:8790",
  apiKey: process.env.SIXTEEN_API_KEY,
  timeoutMs: 15_000,
});
```

The website also provides the same client source for download; adjust the import path when using that file. Call from your application server. Webpages must not hold administrator or provider keys.

## Method groups

| Group | Methods | Boundary |
| :--- | :--- | :--- |
| Core memory | `add`, `get`, `list`, `search` | Search defaults to lexical mode and the key's permitted scope |
| Changes and management | `update`, `history`, `revoke`, `delete`, `exportPage` | Updates and deletions need the current version; callers paginate exports |
| Answers | `answer` | The target service needs a configured model; calls may incur costs |
| Development intelligent paths | `ingest`, `ingestion`, `ingestions`, `resolveIngestion`, `evidence`, `reindex` | A method's presence does not mean it is deployed |

## Error handling

Service failures throw `MemoryApiError`, preserving `status` and `code`. Network failures and timeouts may throw native exceptions instead; do not treat every exception as a business error.

```js
try {
  await memory.search({ user_id: "example-user", query: "communication preferences" });
} catch (error) {
  if (error instanceof MemoryApiError) {
    console.error(error.status, error.code);
  } else {
    throw error;
  }
}
```

The client does not automatically retry writes. Use request IDs, versions, and the failure type to decide what to do next. Do not log credentials or unsanitized memory content.
