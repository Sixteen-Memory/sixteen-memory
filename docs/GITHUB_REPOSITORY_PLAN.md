# GitHub organization and repository

Initially recorded on November 6, 2026; updated on November 25, 2026 for open-source publication under Apache-2.0.

## Confirmed ownership

Use a GitHub **Organization**, not a shared company personal account:

```text
Organization: Sixteen-Memory
Public repository: sixteen-memory (Apache-2.0)
Owner / daily contributor: Chengyuann
```

The organization represents the project and company; personal accounts identify actual contributors. This keeps authorship, two-factor authentication, access removal, and future membership clear. Do not share a company password or long-lived token.

Open-source licensing and scope:

```text
Sixteen-Memory/sixteen-memory       Open-source core repository (Apache-2.0)
```

Keep credentials, local databases, `.dev.vars`, and customer data strictly outside Git. Package registry publishing (npm / PyPI) and hosted deployments remain separately authorized operations.

## Source import scope

Included:

- `product/`: Worker, console, SDK, examples, tests, and evaluation scripts.
- `homepage/`: website source, asset provenance, and page checks.
- `docs/`: product, integration, Mem0 research, and repository documentation.
- Relevant top-level development and build configuration.

Excluded:

- `.agent/`, screenshots, temporary charts, `output/`, and browser records.
- `.dev.vars`, `.local/`, `.wrangler/`, production keys, and provider credentials.
- `node_modules/`, `dist/`, and TypeScript caches.
- Real model responses, production data, local databases, and deployment sessions.

## Initial setup process

1. The user created `Sixteen-Memory`; `Chengyuann` was verified as an active Owner on November 6, 2026.
2. Create the private `sixteen-memory` repository without generating duplicate README, license, or ignore files.
3. Prepare a clean import in a separate directory rather than pushing the mixed prototype workspace.
4. Set repository-local authorship to the personal GitHub account.
5. Push `main`, then verify visibility, file inventory, and secret exclusion.
6. Check actual plan support before relying on branch protection. GitHub Free does not provide every private-repository protection; a `CODEOWNERS` file alone is not enforced approval. Paid upgrades require separate authorization.
7. Use personal-account feature branches and pull requests afterward.

## Verified boundaries

- The organization handle is `Sixteen-Memory`; the brand is SixteenMemory.
- The recorded plan is GitHub Free; no paid upgrade was authorized.
- `Chengyuann` already has Owner access and does not need an outside-collaborator invitation.
- The repository is public under the [Apache License 2.0](../LICENSE), without automatic deployment on push.
- `CODEOWNERS` identifies responsibility; check actual branch protection settings separately.

Local commits use the GitHub noreply address for `Chengyuann`, not the employer email from the old workspace. This configuration applies only to this repository, not global Git settings.
