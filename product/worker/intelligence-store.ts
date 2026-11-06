import { access, fail, identifier, memoryInput, text, type Identity, type MemoryRecord } from "./domain";
import { MAX_SEMANTIC_RECORDS, validateVector, type Decision, type Plan, type Vector } from "./intelligence-domain";
import { readAttributes, storedAttributes, providedAttributes, type StoredAttributes } from "./memory-attributes";
import { canonicalFactKey, factKeyVariants } from "./fact-slots";
import { filterSql, searchConstraints, validitySql } from "./memory-filter";

type Row = StoredAttributes & { id: string; user_id: string; content: string; source: string; status: string; version: number; created_at: string; updated_at: string; expires_at: string | null; origin: "explicit" | "extracted"; fact_key: string | null };
type Job = { id: string; actor: string; user_id: string; request_id: string; digest: string; state: string; plan: string | null; expires_at: string; created_at: string };
const record = (row: Row): MemoryRecord => ({ ...row, ...readAttributes(row), source: JSON.parse(row.source), status: row.status as "active" | "revoked", origin: row.origin as "explicit" | "extracted" });
export class IntelligenceStore {
  constructor(private sql: SqlStorage, private index: (row: Row) => void, private history: (row: Row, action: string, reason: string, who: Identity) => void) {
    const columns = sql.exec<{ name: string }>("PRAGMA table_info(memories)").toArray().map(x => x.name);
    if (!columns.includes("origin")) sql.exec("ALTER TABLE memories ADD COLUMN origin TEXT NOT NULL DEFAULT 'explicit'");
    if (!columns.includes("fact_key")) sql.exec("ALTER TABLE memories ADD COLUMN fact_key TEXT");
    sql.exec(`
      CREATE TABLE IF NOT EXISTS scope_epochs (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS vectors (memory_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, version INTEGER NOT NULL, model TEXT NOT NULL, dimensions INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS vectors_scope ON vectors(user_id,model);
      CREATE TABLE IF NOT EXISTS ingest_jobs (id TEXT PRIMARY KEY, actor TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, plan TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(actor,request_id));
      CREATE TABLE IF NOT EXISTS ingest_results (job_id TEXT NOT NULL, memory_id TEXT NOT NULL, action TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_evidence (id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_budget (day TEXT PRIMARY KEY, reserved INTEGER NOT NULL);
    `);
    const evidenceColumns = sql.exec<{ name: string }>("PRAGMA table_info(memory_evidence)").toArray().map(x => x.name);
    if (!evidenceColumns.includes("memory_version")) sql.exec("ALTER TABLE memory_evidence ADD COLUMN memory_version INTEGER NOT NULL DEFAULT 1");
  }
  epoch(user: string) { return this.sql.exec<{ revision: number }>("SELECT revision FROM scope_epochs WHERE user_id=?", user).toArray()[0]?.revision ?? 0; }
  touch(user: string) { this.sql.exec("INSERT INTO scope_epochs VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1", user); }
  putVector(row: { id: string; user_id: string; version: number }, input: unknown) {
    this.sql.exec("DELETE FROM vectors WHERE memory_id=?", row.id);
    if (input) {
      const v = validateVector(input);
      const existing = this.sql.exec<{ dimensions: number }>("SELECT dimensions FROM vectors WHERE model=? LIMIT 1", v.model).toArray()[0];
      if (existing && existing.dimensions !== v.values.length) fail(409, "embedding_mismatch", "模型维度已变化，请更新EMBEDDING_REVISION并重建索引");
      this.sql.exec("INSERT INTO vectors VALUES (?,?,?,?,?,?)", row.id, row.user_id, row.version, v.model, v.values.length, JSON.stringify(v.values));
    }
  }
  erase(id: string, user: string) {
    this.sql.exec("DELETE FROM vectors WHERE memory_id=?", id);
    this.sql.exec("DELETE FROM memory_evidence WHERE memory_id=?", id);
    const jobs = this.sql.exec<{ job_id: string }>("SELECT job_id FROM ingest_results WHERE memory_id=?", id).toArray();
    for (const job of jobs) this.sql.exec("UPDATE ingest_jobs SET state='deleted',plan=NULL WHERE id=?", job.job_id);
    this.sql.exec("DELETE FROM ingest_results WHERE memory_id=?", id);
    // Pending source excerpts must not survive an authorized deletion in their scope.
    this.sql.exec("UPDATE ingest_jobs SET state='deleted',plan=NULL WHERE user_id=? AND state IN ('running','review')", user);
    this.touch(user);
  }
  purge(now: string) {
    this.sql.exec("UPDATE ingest_jobs SET state='expired',plan=NULL WHERE state IN ('running','review') AND expires_at<=?", now);
    this.sql.exec("DELETE FROM ingest_results WHERE job_id IN (SELECT id FROM ingest_jobs WHERE created_at<?)", new Date(Date.parse(now) - 30 * 86400_000).toISOString());
    this.sql.exec("DELETE FROM ingest_jobs WHERE created_at<?", new Date(Date.parse(now) - 30 * 86400_000).toISOString());
    this.sql.exec("DELETE FROM model_budget WHERE day<?", now.slice(0, 10));
  }
  private scope(who: Identity, input: Record<string, unknown>, write = false) {
    const user = identifier(input.user_id || who.user_id, "用户标识");
    access(who, user, write);
    return user;
  }
  private job(who: Identity, id: string) {
    const job = this.sql.exec<Job>("SELECT * FROM ingest_jobs WHERE id=?", identifier(id, "导入ID")).toArray()[0];
    if (!job) fail(404, "not_found", "未找到导入任务");
    access(who, job.user_id);
    return job;
  }
  private jobView(job: Job) {
    const results = this.sql.exec<{ memory_id: string; action: string }>("SELECT memory_id,action FROM ingest_results WHERE job_id=?", job.id).toArray();
    const plan = job.state === "review" && job.plan ? JSON.parse(job.plan) as Plan : null;
    return { id: job.id, user_id: job.user_id, state: job.state, expires_at: job.expires_at, results,
      proposal: plan ? { ...plan, decisions: plan.decisions.map(({ vector, ...d }) => d) } : null };
  }
  dispatch(who: Identity, action: string, input: Record<string, unknown>, digest: string): unknown {
    const now = new Date().toISOString();
    if (action === "preflight") {
      const user = this.scope(who, input, !!input.write);
      return { user_id: user, epoch: this.epoch(user) };
    }
    if (action === "model_budget") {
      this.scope(who, input);
      const calls = Number(input.calls);
      if (!Number.isSafeInteger(calls) || calls < 1 || calls > 4) fail(422, "invalid_budget", "模型请求预留无效");
      const day = now.slice(0, 10);
      const current = this.sql.exec<{ reserved: number }>("SELECT reserved FROM model_budget WHERE day=?", day).toArray()[0]?.reserved ?? 0;
      if (current + calls > 200) fail(429, "model_daily_limit", "当前项目当日智能请求预留已达200次；失败调用也计入，不自动退款或重试");
      this.sql.exec("INSERT INTO model_budget VALUES (?,?) ON CONFLICT(day) DO UPDATE SET reserved=reserved+?", day, calls, calls);
      return { reserved: current + calls, limit: 200 };
    }
    if (action === "ingest_candidates") {
      const user = this.scope(who, input, true);
      const keys = [...new Set((input.fact_keys as string[]).flatMap(factKeyVariants))];
      const ids = input.candidate_ids as string[];
      const keySql = keys.length ? `fact_key IN (${keys.map(() => "?").join(",")})` : "0";
      const idSql = ids.length ? `id IN (${ids.map(() => "?").join(",")})` : "0";
      const rows = this.sql.exec<Row>(`SELECT * FROM memories WHERE user_id=? AND status='active' AND (${keySql} OR ${idSql}) ORDER BY updated_at DESC LIMIT 25`, user, ...keys, ...ids).toArray();
      return { data: rows.slice(0, 24).map(row => ({ ...record(row), fact_key: row.fact_key ? canonicalFactKey(row.fact_key) : null })), truncated: rows.length > 24, epoch: this.epoch(user) };
    }
    if (action === "ingest_begin") {
      const user = this.scope(who, input, true);
      const request = identifier(input.request_id, "请求标识");
      const existing = this.sql.exec<Job>("SELECT * FROM ingest_jobs WHERE actor=? AND request_id=?", who.key_id, request).toArray()[0];
      if (existing) {
        if (existing.digest !== digest) fail(409, "idempotency_conflict", "请求标识已用于其他内容");
        if (["deleted", "expired", "rejected"].includes(existing.state)) fail(410, "ingestion_gone", "此导入已结束或清除，不会重建记忆");
        if (["running", "failed"].includes(existing.state)) fail(409, "ingestion_incomplete", "此导入正在处理或先前失败，请查看任务状态；不会自动重试模型");
        return { replay: true, ...this.jobView(existing) };
      }
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM ingest_jobs WHERE user_id=? AND state IN ('running','review')", user).one().n >= 20) fail(409, "proposal_limit", "当前用户有20个待处理导入，请先审核或清理");
      const id = crypto.randomUUID();
      this.sql.exec("INSERT INTO ingest_jobs VALUES (?,?,?,?,?,'running',NULL,?,?)", id, who.key_id, user, request, digest, new Date(Date.now() + 86400_000).toISOString(), now);
      return { id, user_id: user, epoch: this.epoch(user), replay: false };
    }
    if (action === "ingest_get" || action === "ingest_fail" || action === "ingest_finish" || action === "ingest_resolve") {
      const job = this.job(who, String(input.id));
      if (action === "ingest_get") return this.jobView(job);
      access(who, job.user_id, true);
      if (action === "ingest_fail") {
        if (job.state === "running") this.sql.exec("UPDATE ingest_jobs SET state='failed',plan=NULL WHERE id=?", job.id);
        return this.jobView(this.job(who, job.id));
      }
      if (action === "ingest_resolve" && input.approve === false) {
        if (job.state !== "review") fail(409, "invalid_state", "只有待确认任务可拒绝");
        this.sql.exec("UPDATE ingest_jobs SET state='rejected',plan=NULL WHERE id=?", job.id);
        return this.jobView(this.job(who, job.id));
      }
      if (action === "ingest_resolve" && job.state !== "review") fail(409, "invalid_state", "此导入不在待确认状态");
      if (action === "ingest_finish" && job.state !== "running") fail(409, "invalid_state", "此导入不在处理状态");
      const plan = action === "ingest_finish" ? input.plan as Plan : JSON.parse(job.plan!) as Plan;
      if (!plan || plan.user_id !== job.user_id || plan.epoch !== this.epoch(job.user_id)) fail(409, "scope_changed", "记忆已在抽取期间发生变化，请重新抽取；未写入任何事实");
      if (plan.expires_at && Date.parse(plan.expires_at) <= Date.now()) fail(410, "expired", "候选记忆已过期");
      if (action === "ingest_finish" && (input.mode === "review" || plan.decisions.some(d => d.needs_review))) {
        this.sql.exec("UPDATE ingest_jobs SET state='review',plan=? WHERE id=?", JSON.stringify(plan), job.id);
      } else {
        this.apply(who, plan, job.id, action === "ingest_resolve");
        this.sql.exec("UPDATE ingest_jobs SET state='applied',plan=NULL WHERE id=?", job.id);
      }
      return this.jobView(this.job(who, job.id));
    }
    if (action === "ingest_list") {
      const user = this.scope(who, input);
      return this.sql.exec<Job>("SELECT * FROM ingest_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 30", user).toArray().map(j => this.jobView(j));
    }
    if (action === "evidence") {
      const row = this.sql.exec<Row>("SELECT * FROM memories WHERE id=?", identifier(input.id, "记忆ID")).toArray()[0];
      if (!row) fail(404, "not_found", "未找到记忆");
      access(who, row.user_id);
      return { primary: JSON.parse(row.source), version: row.version, supporting: this.sql.exec<{ source: string; memory_version: number }>("SELECT source,memory_version FROM memory_evidence WHERE memory_id=? ORDER BY created_at", row.id).toArray().map(x => ({ source: JSON.parse(x.source), memory_version: x.memory_version })) };
    }
    if (action === "semantic_rows" || action === "reindex_rows") {
      const user = this.scope(who, input, action === "reindex_rows");
      // Coverage remains whole-user, even when a filter returns no rows.
      const count = this.sql.exec<{ n: number }>("SELECT count(*) n FROM memories WHERE user_id=? AND status='active'", user).one().n;
      if (count > MAX_SEMANTIC_RECORDS) fail(409, "semantic_capacity", "当前语义预览每用户最多1000条有效记忆；词法检索仍可用");
      if (action === "reindex_rows") {
        const cursor = input.cursor ? identifier(input.cursor, "游标") : "";
        const rows = this.sql.exec<Row>("SELECT * FROM memories WHERE user_id=? AND status='active' AND id>? ORDER BY id LIMIT 9", user, cursor).toArray();
        return { data: rows.slice(0, 8).map(record), next_cursor: rows.length > 8 ? rows[7].id : null, epoch: this.epoch(user) };
      }
      const model = text(input.model, "向量模型", 200);
      const constraints = searchConstraints(input, now), filtered = filterSql(constraints.filter), valid = validitySql(constraints.at);
      const indexed = this.sql.exec<{ n: number }>("SELECT count(*) n FROM memories m JOIN vectors v ON m.id=v.memory_id AND m.version=v.version WHERE m.user_id=? AND m.status='active' AND v.model=?", user, model).one().n;
      const rows = this.sql.exec<Row & { value: string }>(`SELECT m.*,v.value FROM memories m JOIN vectors v ON m.id=v.memory_id AND m.version=v.version WHERE m.user_id=? AND m.status='active' AND v.model=? AND (${filtered.sql}) AND (${valid.sql}) ORDER BY m.id`,
        user, model, ...filtered.args, ...valid.args).toArray();
      return { data: rows.map(({ value, ...row }) => ({ memory: record(row), values: JSON.parse(value) })), coverage: { indexed, active: count }, epoch: this.epoch(user) };
    }
    if (action === "reindex_commit") {
      const user = this.scope(who, input, true);
      if (input.epoch !== this.epoch(user)) fail(409, "scope_changed", "重建期间记忆变化，索引未更新");
      const entries = input.entries as { id: string; version: number; vector: Vector }[];
      for (const entry of entries) {
        const row = this.sql.exec<Row>("SELECT * FROM memories WHERE id=? AND user_id=? AND status='active' AND version=?", entry.id, user, entry.version).toArray()[0];
        if (!row) fail(409, "version_conflict", "重建期间记录变化");
        this.putVector(row, entry.vector);
      }
      return { indexed: entries.length };
    }
    fail(404, "not_found", "未知智能操作");
  }
  private apply(who: Identity, plan: Plan, jobId: string, reviewed: boolean) {
    const touched = new Set<string>();
    for (const d of plan.decisions) {
      const now = new Date().toISOString();
      let row: Row;
      const target = d.action === "add" ? undefined : this.sql.exec<Row>("SELECT * FROM memories WHERE id=? AND user_id=?", d.target_id!, plan.user_id).toArray()[0];
      const draft = memoryInput({ ...(target ? readAttributes(target) : {}), ...providedAttributes(plan),
        user_id: plan.user_id, content: d.fact.content, source: d.fact.source, expires_at: plan.expires_at });
      if (d.action === "add") {
        const attrs = storedAttributes(draft);
        const exact = this.sql.exec<Row>("SELECT * FROM memories WHERE user_id=? AND status='active' AND content=? AND fact_key=? AND metadata=? AND category IS ? AND event_time IS ? AND valid_from IS ? AND valid_to IS ? AND expires_at IS ?",
          plan.user_id, draft.content, d.fact.fact_key, attrs.metadata, attrs.category, attrs.event_time, attrs.valid_from, attrs.valid_to, draft.expires_at).toArray()[0];
        if (exact) { this.evidence(exact.id, d); this.sql.exec("INSERT INTO ingest_results VALUES (?,?,?)", jobId, exact.id, "merge"); continue; }
        if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM memories").one().n >= 10000) fail(409, "capacity", "项目容量已满");
        row = { ...draft, ...storedAttributes(draft), id: crypto.randomUUID(), source: JSON.stringify(draft.source), status: "active", version: 1, created_at: now, updated_at: now, origin: reviewed ? "explicit" : "extracted", fact_key: d.fact.fact_key };
        this.sql.exec("INSERT INTO memories(id,user_id,content,source,status,version,created_at,updated_at,expires_at,origin,fact_key,metadata,category,event_time,valid_from,valid_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          row.id, row.user_id, row.content, row.source, row.status, row.version, now, now, row.expires_at, row.origin, row.fact_key, row.metadata, row.category, row.event_time, row.valid_from, row.valid_to);
      } else {
        row = this.sql.exec<Row>("SELECT * FROM memories WHERE id=? AND user_id=?", d.target_id!, plan.user_id).toArray()[0];
        if (!row || row.status !== "active" || row.version !== d.target_version || touched.has(row.id)) fail(409, "version_conflict", "候选事实指向的记录已变化或重复操作；未写入");
        touched.add(row.id);
        if (d.action === "merge") {
          if (JSON.stringify(readAttributes(row)) !== JSON.stringify({ ...readAttributes(row), ...providedAttributes(plan) })) fail(409, "merge_attributes_conflict", "合并不会覆盖分类、元数据或有效期；请使用带版本的显式更新");
          if (plan.expires_at !== null && plan.expires_at !== row.expires_at) fail(409, "merge_attributes_conflict", "合并不会更改保留期限；请使用显式更新");
          this.evidence(row.id, d);
          // Preserve the canonical content, primary evidence and its matching vector.
          this.sql.exec("INSERT INTO ingest_results VALUES (?,?,?)", jobId, row.id, "merge");
          continue;
        }
        row = { ...row, ...storedAttributes(draft), content: draft.content, source: JSON.stringify(draft.source), version: row.version + 1, updated_at: now, expires_at: draft.expires_at, origin: reviewed ? "explicit" : "extracted", fact_key: d.fact.fact_key };
        this.sql.exec("UPDATE memories SET content=?,source=?,version=?,updated_at=?,expires_at=?,origin=?,fact_key=? WHERE id=?", row.content, row.source, row.version, now, row.expires_at, row.origin, row.fact_key, row.id);
        this.sql.exec("UPDATE memories SET metadata=?,category=?,event_time=?,valid_from=?,valid_to=? WHERE id=?", row.metadata, row.category, row.event_time, row.valid_from, row.valid_to, row.id);
      }
      this.index(row);
      this.putVector(row, d.vector);
      this.history(row, d.action === "supersede" ? "superseded" : "extracted", d.reason, who);
      this.sql.exec("INSERT INTO ingest_results VALUES (?,?,?)", jobId, row.id, d.action);
    }
    this.touch(plan.user_id);
  }
  private evidence(id: string, d: Decision) {
    if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM memory_evidence WHERE memory_id=?", id).one().n >= 50) fail(409, "evidence_limit", "此记忆的补充依据已达50条");
    const version = this.sql.exec<{ version: number }>("SELECT version FROM memories WHERE id=?", id).one().version;
    this.sql.exec("INSERT INTO memory_evidence(id,memory_id,source,created_at,memory_version) VALUES (?,?,?,?,?)", crypto.randomUUID(), id, JSON.stringify(d.fact.source), new Date().toISOString(), version);
  }
}
