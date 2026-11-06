# Product deployment boundaries

This repository includes Cloudflare Worker and Pages configuration, not account credentials, production keys, customer data, or historical deployment receipts. The recorded public entry point is `console.sixteenmemory.com`.

```text
Pages console → Service Binding → Worker → SQLite Durable Object
                                    |
                                    +→ Explicitly enabled model API
```

## Local build

```sh
npm ci
npm run build
npm run build:pages
```

The `wrangler deploy --dry-run` step only emits a local Worker bundle; it does not publish. Models are disabled by default. Generate a local key with `prepare:local` rather than reusing a production key.

## Production publication

Confirm the target account, service, data scope, backup/recovery plan, and operator permissions first. Names in configuration do not authorize deployment. A GitHub push does not publish a service or change keys, DNS, domains, or databases.

Inject production keys through secret management, not `wrangler.jsonc`. There is no automatic deployment workflow. Adding one requires agreement on environments, branches, approvals, and costs.

## Deletion and recovery

Online deletion and platform recovery-copy retention are different boundaries. Do not restore real customer databases before establishing a post-restore deletion check, and do not claim all platform backups are immediately erased. Exporting current records is not a full database backup.
