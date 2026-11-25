# Repository working rules

- This is the canonical company source repository. Do not keep developing a
  second copy in the old mixed prototype workspace.
- GitHub owner: `Sixteen-Memory`; repository: `sixteen-memory`; visibility:
  **public** (`Apache-2.0`). Do not change repository visibility, license terms,
  or publish packages to external registries without explicit authorization.
- Human contributor: `Chengyuann`. Use the repository-local Git identity and
  existing GitHub credential helper; never place tokens in remotes or files.
- Make scoped commits and use feature branches for subsequent work. Do not
  force-push or rewrite shared history.
- Write repository documentation, README files, developer metadata, templates,
  and new commit/PR descriptions in English. Preserve product localization,
  API response text, and multilingual fixtures unless explicitly asked to
  change them. Do not rewrite historical commits just to translate messages.
- Keep credentials, `.dev.vars`, `.local`, `.wrangler`, databases, private model
  outputs and generated build directories out of commits.
- A successful push does not authorize deployment, DNS, billing, account
  permissions, customer-data actions or paid model calls.
- Keep website work in `homepage/` and the service, console, SDK, and framework
  adapters in `product/`. Preserve each module's package lockfile. Framework
  adapters keep isolated dependencies under `product/integrations/`.
- Run only checks relevant to the change. Do not run real-model benchmarks for
  normal website or repository maintenance.
- Mem0 is a research reference, not vendored code. Any future reuse of third-party
  code requires explicit attribution and license review.
- Do not claim CODEOWNERS or branch-review enforcement merely because a file
  exists; verify actual GitHub settings and plan support.
