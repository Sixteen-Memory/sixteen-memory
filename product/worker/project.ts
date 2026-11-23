import { DurableObject } from "cloudflare:workers";
import { IntelligenceStore } from "./intelligence-store";
import { migrateAttributes, providedAttributes, readAttributes, storedAttributes, type StoredAttributes } from "./memory-attributes";
import { filterSql, parseFilter, searchConstraints, validitySql } from "./memory-filter";
import { EvidenceIndex } from "./evidence-index";
import { boundedInteger } from "./memory-context";
import { reviewMemories } from "./memory-review";
import { ConversationStore, type ConversationAction } from "./conversations";
import { KnowledgeStore, type KnowledgeAction } from "./knowledge-store";
import { OAuthStore, type OAuthAction } from "./oauth-store";
import { MediaStore, type MediaUploadAction } from "./media-store";
import { inspectMediaFile, mediaPartStream } from "./media-files";
import { mediaConfigured, understandMedia, type MediaEnv } from "./media-provider";
import { mediaDecisions, mediaUploadInput, MEDIA_CHUNK_BYTES } from "./media-domain";
import { hash, randomSecret } from "./domain";
import type { Plan } from "./intelligence-domain";
import {
  access, admin, ApiError, date, equalDigest, expectedVersion, fail, identifier, MAX_MEMORIES,
  memoryInput, text, tokens,
  type AuditRecord, type Identity, type KeyRecord, type MemoryRecord,
} from "./domain";

type Row = StoredAttributes & { id: string; user_id: string; content: string; source: string; status: "active" | "revoked"; version: number; created_at: string; updated_at: string; expires_at: string | null; origin?: "explicit" | "extracted"; fact_key?: string | null };
type KeyRow = { [K in keyof KeyRecord]: KeyRecord[K] };
type Grant = KeyRow & { digest: string };
type AuditRow = { [K in keyof AuditRecord]: AuditRecord[K] };
type HistoryRow = StoredAttributes & { version: number; action: string; content: string; source: string; status: "active" | "revoked"; reason: string; actor: string; created_at: string };
export type Action = OAuthAction | ConversationAction | KnowledgeAction | MediaUploadAction | "me" | "list" | "search" | "get" | "history" | "add" | "update" | "revoke" | "delete" | "export" | "keys" | "create_key" | "revoke_key" | "audit" |
  "write_prepare" | "preflight" | "model_budget" | "ingest_candidates" | "ingest_begin" | "ingest_get" | "ingest_fail" | "ingest_finish" | "ingest_resolve" | "ingest_list" | "evidence" | "semantic_rows" | "reindex_rows" | "reindex_commit" | "evidence_search" | "memory_review";
export type Outcome = { ok: true; json: string } | { ok: false; status: number; code: string; message: string };
export interface Auth { digest: string; session: boolean; root: boolean; root_digest: string; oauth_resource?: string }
const record = (row: Row): MemoryRecord => ({ ...row, ...readAttributes(row), source: JSON.parse(row.source) });

