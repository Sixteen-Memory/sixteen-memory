# Contributing

The company organization owns this repository. Every contributor uses their own GitHub account. The designated owner is `@Chengyuann`. Do not share passwords, long-lived tokens, or SSH private keys.

Local commits use the GitHub noreply address associated with `Chengyuann`, not the employer email from the original workspace. This is a repository-local setting; do not change global Git identity.

## Language

Use English for repository documentation, README files, architecture notes, developer-facing metadata, pull request templates, and new commit and pull request descriptions.

Keep product localization, API response wording, and multilingual evaluation fixtures intact unless the task explicitly changes them. Existing Git history is not rewritten solely to translate old messages.

## Development workflow

1. Create a feature branch from `main`.
2. Make scoped changes and preserve other contributors' work.
3. Run relevant type, build, and behavior checks. Ordinary page changes do not require model calls.
4. Review staged content with `git diff --cached`, especially configuration, screenshots, and sample data.
5. Push through your own account and open a pull request.
6. Have the responsible owner confirm the change before merging. Pull request approval does not authorize deployment.

The initial import may establish `main` directly. Use branches afterward and do not force-push the main branch. `CODEOWNERS` records responsibility but does not guarantee required-review enforcement; branch protections depend on the configured GitHub repository settings. Do not purchase paid GitHub plans without approval.

## Never commit

- API keys, passwords, tokens, private keys, or production connection strings.
- `.dev.vars`, `.local/`, `.wrangler/`, or databases.
- Customer records, raw model responses, browser screenshots, or deployment sessions.
- `node_modules/`, build output, or local reports.

Never commit secrets or sensitive data. If a secret enters history, revoke or rotate it first, then assess history cleanup.

Contributions submitted to this repository are licensed under the [Apache License 2.0](LICENSE) unless explicitly stated otherwise.
