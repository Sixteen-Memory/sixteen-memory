# Security

Do not store usable credentials, real customer memories, or production databases in this repository.

- Inject secrets through restricted local files, environment variables, or a provider's secret manager.
- Check user scope and roles on the server rather than relying on hidden interface controls.
- Confirm data, providers, costs, and request limits before real-model calls.
- Obtain separate authorization for deployments, DNS, database migrations, deletions, and permission changes.
- The GitHub organization may have a public profile; the repository itself must remain **Private**.

Report concerns to the repository owner, `@Chengyuann`. Describe impact and a sanitized reproduction without pasting secrets into issues, pull requests, or chat. There is no announced bug bounty, compliance certification, or claim of a complete security assessment.