export class MemoryProject extends DurableObject<Env> {
  private sql: SqlStorage;
  private intelligence: IntelligenceStore;
  private evidenceIndex: EvidenceIndex;
  private conversations: ConversationStore;
  private knowledge: KnowledgeStore;
  private oauth: OAuthStore;
  private media: MediaStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL,
        status TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS memories_user ON memories(user_id, id);
      CREATE INDEX IF NOT EXISTS memories_expiry ON memories(expires_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(id UNINDEXED, terms, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS history (
        memory_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL,
        content TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
        reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(memory_id, version)
      );
      CREATE TABLE IF NOT EXISTS retries (
        actor TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
        memory_id TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(actor, request_id)
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, user_id TEXT NOT NULL,
        prefix TEXT NOT NULL, digest TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, key_id TEXT NOT NULL, root_digest TEXT, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, status INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    migrateAttributes(this.sql);
    this.intelligence = new IntelligenceStore(this.sql, row => this.index({ ...row, status: row.status as "active" | "revoked" }), (row, action, reason, who) => this.history({ ...row, status: row.status as "active" | "revoked" }, action, reason, who), user => this.knowledge.invalidate(user));
    this.evidenceIndex = new EvidenceIndex(this.sql, fn => ctx.storage.transactionSync(fn));
    this.conversations = new ConversationStore(this.sql, user => this.intelligence.touch(user));
    this.knowledge = new KnowledgeStore(this.sql, this.conversations, user => this.intelligence.epoch(user));
    this.oauth = new OAuthStore(this.sql, (who, action, input, digest = "") => this.dispatch(who, action as Action, input, digest));
    this.media = new MediaStore(this.sql);
  }

  private identity(auth: Auth): Identity {
    if (auth.oauth_resource) return this.oauth.identity(auth.digest, auth.oauth_resource);
    if (auth.root) return { key_id: "owner", role: "admin", user_id: null };
    if (auth.session) {
      const session = this.sql.exec<{ key_id: string; root_digest: string | null }>(
        "SELECT key_id, root_digest FROM sessions WHERE digest=? AND expires_at>?", auth.digest, new Date().toISOString(),
      ).toArray()[0];
      if (!session) fail(401, "invalid_session", "登录已失效");
      if (session.key_id === "owner") {
        if (!session.root_digest || !equalDigest(session.root_digest, auth.root_digest)) {
          fail(401, "invalid_session", "管理员凭证已变更");
        }
        return { key_id: "owner", role: "admin", user_id: null };
      }
      const key = this.sql.exec<Grant>("SELECT * FROM api_keys WHERE id=? AND revoked_at IS NULL", session.key_id).toArray()[0];
      if (!key) fail(401, "invalid_key", "API Key 已失效");
      return { key_id: key.id, role: key.role, user_id: key.user_id };
    }
    const key = this.sql.exec<Grant>("SELECT * FROM api_keys WHERE digest=? AND revoked_at IS NULL", auth.digest).toArray()[0];
    if (!key) fail(401, "invalid_key", "API Key 无效");
    return { key_id: key.id, role: key.role, user_id: key.user_id };
  }

  async login(auth: Auth, sessionDigest: string, rootDigest: string): Promise<Outcome> {
    try {
      const who = this.identity(auth);
      const expires = new Date(Date.now() + 8 * 3600_000).toISOString();
      this.sql.exec("INSERT INTO sessions VALUES (?, ?, ?, ?)", sessionDigest, who.key_id, who.key_id === "owner" ? rootDigest : null, expires);
      this.sql.exec("DELETE FROM sessions WHERE expires_at<=?", new Date().toISOString());
      return { ok: true, json: JSON.stringify({ ...who, project_id: this.env.PROJECT_ID }) };
    } catch (error) { return this.failure(error); }
  }

  logout(digest: string) { this.sql.exec("DELETE FROM sessions WHERE digest=?", digest); }

  /** Only the Worker service can invoke RPC; externally supplied Auth never bypasses identity(). */
  async oauthOperation(operation: "begin" | "consent" | "token" | "revoke", input: Record<string, unknown>, auth?: Auth): Promise<Outcome> {
    const started = Date.now();
    try {
      this.purge();
      const data = this.ctx.storage.transactionSync(() => {
        if (operation === "begin") return this.oauth.begin(input);
        if (operation === "consent") return this.oauth.consent(input, input.approve === true && auth ? this.identity(auth) : undefined);
        if (operation === "token") return this.oauth.token(input);
        return this.oauth.revoke(input);
      });
      this.log({ key_id: "oauth", user_id: null, role: "read" }, "oauth_" + operation, "_error" in data ? 400 : 200, started);
      await this.schedule();
      return { ok: true, json: JSON.stringify(data) };
    } catch (error) {
      const failed = this.failure(error);
      this.log({ key_id: "oauth", user_id: null, role: "read" }, "oauth_" + operation, failed.ok ? 500 : failed.status, started);
      return failed;
    }
  }

  private failure(error: unknown): Outcome {
    if (error instanceof ApiError) return { ok: false, status: error.status, code: error.code, message: error.message };
    return { ok: false, status: 503, code: "storage_error", message: "存储操作失败，请稍后重试" };
  }

  async execute(auth: Auth, action: Action, input: Record<string, unknown>, digest = ""): Promise<Outcome> {
    const started = Date.now();
    let who: Identity | undefined;
    try {
      who = this.identity(auth);
      this.purge();
      const data = this.ctx.storage.transactionSync(() => this.dispatch(who!, action, input, digest));
      this.log(who, action, 200, started);
      await this.schedule();
      return { ok: true, json: JSON.stringify(data) };
    } catch (error) {
      const failed = this.failure(error);
      if (who) this.log(who, action, failed.ok ? 500 : failed.status, started);
      return failed;
    }
  }

  private log(who: Identity, action: string, status: number, started: number) {
    this.sql.exec("INSERT INTO audit(action,status,duration_ms,actor,created_at) VALUES (?,?,?,?,?)", action, status, Date.now() - started, who.key_id, new Date().toISOString());
    this.sql.exec("DELETE FROM audit WHERE id <= (SELECT COALESCE(MAX(id),0)-1000 FROM audit)");
  }

  private get(id: string, who: Identity, write = false): Row {
    const row = this.sql.exec<Row>("SELECT * FROM memories WHERE id=?", id).toArray()[0];
    if (!row) fail(404, "not_found", "未找到记录");
    access(who, row.user_id, write);
    return row;
  }

  private index(row: Row) {
    this.sql.exec("DELETE FROM search_index WHERE id=?", row.id);
    if (row.status === "active") this.sql.exec("INSERT INTO search_index(id,terms) VALUES (?,?)", row.id, tokens(row.content, 8000).join(" "));
    this.evidenceIndex.index(row);
  }

  private history(row: Row, action: string, reason: string, who: Identity) {
    this.sql.exec("INSERT INTO history(memory_id,version,action,content,source,status,reason,actor,created_at,metadata,category,event_time,valid_from,valid_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      row.id, row.version, action, row.content, row.source, row.status, reason, who.key_id, row.updated_at,
      row.metadata, row.category, row.event_time, row.valid_from, row.valid_to);
  }

  private erase(id: string) {
    this.sql.exec("UPDATE mcp_write_requests SET payload=NULL,state='invalidated' WHERE payload IS NOT NULL AND json_extract(payload,'$.memory_id')=?", id);
    const row = this.sql.exec<{ user_id: string }>("SELECT user_id FROM memories WHERE id=?", id).toArray()[0];
    if (row) { this.intelligence.erase(id, row.user_id); this.media.invalidate("user_id", row.user_id); }
    this.sql.exec("DELETE FROM search_index WHERE id=?", id);
    this.evidenceIndex.erase(id);
    this.sql.exec("DELETE FROM history WHERE memory_id=?", id);
    this.sql.exec("DELETE FROM memories WHERE id=?", id);
    if (row) this.knowledge.invalidate(row.user_id);
    // Keep only the retry tombstone until its expiry, preventing an old retry from resurrecting deleted data.
  }

  private purge() {
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      for (const row of this.sql.exec<{ id: string }>("SELECT id FROM memories WHERE expires_at<=?", now).toArray()) this.erase(row.id);
      this.sql.exec("DELETE FROM retries WHERE expires_at<=?", now);
      this.sql.exec("DELETE FROM sessions WHERE expires_at<=?", now);
      this.intelligence.purge(now);
      this.conversations.purge(now);
      this.knowledge.purge(now);
      this.oauth.purge();
      this.media.expire(now);
    });
  }

