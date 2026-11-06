import { DurableObject } from "cloudflare:workers";
import {
  access, admin, ApiError, equalDigest, expectedVersion, fail, identifier, MAX_MEMORIES,
  memoryInput, text, tokens,
  type AuditRecord, type Identity, type KeyRecord, type MemoryRecord,
} from "./domain";

type Row = { id: string; user_id: string; content: string; source: string; status: "active" | "revoked"; version: number; created_at: string; updated_at: string; expires_at: string | null };
type KeyRow = { [K in keyof KeyRecord]: KeyRecord[K] };
type Grant = KeyRow & { digest: string };
type AuditRow = { [K in keyof AuditRecord]: AuditRecord[K] };
type HistoryRow = { version: number; action: string; content: string; source: string; status: "active" | "revoked"; reason: string; actor: string; created_at: string };
export type Action = "me" | "list" | "search" | "get" | "history" | "add" | "update" | "revoke" | "delete" | "export" | "keys" | "create_key" | "revoke_key" | "audit";
export type Outcome = { ok: true; json: string } | { ok: false; status: number; code: string; message: string };
export interface Auth { digest: string; session: boolean; root: boolean; root_digest: string }
const record = (row: Row): MemoryRecord => ({ ...row, source: JSON.parse(row.source) });

export class MemoryProject extends DurableObject<Env> {
  private sql: SqlStorage;

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
  }

  private identity(auth: Auth): Identity {
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
  }

  private history(row: Row, action: string, reason: string, who: Identity) {
    this.sql.exec("INSERT INTO history VALUES (?,?,?,?,?,?,?,?,?)", row.id, row.version, action, row.content, row.source, row.status, reason, who.key_id, row.updated_at);
  }

  private erase(id: string) {
    this.sql.exec("DELETE FROM search_index WHERE id=?", id);
    this.sql.exec("DELETE FROM history WHERE memory_id=?", id);
    this.sql.exec("DELETE FROM memories WHERE id=?", id);
    // Keep only the retry tombstone until its expiry, preventing an old retry from resurrecting deleted data.
  }

  private purge() {
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      for (const row of this.sql.exec<{ id: string }>("SELECT id FROM memories WHERE expires_at<=?", now).toArray()) this.erase(row.id);
      this.sql.exec("DELETE FROM retries WHERE expires_at<=?", now);
      this.sql.exec("DELETE FROM sessions WHERE expires_at<=?", now);
    });
  }

  private async schedule() {
    const next = this.sql.exec<{ expires: string | null }>(
      "SELECT MIN(expires_at) AS expires FROM (SELECT expires_at FROM memories UNION ALL SELECT expires_at FROM sessions UNION ALL SELECT expires_at FROM retries)",
    ).one().expires;
    if (next) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Date.parse(next)));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() { this.purge(); await this.schedule(); }

  private dispatch(who: Identity, action: Action, input: Record<string, unknown>, digest: string): unknown {
    const now = new Date().toISOString();
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
      const row: Row = { ...draft, source: JSON.stringify(draft.source), id: crypto.randomUUID(), version: 1, status: "active", created_at: now, updated_at: now };
      this.sql.exec("INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?)", row.id, row.user_id, row.content, row.source, row.status, row.version, now, now, row.expires_at);
      this.index(row);
      this.history(row, "created", "首次保存", who);
      this.sql.exec("INSERT INTO retries VALUES (?,?,?,?,?)", who.key_id, requestId, digest, row.id, new Date(Date.now() + 30 * 86400_000).toISOString());
      return record(row);
    }
    if (["get", "history", "update", "revoke", "delete"].includes(action)) {
      const row = this.get(identifier(input.id, "记忆 ID"), who, ["update", "revoke", "delete"].includes(action));
      if (action === "get") return record(row);
      if (action === "history") return this.sql.exec<HistoryRow>(
        "SELECT version,action,content,source,status,reason,actor,created_at FROM history WHERE memory_id=? ORDER BY version DESC", row.id,
      ).toArray().map(item => ({ ...item, source: JSON.parse(item.source) }));
      if (expectedVersion(input.expected_version) !== row.version) fail(409, "version_conflict", "记录已变化，请刷新后再操作");
      if (action === "delete") {
        this.erase(row.id);
        return { deleted: true, id: row.id, online_copies_removed: true, backup_cleanup_confirmed: false };
      }
      const reason = text(input.reason, "变更原因", 500);
      if (action === "update") {
        const draft = memoryInput({ ...input, user_id: row.user_id });
        row.content = draft.content;
        row.source = JSON.stringify(draft.source);
        row.expires_at = draft.expires_at;
        row.status = "active";
      } else {
        row.status = "revoked";
      }
      row.version++;
      row.updated_at = now;
      this.sql.exec("UPDATE memories SET content=?,source=?,status=?,version=?,updated_at=?,expires_at=? WHERE id=?", row.content, row.source, row.status, row.version, now, row.expires_at, row.id);
      this.index(row);
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
      const query = text(input.query, "查询", 1000);
      const terms = tokens(query);
      const limit = input.limit === undefined ? 10 : Number(input.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(422, "invalid_limit", "结果条数需为 1 至 50");
      if (!terms.length) return { data: [], retrieval: "lexical" };
      const match = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" OR ");
      const rows = this.sql.exec<Row & { score: number }>(
        `SELECT m.*, -bm25(search_index) AS score FROM search_index JOIN memories m ON m.id=search_index.id
         WHERE search_index MATCH ? AND m.status='active' AND ${clauses[0]} ORDER BY bm25(search_index),m.updated_at DESC LIMIT ?`,
        match, ...args, limit,
      ).toArray();
      return { data: rows.map(row => ({ ...record(row), score: row.score })), retrieval: "lexical" };
    }
    if (!["list", "export"].includes(action)) fail(404, "not_found", "未找到操作");
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
}
