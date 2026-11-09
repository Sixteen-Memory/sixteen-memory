import { access, date, expectedVersion, fail, identifier, object, rejectSecrets, text, tokens, type Identity } from "./domain";
import { boundedInteger } from "./memory-context";

export type Message = { id: string; role: "user" | "assistant" | "system" | "tool"; content: string; observed_at: string };
export type Conversation = { id: string; user_id: string; title: string; version: number; created_at: string; updated_at: string; expires_at: string | null };
export type ConversationPage = Conversation & { messages: Message[]; next_cursor: string | null };
export type ConversationAction = "conversation_add" | "conversation_append" | "conversation_get" | "conversation_list" | "conversation_search" | "conversation_delete";

function messages(input: unknown): Message[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) fail(422, "invalid_messages", "每次写入需要1至32条消息");
  const result = input.map(item => {
    const row = object(item);
    if (!["user", "assistant", "system", "tool"].includes(String(row.role))) fail(422, "invalid_role", "消息角色无效");
    text(row.content, "消息正文", 8000);
    const content = row.content as string; rejectSecrets(content);
    return { id: identifier(row.id, "消息ID"), role: row.role as Message["role"], content, observed_at: date(row.observed_at, "消息时间") };
  });
  if (new Set(result.map(row => row.id)).size !== result.length) fail(422, "duplicate_message", "消息ID不可重复");
  if (result.reduce((n, row) => n + row.content.length, 0) > 16000) fail(422, "message_limit", "单次消息正文最多16000字符，请分批追加");
  return result;
}