  private async schedule() {
    // Workers SQLite limits compound SELECT terms. Fixed table names only.
    const dates = ["memories", "sessions", "retries", "ingest_jobs", "conversations", "conversation_retries", "knowledge_runs", "oauth_flows", "oauth_codes", "oauth_tokens", "oauth_grants", "mcp_write_requests"]
      .map(table => this.sql.exec<{ expires: string | null }>(`SELECT MIN(expires_at) AS expires FROM ${table}${["ingest_jobs", "knowledge_runs"].includes(table) ? " WHERE state IN ('review','running')" : ""}`).one().expires)
      .filter((value): value is string => value !== null);
    const mediaNext = this.media.next();
    if (mediaNext) dates.push(mediaNext);
    if (this.media.cleanup().length) dates.push(new Date(Date.now() + 60_000).toISOString());
    const next = dates.sort()[0];
    if (next) {
      const when = Math.max(Date.now() + 1000, Date.parse(next));
      const scheduled = await this.ctx.storage.getAlarm();
      if (scheduled === null || scheduled > when) await this.ctx.storage.setAlarm(when);
    }
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    this.purge();
    const env = this.env as Env & MediaEnv;
    if (env.MEDIA_BUCKET) {
      for (const row of this.media.cleanup()) {
        await env.MEDIA_BUCKET.delete(this.media.parts(row).map(part => part.key));
        this.media.cleaned(row.id);
      }
      const row = this.media.queued();
      if (row) {
        const token = randomSecret();
        this.media.start(row.id, await hash(token));
        await this.schedule();
        try {
          if (!mediaConfigured(env)) fail(503, "media_not_configured", "媒体模型未启用");
          // Older Omni models cannot cover a 30-minute video.
          if (!/^qwen3\.(?:5|8)-omni-/.test(env.MEDIA_MODEL!)) fail(503, "media_model_duration", "30分钟录音需配置支持长音视频的Qwen Omni模型");
          const auth = this.media.auth(row);
          const rootDigest = await hash(env.ADMIN_KEY);
          const currentAuth = () => {
            if (auth.root && !equalDigest(auth.root_digest, rootDigest)) fail(401, "invalid_key", "管理员凭证已更换");
            return this.identity(auth);
          };
          let who = currentAuth();
          const mediaInput = mediaUploadInput(JSON.parse(row.input));
          const before = this.intelligence.dispatch(who, "preflight", { user_id: row.user_id, write: true }, "") as { epoch: number };
          if (before.epoch !== JSON.parse(row.input)._epoch) fail(409, "scope_changed", "上传后记忆已变化，请重新开始");
          const inspected = await inspectMediaFile(env.MEDIA_BUCKET, this.media.parts(row), mediaInput.mime_type);
          who = currentAuth();
          this.purge();
          if (this.media.get(row.id)?.state !== "running") fail(409, "media_cancelled", "媒体处理已取消");
          const base = new URL(env.MEDIA_OBJECT_BASE_URL!);
          if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") fail(503, "media_storage_config", "媒体读取地址需为本站HTTPS源站");
          this.intelligence.dispatch(who, "model_budget", { user_id: row.user_id, calls: 1 }, "");
          const result = await understandMedia(env, { mime_type: mediaInput.mime_type, url: `${base.origin}/v1/media/files/${row.id}?token=${token}` }, inspected.duration);
          this.purge();
          who = currentAuth();
          if (this.media.get(row.id)?.state !== "running") fail(409, "media_cancelled", "媒体处理已取消");
          const analysis = mediaDecisions(result.value, { ...mediaInput, media: { mime_type: mediaInput.mime_type } }, inspected.sha256, result.usage.model, inspected.duration);
          const plan: Plan = { ...providedAttributes(mediaInput), ...analysis, user_id: row.user_id, request_id: row.request_id,
            epoch: before.epoch, expires_at: mediaInput.expires_at };
          const finished = await this.execute(auth, "ingest_finish", { id: row.job_id, plan, mode: "review" });
          if (!finished.ok) fail(finished.status, finished.code, finished.message);
          this.media.done(row.id, null);
        } catch (error) {
          this.media.done(row.id, error instanceof ApiError ? error.code : "media_processing_failed");
          this.sql.exec("UPDATE ingest_jobs SET state='failed',plan=NULL WHERE id=? AND state='running'", row.job_id);
        } finally {
          await env.MEDIA_BUCKET.delete(this.media.parts(row).map(part => part.key));
          this.media.cleaned(row.id);
        }
      }
    }
    await this.schedule();
  }

