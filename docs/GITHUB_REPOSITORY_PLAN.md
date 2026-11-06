# GitHub organization and repository

Recorded on November 6, 2026.

## Confirmed ownership

Use a GitHub **Organization**, not a shared company personal account:

```text
Organization: Sixteen-Memory
Private repository: sixteen-memory
Owner / daily contributor: Chengyuann
```

The organization represents the company; personal accounts identify actual contributors. This keeps authorship, two-factor authentication, access removal, and future membership clear. Do not share a company password or long-lived token.

Future open-source work has a separate home:

```text
Sixteen-Memory/sixteen-memory       Private core repository
Sixteen-Memory/<public-project>     Separate public repository
```

Select releasable content for a public repository. Do not turn the private core repository public.

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
- The core repository stays private, without public Pages or automatic deployment.
- `CODEOWNERS` identifies responsibility; it does not prove required-review enforcement.

Local commits use the GitHub noreply address for `Chengyuann`, not the employer email from the old workspace. This configuration applies only to this repository, not global Git settings.
