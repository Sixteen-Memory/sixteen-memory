import { tokens, type Source } from "./domain";
import { filterSql, searchConstraints, validitySql } from "./memory-filter";

type IndexedMemory = { id: string; version: number; status: string; source: string };
export type EvidenceHit = {
  memory_id: string; memory_version: number; user_id: string; content: string;
  source: Source; kind: "primary" | "supporting"; score: number;
};
export type EvidenceSearch = { data: EvidenceHit[]; retrieval: "evidence_lexical" };

export class EvidenceIndex {
  constructor(private sql: SqlStorage, transaction: (fn: () => void) => void) {
    sql.exec("CREATE INDEX IF NOT EXISTS memory_evidence_version ON memory_evidence(memory_id,memory_version)");
    const exists = sql.exec("SELECT name FROM sqlite_master WHERE name='evidence_index'").toArray().length;
    if (!exists) transaction(() => {
      sql.exec("CREATE VIRTUAL TABLE evidence_index USING fts5(memory_id UNINDEXED, evidence_id UNINDEXED, memory_version UNINDEXED, terms, tokenize='unicode61')");
      for (const row of sql.exec<IndexedMemory>("SELECT id,version,status,source FROM memories WHERE status='active'")) this.index(row);
    });
  }

  erase(id: string) { this.sql.exec("DELETE FROM evidence_index WHERE memory_id=?", id); }

  index(row: IndexedMemory) {
    this.erase(row.id);
    if (row.status !== "active") return;
    const add = (id: string, raw: string) => {
      const source = JSON.parse(raw) as Source;
      this.sql.exec("INSERT INTO evidence_index(memory_id,evidence_id,memory_version,terms) VALUES (?,?,?,?)",
        row.id, id, row.version, tokens(`${source.ref}\n${source.text}`, 8000).join(" "));
    };
    add("", row.source);
    for (const evidence of this.sql.exec<{ id: string; source: string }>(
      "SELECT id,source FROM memory_evidence WHERE memory_id=? AND memory_version=?", row.id, row.version,
    )) add(evidence.id, evidence.source);
  }

  search(user: string, query: string, limit: number, input: Record<string, unknown>, now: string): EvidenceSearch {
    const constraints = searchConstraints(input, now);
    const filtered = filterSql(constraints.filter), valid = validitySql(constraints.at);
    const terms = tokens(query);
    if (!terms.length) return { data: [], retrieval: "evidence_lexical" };
    const match = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" OR ");
    const rows = this.sql.exec<{
      memory_id: string; memory_version: number; user_id: string; content: string;
      source: string; kind: "primary" | "supporting"; score: number;
    }>(`SELECT m.id AS memory_id,m.version AS memory_version,m.user_id,m.content,
        CASE WHEN i.evidence_id='' THEN m.source ELSE e.source END AS source,
        CASE WHEN i.evidence_id='' THEN 'primary' ELSE 'supporting' END AS kind,
        -bm25(evidence_index) AS score
        FROM evidence_index i JOIN memories m ON m.id=i.memory_id AND m.version=i.memory_version
        LEFT JOIN memory_evidence e ON e.id=i.evidence_id AND e.memory_id=m.id AND e.memory_version=m.version
        WHERE evidence_index MATCH ? AND m.user_id=? AND m.status='active'
          AND (i.evidence_id='' OR e.id IS NOT NULL) AND (${filtered.sql}) AND (${valid.sql})
        ORDER BY bm25(evidence_index),m.id,i.evidence_id LIMIT ?`,
      match, user, ...filtered.args, ...valid.args, limit).toArray();
    return { data: rows.map(row => ({ ...row, source: JSON.parse(row.source) })), retrieval: "evidence_lexical" };
  }
}