  private dispatch(who: Identity, action: Action, input: Record<string, unknown>, digest: string): unknown {
    const now = new Date().toISOString();
    if (action.startsWith("oauth_") || action.startsWith("mcp_")) return this.oauth.execute(who, action as OAuthAction, input);
    if (action.startsWith("media_upload_")) return this.media.dispatch(who, action as MediaUploadAction, input, digest);
    if (action.startsWith("conversation_")) return this.conversations.dispatch(who, action as ConversationAction, input, digest);
    if (action.startsWith("knowledge_") || action.startsWith("wiki_")) return this.knowledge.dispatch(who, action as KnowledgeAction, input, digest);
    if (action === "write_prepare") {
      if (input._id) {
        const row = this.get(identifier(input._id, "记忆ID"), who, true);
        if (expectedVersion(input.expected_version) !== row.version) fail(409, "version_conflict", "记录已变化，请刷新后再操作");
      } else {
        const draft = memoryInput(input, true); access(who, draft.user_id, true);
        const requestId = identifier(input.request_id, "请求ID");
        const retry = this.sql.exec<{ digest: string; memory_id: string }>("SELECT digest,memory_id FROM retries WHERE actor=? AND request_id=?", who.key_id, requestId).toArray()[0];
        if (retry) {
          if (retry.digest !== digest) fail(409, "idempotency_conflict", "请求标识已用于其他内容");
          const row = this.sql.exec<Row>("SELECT * FROM memories WHERE id=?", retry.memory_id).toArray()[0];
          if (!row) fail(410, "memory_deleted", "原记录已删除或到期，不会因重试重新写入");
          return { replay: true, record: record(row) };
        }
      }
      return { replay: false };
    }
    if (["preflight","model_budget","ingest_candidates","ingest_begin","ingest_get","ingest_fail","ingest_finish","ingest_resolve","ingest_list","evidence","semantic_rows","reindex_rows","reindex_commit"].includes(action)) return this.intelligence.dispatch(who, action, input, digest);
    if (action === "evidence_search" || action === "memory_review") {
      const user = identifier(input.user_id, "用户标识");
      access(who, user);
      if (action === "evidence_search") return this.evidenceIndex.search(user, text(input.query, "查询", 1000),
        boundedInteger(input.limit, 10, 1, 50, "limit"), input, now);
      const staleBefore = input.stale_before === undefined ? new Date(Date.parse(now) - 90 * 86400_000).toISOString() : date(input.stale_before, "依据时间界限");
      if (staleBefore > now) fail(422, "future_cutoff", "依据时间界限不能晚于当前时间");
      const valid = validitySql(now);
      const rows = this.sql.exec<Row>(`SELECT m.* FROM memories m WHERE m.user_id=? AND m.status='active' AND ${valid.sql} ORDER BY m.id LIMIT 1001`, user, ...valid.args).toArray();
      if (rows.length > 1000) fail(409, "review_capacity", "检查预览每用户最多1000条当前有效记忆");
      return reviewMemories(rows.map(record), now, staleBefore);
    }
    if (action === "me") return { ...who, project_id: this.env.PROJECT_ID };
    if (action === "keys") {
      admin(who);
      return this.sql.exec<KeyRow>("SELECT id,name,role,user_id,prefix,created_at,revoked_at FROM api_keys ORDER BY created_at DESC").toArray();
    }
    if (action === "create_key") {
      admin(who);
      if (!["read", "write"].includes(String(input.role))) fail(422, "invalid_role", "请选择读取或读写权限");
      const id = identifier(input.id, "Key ID");
      const name = text(input.name, "Key 名称", 80);
      const user = identifier(input.user_id, "用户标识");
      if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL").one().n >= 100) fail(409, "key_limit", "有效 Key 已达 100 个");
      this.sql.exec("INSERT INTO api_keys VALUES (?,?,?,?,?,?,?,NULL)", id, name, String(input.role), user, text(input.prefix, "Key 前缀"), digest, now);
      return { id, name, user_id: user, role: input.role, prefix: input.prefix, created_at: now, revoked_at: null };
    }
    if (action === "revoke_key") {
      admin(who);
      const id = identifier(input.id, "Key ID");
      this.sql.exec("UPDATE api_keys SET revoked_at=? WHERE id=?", now, id);
      this.sql.exec("DELETE FROM sessions WHERE key_id=?", id);
      this.oauth.purge();
      this.media.invalidate("actor", id);
      return { revoked: true };
    }
    if (action === "audit") {
      admin(who);
      return this.sql.exec<AuditRow>("SELECT * FROM audit ORDER BY id DESC LIMIT 100").toArray();
    }
    if (action === "add") {
      const draft = memoryInput(input, true);
      access(who, draft.user_id, true);
      const requestId = identifier(input.request_id, "请求标识");
      const retry = this.sql.exec<{ digest: string; memory_id: string }>("SELECT digest,memory_id FROM retries WHERE actor=? AND request_id=?", who.key_id, requestId).toArray()[0];
      if (retry) {
        if (retry.digest !== digest) fail(409, "idempotency_conflict", "请求标识已用于其他内容");
        const existing = this.sql.exec<Row>("SELECT * FROM memories WHERE id=?", retry.memory_id).toArray()[0];
        if (!existing) fail(410, "memory_deleted", "原记录已删除或到期，不会因重试重新写入");
        return record(existing);
      }
      if (draft.expires_at && Date.parse(draft.expires_at) <= Date.now()) fail(422, "invalid_expiry", "到期时间必须晚于现在");
      if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM memories").one().n >= MAX_MEMORIES) fail(409, "capacity", "当前项目已达到 10,000 条容量");
      const row: Row = { ...draft, ...storedAttributes(draft), source: JSON.stringify(draft.source), id: crypto.randomUUID(), version: 1, status: "active", created_at: now, updated_at: now };
      this.sql.exec("INSERT INTO memories(id,user_id,content,source,status,version,created_at,updated_at,expires_at,metadata,category,event_time,valid_from,valid_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        row.id, row.user_id, row.content, row.source, row.status, row.version, now, now, row.expires_at,
        row.metadata, row.category, row.event_time, row.valid_from, row.valid_to);
      this.index(row);
      this.intelligence.putVector(row, input._vector);
      this.intelligence.touch(row.user_id);
      this.history(row, "created", "首次保存", who);
      this.sql.exec("INSERT INTO retries VALUES (?,?,?,?,?)", who.key_id, requestId, digest, row.id, new Date(Date.now() + 30 * 86400_000).toISOString());
      return record(row);
    }
    if (["get", "history", "update", "revoke", "delete"].includes(action)) {
      const row = this.get(identifier(input.id, "记忆 ID"), who, ["update", "revoke", "delete"].includes(action));
      if (action === "get") return record(row);
      if (action === "history") return this.sql.exec<HistoryRow>(
        "SELECT version,action,content,source,status,reason,actor,created_at,metadata,category,event_time,valid_from,valid_to FROM history WHERE memory_id=? ORDER BY version DESC", row.id,
      ).toArray().map(item => ({ ...item, ...readAttributes(item), source: JSON.parse(item.source) }));
      if (expectedVersion(input.expected_version) !== row.version) fail(409, "version_conflict", "记录已变化，请刷新后再操作");
      if (action === "delete") {
        this.erase(row.id);
        return { deleted: true, id: row.id, online_copies_removed: true, backup_cleanup_confirmed: false };
      }
      const reason = text(input.reason, "变更原因", 500);
      if (action === "update") {
        const draft = memoryInput({ ...readAttributes(row), ...input, user_id: row.user_id });
        row.content = draft.content;
        row.source = JSON.stringify(draft.source);
        row.expires_at = draft.expires_at;
        Object.assign(row, storedAttributes(draft));
        row.status = "active";
      } else {
        row.status = "revoked";
      }
      row.version++;
      row.updated_at = now;
      row.origin = "explicit";
      this.sql.exec("UPDATE memories SET content=?,source=?,status=?,version=?,updated_at=?,expires_at=? WHERE id=?", row.content, row.source, row.status, row.version, now, row.expires_at, row.id);
      this.sql.exec("UPDATE memories SET metadata=?,category=?,event_time=?,valid_from=?,valid_to=? WHERE id=?", row.metadata, row.category, row.event_time, row.valid_from, row.valid_to, row.id);
      this.sql.exec("UPDATE memories SET origin='explicit' WHERE id=?", row.id);
      this.index(row);
      this.intelligence.putVector(row, action === "update" ? input._vector : undefined);
      this.intelligence.touch(row.user_id);
      this.history(row, action === "update" ? "updated" : "revoked", reason, who);
      return record(row);
    }
    let user = typeof input.user_id === "string" && input.user_id ? identifier(input.user_id, "用户标识") : null;
    if (who.role !== "admin") {
      if (user && user !== who.user_id) fail(404, "not_found", "未找到记录");
      user = who.user_id;
    }
    const clauses = ["(? IS NULL OR m.user_id=?)"];
    const args: (string | number | null)[] = [user, user];
    if (action === "search") {
      const constraints = searchConstraints(input, now);
      const filtered = filterSql(constraints.filter), validity = validitySql(constraints.at);
      const query = text(input.query, "查询", 1000);
      const terms = tokens(query);
      const limit = input.limit === undefined ? 10 : Number(input.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(422, "invalid_limit", "结果条数需为 1 至 50");
      if (!terms.length) return { data: [], retrieval: "lexical" };
      const match = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" OR ");
      const rows = this.sql.exec<Row & { score: number }>(
        `SELECT m.*, -bm25(search_index) AS score FROM search_index JOIN memories m ON m.id=search_index.id
         WHERE search_index MATCH ? AND m.status='active' AND ${clauses[0]} AND (${filtered.sql}) AND (${validity.sql}) ORDER BY bm25(search_index),m.updated_at DESC LIMIT ?`,
        match, ...args, ...filtered.args, ...validity.args, limit,
      ).toArray();
      return { data: rows.map(row => ({ ...record(row), score: row.score })), retrieval: "lexical" };
    }
    if (!["list", "export"].includes(action)) fail(404, "not_found", "未找到操作");
    const filtered = filterSql(parseFilter(input.filter));
    clauses.push(filtered.sql); args.push(...filtered.args);
    if (input.status && input.status !== "all") {
      if (!["active", "revoked"].includes(String(input.status))) fail(422, "invalid_status", "状态无效");
      clauses.push("m.status=?"); args.push(String(input.status));
    }
    const cursor = typeof input.cursor === "string" ? input.cursor : "";
    if (cursor) { identifier(cursor, "游标"); clauses.push("m.id>?"); args.push(cursor); }
    const limit = 50;
    const rows = this.sql.exec<Row>(`SELECT m.* FROM memories m WHERE ${clauses.join(" AND ")} ORDER BY m.id LIMIT ?`, ...args, limit + 1).toArray();
    return { data: rows.slice(0, limit).map(record), next_cursor: rows.length > limit ? rows[limit - 1].id : null, exported_at: action === "export" ? now : undefined };
  }

