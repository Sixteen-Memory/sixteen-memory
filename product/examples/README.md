# Examples

**Start with synthetic data before connecting real business records.**

[Setup guide](../../docs/QUICKSTART.md) · [SDK](../sdk/README.md)

| Example | Flow | Model calls |
| :--- | :--- | :--- |
| [customer-continuity.mjs](customer-continuity.mjs) | Write → search → update → history → delete the synthetic record | Not required |
| [intelligent-continuity.mjs](intelligent-continuity.mjs) | Conversation ingestion, candidate maintenance, and intelligent retrieval | Configuration and authorization required |

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
