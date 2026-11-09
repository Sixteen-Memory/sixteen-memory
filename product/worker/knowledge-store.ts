import { access, fail, identifier, text, type Identity } from "./domain";
import type { ConversationStore } from "./conversations";
import { knowledgePlan, type KnowledgePlan, type KnowledgeSource } from "./knowledge-domain";
import { validitySql } from "./memory-filter";

export type KnowledgeAction = "knowledge_begin" | "knowledge_finish" | "knowledge_fail" | "knowledge_get_run" | "knowledge_runs" | "knowledge_resolve" | "wiki_list" | "wiki_get" | "knowledge_graph";
type Run = { id: string; user_id: string; actor: string; request_id: string; digest: string; epoch: number; state: string; proposal: string | null; error: string | null; created_at: string; expires_at: string };
type PageRow = { id: string; user_id: string; slug: string; title: string; body: string; run_id: string; created_at: string };
export class KnowledgeStore {
  constructor(private sql: SqlStorage, private conversations: ConversationStore, private epoch: (user: string) => number) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,actor TEXT NOT NULL,request_id TEXT NOT NULL,digest TEXT NOT NULL,epoch INTEGER NOT NULL,state TEXT NOT NULL,proposal TEXT,error TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,UNIQUE(actor,request_id));
      CREATE INDEX IF NOT EXISTS knowledge_runs_user ON knowledge_runs(user_id,created_at);
      CREATE TABLE IF NOT EXISTS wiki_pages(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,slug TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,run_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,slug));
      CREATE TABLE IF NOT EXISTS knowledge_edges(user_id TEXT NOT NULL,run_id TEXT NOT NULL,body TEXT NOT NULL);
    `);
  }
  invalidate(user: string) {
    this.sql.exec("DELETE FROM wiki_pages WHERE user_id=?", user);
    this.sql.exec("DELETE FROM knowledge_edges WHERE user_id=?", user);
    this.sql.exec("UPDATE knowledge_runs SET state='stale',proposal=NULL WHERE user_id=? AND state IN ('running','review','applied')", user);
  }
  purge(now: string) {
    this.sql.exec("UPDATE knowledge_runs SET state='expired',proposal=NULL WHERE state IN ('running','review') AND expires_at<=?", now);
    this.sql.exec("DELETE FROM knowledge_runs WHERE created_at<? AND state!='applied'", new Date(Date.parse(now) - 30 * 86400_000).toISOString());
  }
  private run(who: Identity, id: unknown, write = false) {
    const row = this.sql.exec<Run>("SELECT * FROM knowledge_runs WHERE id=?", identifier(id, "整理任务ID")).toArray()[0];
    if (!row) fail(404, "not_found", "未找到整理任务");
    access(who, row.user_id, write); return row;
  }
  private view(row: Run) {
    return { id: row.id, user_id: row.user_id, state: row.state, proposal: row.proposal ? JSON.parse(row.proposal) as KnowledgePlan : null, error: row.error, created_at: row.created_at, expires_at: row.expires_at };
  }
  private apply(row: Run, plan: KnowledgePlan) {
    if (this.epoch(row.user_id) !== row.epoch) fail(409, "scope_changed", "来源已变化，请重新整理");
    if (!this.sourcesCurrent(row.user_id, plan.sources)) fail(409, "scope_changed", "来源已失效，请重新整理");
    // A run replaces one user's complete derived wiki, never the original records.
    this.sql.exec("DELETE FROM wiki_pages WHERE user_id=?", row.user_id);
    this.sql.exec("DELETE FROM knowledge_edges WHERE user_id=?", row.user_id);
    this.sql.exec("UPDATE knowledge_runs SET state='replaced',proposal=NULL WHERE user_id=? AND state='applied'", row.user_id);
    for (const page of plan.pages) {
      const sourceKeys = new Set([...page.claims.flatMap(c => c.citations.map(s => s.source_key)),
        ...plan.edges.filter(e => e.from === page.slug || e.to === page.slug).flatMap(e => e.citations.map(s => s.source_key))]);
      const sources = plan.sources.filter(s => sourceKeys.has(s.key)).map(({ text, ...source }) => source);
      this.sql.exec("INSERT INTO wiki_pages VALUES (?,?,?,?,?,?,?)", crypto.randomUUID(), row.user_id, page.slug, page.title, JSON.stringify({ ...page, sources }), row.id, new Date().toISOString());
    }
    for (const edge of plan.edges) this.sql.exec("INSERT INTO knowledge_edges VALUES (?,?,?)", row.user_id, row.id, JSON.stringify(edge));
    this.sql.exec("UPDATE knowledge_runs SET state='applied',proposal=NULL WHERE id=?", row.id);
  }
  private sourcesCurrent(user: string, sources: Pick<KnowledgeSource, "kind" | "id" | "version">[]) {
    const now = new Date().toISOString(), valid = validitySql(now);
    return sources.every(source => {
      if (source.kind === "memory") return this.sql.exec(`SELECT m.id FROM memories m WHERE m.id=? AND m.user_id=? AND m.version=? AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>?) AND ${valid.sql}`, source.id, user, source.version, now, ...valid.args).toArray().length > 0;
      return this.sql.exec("SELECT id FROM conversations WHERE id=? AND user_id=? AND version=? AND (expires_at IS NULL OR expires_at>?)", source.id, user, source.version, now).toArray().length > 0;
    });
  }
  dispatch(who: Identity, action: KnowledgeAction, input: Record<string, unknown>, digest: string) {
    const now = new Date().toISOString();
    if (["knowledge_get_run", "knowledge_finish", "knowledge_fail", "knowledge_resolve"].includes(action)) {
      const row = this.run(who, input.id, action !== "knowledge_get_run");
      if (action === "knowledge_get_run") {
        if (row.proposal && !this.sourcesCurrent(row.user_id, JSON.parse(row.proposal).sources)) {
          this.invalidate(row.user_id); return this.view(this.run(who, row.id));
        }
        return this.view(row);
      }
      if (action === "knowledge_fail") {
        if (row.state === "running") this.sql.exec("UPDATE knowledge_runs SET state='failed',proposal=NULL,error=? WHERE id=?", text(input.code, "错误代码", 100), row.id);
      } else if (action === "knowledge_finish") {
        if (row.state !== "running" || row.epoch !== this.epoch(row.user_id)) fail(409, "scope_changed", "整理任务或来源已变化");
        const plan = knowledgePlan(input.plan, input.sources as KnowledgeSource[]);
        plan.unsupported_items = Array.isArray(input.unsupported_items) ? input.unsupported_items as number[] : [];
        if (input.auto === true) this.apply(row, plan);
        else this.sql.exec("UPDATE knowledge_runs SET state='review',proposal=? WHERE id=?", JSON.stringify(plan), row.id);
      } else {
        if (typeof input.approve !== "boolean") fail(422, "invalid_approval", "approve必须是布尔值");
        if (row.state !== "review" || !row.proposal) fail(409, "not_reviewable", "此任务无法确认");
        if (input.approve) this.apply(row, JSON.parse(row.proposal));
        else this.sql.exec("UPDATE knowledge_runs SET state='rejected',proposal=NULL WHERE id=?", row.id);
      }
      return this.view(this.run(who, row.id));
    }
    const user = identifier(input.user_id, "用户标识"); access(who, user, action === "knowledge_begin");
    if (action === "knowledge_begin") {
      const requestId = identifier(input.request_id, "请求ID");
      const old = this.sql.exec<Run>("SELECT * FROM knowledge_runs WHERE actor=? AND request_id=?", who.key_id, requestId).toArray()[0];
      if (old) {
        if (old.digest !== digest) fail(409, "idempotency_conflict", "请求ID已用于其他内容");
        return { replay: true, job: this.view(old) };
      }
      if (this.sql.exec("SELECT id FROM knowledge_runs WHERE user_id=? AND state IN ('running','review')", user).toArray().length) fail(409, "knowledge_busy", "已有待处理的整理任务");
      const ids = (value: unknown, max: number) => {
        if (value === undefined) return [];
        if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string")) fail(422, "invalid_sources", "来源ID列表无效");
        const result = value.map(v => identifier(v, "来源ID"));
        if (new Set(result).size !== result.length) fail(422, "invalid_sources", "来源ID重复"); return result;
      };
      const memoryIds = ids(input.memory_ids, 32), conversationIds = ids(input.conversation_ids, 8);
      if (!memoryIds.length && !conversationIds.length) fail(422, "empty_sources", "请选择至少一份来源");
      const sources: KnowledgeSource[] = [];
      const valid = validitySql(now);
      for (const id of memoryIds) {
        const memory = this.sql.exec<{ id: string; user_id: string; version: number; source: string }>(`SELECT m.id,m.user_id,m.version,m.source FROM memories m WHERE m.id=? AND m.user_id=? AND m.status='active' AND ${valid.sql}`, id, user, ...valid.args).toArray()[0];
        if (!memory) fail(404, "not_found", "未找到有效来源");
        const source = JSON.parse(memory.source);
        sources.push({ key: `m:${id}`, kind: "memory", id, version: memory.version, role: "memory", text: source.text,
          observed_at: source.observed_at, source_type: source.type, ref: source.ref });
      }
      for (const id of conversationIds) {
        const conversation = this.conversations.get(who, id);
        if (conversation.user_id !== user) fail(404, "not_found", "未找到有效来源");
        for (const message of this.conversations.allMessages(id)) sources.push({ key: `c:${id}:${message.id}`, kind: "conversation", id, version: conversation.version, message_id: message.id, role: message.role, text: message.content, observed_at: message.observed_at });
      }
      if (JSON.stringify(sources).length > 40000) fail(413, "knowledge_source_limit", "所选完整来源超过40000字符，请减少来源数量；未截断原文");
      const row: Run = { id: crypto.randomUUID(), user_id: user, actor: who.key_id, request_id: requestId, digest, epoch: this.epoch(user), state: "running", proposal: null, error: null, created_at: now, expires_at: new Date(Date.now() + 86400_000).toISOString() };
      this.sql.exec("INSERT INTO knowledge_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)", row.id, user, who.key_id, requestId, digest, row.epoch, row.state, null, null, now, row.expires_at);
      return { replay: false, job: this.view(row), sources, epoch: row.epoch };
    }
    if (action === "knowledge_runs") {
      const pending = this.sql.exec<Run>("SELECT * FROM knowledge_runs WHERE user_id=? AND proposal IS NOT NULL", user).toArray();
      if (pending.some(row => !this.sourcesCurrent(user, JSON.parse(row.proposal!).sources))) this.invalidate(user);
      return this.sql.exec<Run>("SELECT * FROM knowledge_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 30", user).toArray().map(row => this.view(row));
    }
    let pages = this.sql.exec<PageRow>("SELECT * FROM wiki_pages WHERE user_id=? ORDER BY slug", user).toArray();
    if (pages.some(page => !this.sourcesCurrent(user, JSON.parse(page.body).sources))) { this.invalidate(user); pages = []; }
    const viewPage = (row: PageRow) => ({ id: row.id, user_id: row.user_id, run_id: row.run_id, created_at: row.created_at, ...JSON.parse(row.body) });
    if (action === "wiki_get") {
      const page = pages.find(p => p.slug === input.slug);
      if (!page) fail(404, "not_found", "未找到知识页");
      return viewPage(page);
    }
    if (action === "wiki_list") return { data: pages.map(viewPage) };
    return {
      nodes: pages.map(({ id, slug, title }) => ({ id, slug, title })),
      edges: this.sql.exec<{ body: string }>("SELECT body FROM knowledge_edges WHERE user_id=?", user).toArray().map(e => JSON.parse(e.body)),
      sources: [...new Map(pages.flatMap(page => JSON.parse(page.body).sources as Omit<KnowledgeSource, "text">[]).map(source => [source.key, source])).values()],
    };
  }
}
