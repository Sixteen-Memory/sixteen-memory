# Examples

- [`offline.mjs`](offline.mjs): runnable, credential-free demonstration using the official AI SDK mock model and an in-memory transport.
- [`server.ts`](server.ts): re-exports the tested package chat handler; host identity, quota and model implementations are required.
- [`end-to-end.mjs`](end-to-end.mjs): run `npm run example:integration` from the repository root. Starts actual temporary local Workers/SQLite and loopback HTTP chat, uses synthetic sessions and an official mock model, and verifies the full lifecycle. Requires the private repository's installed product tooling and is not packaged in the adapter archive.

Neither example writes generated assistant output to memory or proves real-model quality.
