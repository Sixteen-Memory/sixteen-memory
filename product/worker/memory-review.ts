import type { MemoryRecord } from "./domain";
import { canonicalFactKey, registeredFactKey } from "./fact-slots";

export type ReviewFinding = {
  kind: "duplicate_content" | "slot_conflict" | "old_evidence";
  memories: { id: string; version: number }[];
  fact_key?: string;
};
export type MemoryReview = {
  checked_at: string; stale_before: string; scanned: number; changed: 0;
  findings: ReviewFinding[]; finding_count: number; truncated: boolean;
};
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");

export function reviewMemories(rows: MemoryRecord[], now: string, staleBefore: string): MemoryReview {
  const findings: ReviewFinding[] = [];
  const duplicates = new Map<string, MemoryRecord[]>(), slots = new Map<string, MemoryRecord[]>();
  const refs = (items: MemoryRecord[]) => items.map(({ id, version }) => ({ id, version }));
  for (const row of rows) {
    // Do not call punctuation, category or validity differences equivalent.
    const key = JSON.stringify([normalized(row.content), row.category, row.metadata, row.valid_from, row.valid_to, row.event_time]);
    const same = duplicates.get(key) ?? [];
    same.push(row); duplicates.set(key, same);
    if (row.fact_key && registeredFactKey(row.fact_key)) {
      const slot = canonicalFactKey(row.fact_key);
      const items = slots.get(slot) ?? [];
      items.push(row); slots.set(slot, items);
    }
    if (row.source.observed_at < staleBefore) findings.push({ kind: "old_evidence", memories: refs([row]) });
  }
  const groups: ReviewFinding[] = [];
  for (const items of duplicates.values()) if (items.length > 1) groups.push({ kind: "duplicate_content", memories: refs(items) });
  for (const [slot, items] of slots) if (new Set(items.map(row => normalized(row.content))).size > 1) {
    groups.push({ kind: "slot_conflict", fact_key: slot, memories: refs(items) });
  }
  const all = [...groups, ...findings];
  return { checked_at: now, stale_before: staleBefore, scanned: rows.length, changed: 0,
    findings: all.slice(0, 100), finding_count: all.length, truncated: all.length > 100 };
}
