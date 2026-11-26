# Examples

**Start with synthetic data before connecting real business records.**

[Setup guide](../../docs/QUICKSTART.md) · [SDK](../sdk/README.md)

| Example | Flow | Model calls |
| :--- | :--- | :--- |
| [incremental-wiki-demo.mjs](incremental-wiki-demo.mjs) | Self-contained 5-second demo: source-linked memories → selective Wiki invalidation → conflict review → live MCP read (`npm run demo`) | Not required (deterministic local fixture) |
| [customer-continuity.mjs](customer-continuity.mjs) | Write → search → update → history → delete the synthetic record | Not required |
| [intelligent-continuity.mjs](intelligent-continuity.mjs) | Conversation ingestion, candidate maintenance, and intelligent retrieval | Configuration and authorization required |
| [media-to-memory.mjs](media-to-memory.mjs) | Local WAV/MP3/MP4 clip → reviewable, source-linked memory candidates | Media provider configuration, consent and authorization required |
| [media-to-memory.py](media-to-memory.py) | Same flow through Python sync or native async | Same explicit provider and consent requirements |

## Basic example

Start the local product and set a user-scoped key in the terminal environment. Do not commit it to a file.

```sh
# SIXTEEN_API_KEY is already set.
export SIXTEEN_BASE_URL=http://127.0.0.1:8790
export SIXTEEN_USER_ID=example-user
npm run example:basic
```

Run from the repository root. The example deletes its synthetic record when finished. Use only a local or explicitly approved test environment, with a user scope matching the key. Existing multilingual sample content is retained to exercise multilingual memory behavior.

## Intelligent examples are not the default first step

Check the target service's capabilities, then confirm the provider, data-sharing scope, and costs. Ordinary builds, README previews, and basic integration do not need these calls. Do not bypass configuration errors to force a model request.

`media-to-memory.mjs` and `.py` are bounded inline examples (2 MiB local
example cap; the service permits 7 MiB). For 30-minute files up to 500 MiB use
[upload-meeting.mjs](upload-meeting.mjs) or [upload-meeting.py](upload-meeting.py).
They upload in 8 MiB parts and return a background job, not completed memories.
See [Anything to Memory](../ANYTHING_TO_MEMORY.md) for configuration, approval,
idempotency and retention. All examples require explicitly authorized media.

## Framework integration

For AI SDK 7 middleware and tools, see the [Vercel AI SDK adapter](../integrations/vercel-ai/README.md). It has its own lockfile and does not change the basic examples above.
