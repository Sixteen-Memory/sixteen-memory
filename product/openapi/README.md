# OpenAPI

[SDK](../sdk/README.md) | [Documentation](../../docs/README.md)

`document.mjs` describes the deployed v0.1.0 API. `openapi.json` is its generated
OpenAPI 3.1 document. `generate.mjs` validates it with Swagger Parser and creates
TypeScript schemas with openapi-typescript. Only build-time dependencies are
added, in this directory's independent lockfile.

```sh
npm ci
npm run generate
npm test
```

`npm test` detects stale generated files, validates successful requests and
responses against the actual v0.1 Worker fixture, checks errors, pagination,
scope and version conflicts, and compiles positive and negative TypeScript
examples. The optional search limit remains optional in generated types even
though the server supplies a default. The answer provider is never contacted; its success shape receives a
synthetic schema check and the disabled-provider response is tested at runtime.

The published document includes service health, identity, memory lifecycle,
lexical search, export, administrator key management, request records, console
sessions and the configuration-dependent answer route. It excludes candidate
intelligence and metadata-filter interfaces. There are 13 paths and 18 operations.

On November 8, 2026, the live health endpoint reported v0.1.0, lexical retrieval,
explicit extraction, and `model_configured: false`. This is a release observation,
not ongoing monitoring. Updating this document does not deploy the Worker or
change the database schema.

Author schema changes here, regenerate, and review the generated diff. Do not
change the immutable v0.1 fixture to make the schema tests pass. Future releases
must check their deployed version and interfaces explicitly.

The website build publishes the document at `/downloads/openapi.json` and
packages a copy with the SDK. `homepage/scripts/prepare-sdk.mjs` is the only
artifact publication path; do not maintain another SDK implementation there.