export class ConversationStore {
  constructor(private sql: SqlStorage, private touch: (user: string) => void) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT);
      CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id,id);
      CREATE INDEX IF NOT EXISTS conversations_expiry ON conversations(expires_at);
      CREATE TABLE IF NOT EXISTS conversation_messages(conversation_id TEXT NOT NULL,seq INTEGER NOT NULL,id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,observed_at TEXT NOT NULL,PRIMARY KEY(conversation_id,id),UNIQUE(conversation_id,seq));
      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_index USING fts5(conversation_id UNINDEXED,message_id UNINDEXED,terms,tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS conversation_retries(actor TEXT NOT NULL,request_id TEXT NOT NULL,digest TEXT NOT NULL,conversation_id TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(actor,request_id));
    `);
  }
  get(who: Identity, id: unknown, write = false): Conversation {
    const row = this.sql.exec<Conversation>("SELECT * FROM conversations WHERE id=?", identifier(id, "会话ID")).toArray()[0];
    if (!row) fail(404, "not_found", "未找到会话");
    access(who, row.user_id, write); return row;
  }
  allMessages(id: string): Message[] {
    return this.sql.exec<Message>("SELECT id,role,content,observed_at FROM conversation_messages WHERE conversation_id=? ORDER BY seq", id).toArray();
  }
  erase(row: Conversation) {
    this.sql.exec("DELETE FROM conversation_index WHERE conversation_id=?", row.id);
    this.sql.exec("DELETE FROM conversation_messages WHERE conversation_id=?", row.id);
    this.sql.exec("DELETE FROM conversations WHERE id=?", row.id);
    this.touch(row.user_id);
  }
  purge(now: string) {
    for (const row of this.sql.exec<Conversation>("SELECT * FROM conversations WHERE expires_at<=?", now).toArray()) this.erase(row);
    this.sql.exec("DELETE FROM conversation_retries WHERE expires_at<=?", now);
  }
  dispatch(who: Identity, action: ConversationAction, input: Record<string, unknown>, digest: string) {
    const now = new Date().toISOString();
    if (action === "conversation_get" || action === "conversation_delete") {
      const row = this.get(who, input.id, action === "conversation_delete");
      if (action === "conversation_delete") {
        if (expectedVersion(input.expected_version) !== row.version) fail(409, "version_conflict", "会话已变化");
        this.erase(row);
        return { deleted: true, id: row.id, online_copies_removed: true, backup_cleanup_confirmed: false };
      }
      const cursor = input.cursor === undefined || input.cursor === "" ? 0 : Number(input.cursor);
      if (!Number.isSafeInteger(cursor) || cursor < 0) fail(422, "invalid_cursor", "消息游标无效");
      const rows = this.sql.exec<Message & { seq: number }>("SELECT id,role,content,observed_at,seq FROM conversation_messages WHERE conversation_id=? AND seq>? ORDER BY seq LIMIT 33", row.id, cursor).toArray();
      return { ...row, messages: rows.slice(0, 32).map(({ seq, ...message }) => message), next_cursor: rows.length > 32 ? String(rows[31].seq) : null };
    }
    if (action === "conversation_add" || action === "conversation_append") {
      const requestId = identifier(input.request_id, "请求ID");
      const retry = this.sql.exec<{ digest: string; conversation_id: string }>("SELECT digest,conversation_id FROM conversation_retries WHERE actor=? AND request_id=?", who.key_id, requestId).toArray()[0];
      if (retry) {
        if (retry.digest !== digest) fail(409, "idempotency_conflict", "请求ID已用于其他内容");
        const current = this.sql.exec<Conversation>("SELECT * FROM conversations WHERE id=?", retry.conversation_id).toArray()[0];
        if (!current) fail(410, "conversation_deleted", "原会话已删除或到期");
        access(who, current.user_id, true); return current;
      }
      const existing = action === "conversation_append" ? this.get(who, input.id, true) : null;
      const user = existing?.user_id ?? identifier(input.user_id, "用户标识");
      access(who, user, true);
      const batch = messages(input.messages);
      if (existing && expectedVersion(input.expected_version) !== existing.version) fail(409, "version_conflict", "会话已变化");
      const expires = existing?.expires_at ?? (input.expires_at == null ? null : date(input.expires_at, "到期时间"));
      if (expires && expires <= now) fail(422, "invalid_expiry", "到期时间必须晚于现在");
      const count = existing ? this.sql.exec<{ n: number }>("SELECT count(*) n FROM conversation_messages WHERE conversation_id=?", existing.id).one().n : 0;
      if (count + batch.length > 1000) fail(409, "conversation_capacity", "每个会话最多1000条消息");
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM conversation_messages").one().n + batch.length > 100000) fail(409, "conversation_capacity", "项目会话消息容量已满");
      if (!existing && this.sql.exec<{ n: number }>("SELECT count(*) n FROM conversations").one().n >= 1000) fail(409, "conversation_capacity", "项目会话数量已满");
      const title = existing?.title ?? text(input.title, "会话标题", 200); rejectSecrets(title);
      const row: Conversation = existing ? { ...existing, version: existing.version + 1, updated_at: now } :
        { id: crypto.randomUUID(), user_id: user, title, version: 1, created_at: now, updated_at: now, expires_at: expires };
      if (existing) {
        for (const message of batch) if (this.sql.exec("SELECT id FROM conversation_messages WHERE conversation_id=? AND id=?", row.id, message.id).toArray().length) fail(409, "duplicate_message", "消息ID已存在");
        this.sql.exec("UPDATE conversations SET version=?,updated_at=? WHERE id=?", row.version, now, row.id);
      } else this.sql.exec("INSERT INTO conversations VALUES (?,?,?,?,?,?,?)", row.id, user, title, 1, now, now, expires);
      batch.forEach((message, index) => {
        this.sql.exec("INSERT INTO conversation_messages VALUES (?,?,?,?,?,?)", row.id, count + index + 1, message.id, message.role, message.content, message.observed_at);
        this.sql.exec("INSERT INTO conversation_index VALUES (?,?,?)", row.id, message.id, tokens(message.content, 8000).join(" "));
      });
      this.sql.exec("INSERT INTO conversation_retries VALUES (?,?,?,?,?)", who.key_id, requestId, digest, row.id, new Date(Date.now() + 30 * 86400_000).toISOString());
      this.touch(user); return row;
    }
    const user = identifier(input.user_id, "用户标识"); access(who, user);
    if (action === "conversation_list") {
      const cursor = input.cursor ? identifier(input.cursor, "游标") : "";
      const rows = this.sql.exec<Conversation>("SELECT * FROM conversations WHERE user_id=? AND id>? ORDER BY id LIMIT 51", user, cursor).toArray();
      return { data: rows.slice(0, 50), next_cursor: rows.length > 50 ? rows[49].id : null };
    }
    const query = text(input.query, "查询", 1000);
    const limit = boundedInteger(input.limit, 10, 1, 50, "limit");
    const terms = tokens(query);
    if (!terms.length) return { data: [], retrieval: "conversation_lexical" };
    const rows = this.sql.exec<Message & { conversation_id: string; conversation_version: number; title: string; score: number }>(`
      SELECT m.id,m.role,m.content,m.observed_at,c.id AS conversation_id,c.version AS conversation_version,c.title,-bm25(conversation_index) AS score
      FROM conversation_index i JOIN conversations c ON c.id=i.conversation_id JOIN conversation_messages m ON m.conversation_id=c.id AND m.id=i.message_id
      WHERE conversation_index MATCH ? AND c.user_id=? ORDER BY bm25(conversation_index),c.id,m.seq LIMIT ?`,
    terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" OR "), user, limit).toArray();
    return { data: rows, retrieval: "conversation_lexical" };
  }
}
