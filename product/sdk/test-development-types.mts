import { SixteenMemory } from "./index.mjs";
import type { IngestionJob } from "./index.mjs";

const client = new SixteenMemory({ baseUrl: "http://127.0.0.1:8790" });
const found = await client.search({ query: "preference", mode: "hybrid", filter: { field: "category", op: "eq", value: "support" } });
const mode: string = found.retrieval;
const jobs: IngestionJob[] = await client.ingestions("alice");
const indexed: number = (await client.reindex("alice")).indexed;
await client.login("synthetic");
void [mode, jobs, indexed];
// @ts-expect-error Unknown development retrieval mode.
await client.search({ query: "test", mode: "invented" });
// @ts-expect-error Missing input fields must not become any.
await client.ingest({ user_id: "alice" });
