import { memoryAttributes, type MemoryAttributes } from "./domain";
export const ATTRIBUTE_KEYS = ["metadata", "category", "event_time", "valid_from", "valid_to"] as const;
export type StoredAttributes = { metadata: string; category: string | null; event_time: string | null; valid_from: string | null; valid_to: string | null };
export function storedAttributes(value: MemoryAttributes): StoredAttributes {
  return { metadata: JSON.stringify(value.metadata ?? {}), category: value.category ?? null,
    event_time: value.event_time ?? null, valid_from: value.valid_from ?? null, valid_to: value.valid_to ?? null };
}
export function readAttributes(value: Partial<StoredAttributes>): Required<MemoryAttributes> {
  return { metadata: JSON.parse(value.metadata ?? "{}"), category: value.category ?? null,
    event_time: value.event_time ?? null, valid_from: value.valid_from ?? null, valid_to: value.valid_to ?? null };
}
export function providedAttributes(data: object): MemoryAttributes {
  const input = data as Record<string, unknown>;
  const normalized = memoryAttributes(input);
  return Object.fromEntries(ATTRIBUTE_KEYS.filter(k => input[k] !== undefined).map(k => [k, normalized[k]]));
}
export function migrateAttributes(sql: SqlStorage) {
  for (const table of ["memories", "history"]) {
    const columns = sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray().map(x => x.name);
    for (const key of ATTRIBUTE_KEYS) if (!columns.includes(key)) {
      sql.exec(`ALTER TABLE ${table} ADD COLUMN ${key} TEXT${key === "metadata" ? " NOT NULL DEFAULT '{}'" : ""}`);
    }
  }
  sql.exec("CREATE INDEX IF NOT EXISTS memories_category ON memories(user_id,category)");
}