  async mediaPart(auth: Auth, id: string, part: number, stream: ReadableStream<Uint8Array>): Promise<Outcome> {
    let key: string | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      this.purge();
      const row = this.media.scoped(this.identity(auth), id, true);
      if (!this.env.MEDIA_BUCKET) fail(503, "media_storage_not_configured", "大文件存储尚未配置");
      const parts = this.media.parts(row);
      if (row.state !== "uploading" || !Number.isSafeInteger(part) || part < 1 || part > parts.length + 1) fail(409, "invalid_media_part", "请按顺序上传分片");
      const expected = Math.min(MEDIA_CHUNK_BYTES, row.size_bytes - (part - 1) * MEDIA_CHUNK_BYTES);
      if (expected <= 0) fail(422, "invalid_media_part", "媒体分片大小无效");
      const bytes = new Uint8Array(expected); let size = 0;
      reader = stream.getReader();
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        if (size + chunk.value.length > expected) fail(413, "media_part_limit", "分片大于声明长度");
        bytes.set(chunk.value, size); size += chunk.value.length;
      }
      if (size !== expected) fail(422, "invalid_media_part", "媒体分片大小无效");
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
      if (parts[part - 1]) {
        if (parts[part - 1].sha256 !== sha256) fail(409, "media_part_conflict", "此分片已有不同内容");
        return { ok: true, json: JSON.stringify(this.media.view(row)) };
      }
      key = `pending/${id}/${part}/${crypto.randomUUID()}`;
      await this.env.MEDIA_BUCKET.put(key, bytes, { sha256 });
      const result = this.media.dispatch(this.identity(auth), "media_upload_part", { id, part, size: bytes.byteLength, sha256, key }, "") as { duplicate?: boolean };
      if (result.duplicate) await this.env.MEDIA_BUCKET.delete(key);
      return { ok: true, json: JSON.stringify(result) };
    } catch (error) {
      if (key) await this.env.MEDIA_BUCKET.delete(key);
      return this.failure(error);
    } finally {
      if (reader) { try { await reader.cancel(); } catch {} reader.releaseLock(); }
      else { try { await stream.cancel(); } catch {} }
      await this.schedule();
    }
  }
  async mediaReady(auth: Auth, id: string): Promise<Outcome> {
    try {
      this.purge();
      const who = this.identity(auth), row = this.media.scoped(who, id, true);
      if (row.state !== "uploading") return { ok: true, json: JSON.stringify(this.media.view(row)) };
      if (row.received_bytes !== row.size_bytes) fail(409, "media_upload_incomplete", "媒体上传未完成");
      const data = JSON.parse(row.input);
      const result = this.ctx.storage.transactionSync(() => {
        const job = this.intelligence.dispatch(who, "ingest_begin", { ...data, request_id: `media.${id}` }, row.digest) as { id: string; epoch: number };
        return this.media.dispatch(who, "media_upload_ready", { id, job_id: job.id, auth, epoch: job.epoch }, "");
      });
      await this.schedule();
      return { ok: true, json: JSON.stringify(result) };
    } catch (error) { return this.failure(error); }
  }
  async mediaFile(id: string, token: string, range: string | null): Promise<Response> {
    const row = this.media.get(id);
    if (!row || row.state !== "running" || !row.token_hash || !equalDigest(row.token_hash, await hash(token)) || row.expires_at <= new Date().toISOString()) return new Response(null, { status: 404 });
    try {
      const auth = this.media.auth(row);
      if (auth.root && !equalDigest(auth.root_digest, await hash(this.env.ADMIN_KEY))) return new Response(null, { status: 404 });
      this.identity(auth);
    } catch { return new Response(null, { status: 404 }); }
    let start = 0, end = row.size_bytes - 1;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return new Response(null, { status: 416 });
    }
    return new Response(mediaPartStream(this.env.MEDIA_BUCKET, this.media.parts(row), start, end - start + 1), {
      status: range ? 206 : 200, headers: { "Content-Type": JSON.parse(row.input).mime_type, "Content-Length": String(end - start + 1),
        "Cache-Control": "no-store", "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${row.size_bytes}` } : {}) },
    });
  }
}
