# Provider policy

Public-product target providers: OpenAI GPT and Alibaba Qwen. **Semantic retrieval
embeddings use Alibaba Qwen only.** Model IDs and public
endpoints must remain operator-configured; do not bake an internal gateway or
historical test deployment name into frontend, Worker, Pages or defaults.

## Local test boundary

The user authorized a particular existing Memory-listed model for **local testing
only** on November 4, 2026. Its configuration lives in `.local/`; credentials are
read at runtime from the existing private source, never copied. The generic
`eval/private-provider-pilot.mjs` adapter is not imported by production code.
Synthetic records, test receipts and model responses stay local. No production
deployment, secret update, shared-gateway reconfiguration or public upload occurs.

The dedicated local adapter pins the actual response model, disallows retries and
redirects, imposes a request ceiling and routes Worker calls using a placeholder
domain/name. It never uses a shared gateway's automatic model fallback.

## Generic compatibility controls

Configuration may specify:

- `EXTRACTION_TOKEN_PARAMETER` / `MODEL_TOKEN_PARAMETER`:
  `max_tokens` (current compatibility default) or `max_completion_tokens`.
- `EXTRACTION_THINKING` / `MODEL_THINKING`: absent by default; `enabled` or
  `disabled` explicitly sends `enable_thinking` for providers which support it.
- Temperature is omitted by default. Some reasoning model configurations reject
  a forced zero. Omission is not a claim of deterministic generation.

These are operator-selected capabilities, not model-name guessing. Configure only
parameters supported by the chosen provider/model. Do not send Qwen-specific
thinking fields to OpenAI by default.

Public provider URLs and credential regions must match the account. Current Ali
documentation describes workspace/region-specific compatible endpoints; use the
account's actual endpoint instead of assuming an old generic address.

An OpenAI-compatible adapter is not proof that every GPT/Qwen model has been
tested. Qwen and real embeddings have not been tested in this project. Text GPT
generation is not an embedding service.

## Qwen embedding profile

- Default provider label: `qwen`; default disabled.
- Default dimension: 1024. Operator may choose a dimension supported by the actual
  configured Qwen embedding model, up to this product's 2048-dimensional limit.
- OpenAI-compatible mode sends `/embeddings`, `dimensions` and float output.
- Optional DashScope-native mode uses dense vectors and sends `text_type=query`
  for searches, `text_type=document` for stored memories/reindexing. Compatible
  mode does not invent an undocumented `text_type` field or modify text to imitate
  an instruction.
- Provider/model/API style/dimension/revision all enter the index fingerprint.
  Any change makes old coverage incomplete until an explicit batch reindex.
- The service rejects the wrong returned dimension. It never silently truncates,
  pads or mixes vectors.

The base URL is workspace- and region-specific and stays operator-configured.
The project contains no Alibaba workspace ID, API key or concrete production model.
