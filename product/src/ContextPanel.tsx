import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ClipboardCopy, Search } from "lucide-react";
import { api, errorMessage, type RetrievalMode } from "./api";
import { useI18n } from "./i18n";
import type { EvidenceSearch, MemoryContext, MemoryReview } from "../sdk/index.mjs";

type Mode = "context" | "evidence" | "review";

export function ContextPanel({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const { lang, t, formatTime, formatDate } = useI18n();
  const findingNames = {
    duplicate_content: t("Duplicate content", "重复内容"),
    slot_conflict: t("Conflicting values for same fact", "同一事实存在不同说法"),
    old_evidence: t("Older source evidence", "原始依据较旧"),
  };
  const [mode, setMode] = useState<Mode>("context");
  const [query, setQuery] = useState("");
  const [retrieval, setRetrieval] = useState<RetrievalMode>("lexical");
  const [budget, setBudget] = useState(6000);
  const [context, setContext] = useState<MemoryContext | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSearch | null>(null);
  const [review, setReview] = useState<MemoryReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function clear() {
    request.current?.abort(); request.current = null;
    setContext(null); setEvidence(null); setReview(null); setError(""); setCopied(false); setBusy(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); clear();
    const controller = new AbortController(); request.current = controller;
    setBusy(true);
    try {
      const call = { signal: controller.signal };
      if (mode === "context") {
        const result = await api.context({ user_id: userId, query, mode: retrieval, max_chars: budget, limit: 10 }, call);
        if (!controller.signal.aborted) setContext(result);
      } else if (mode === "evidence") {
        const result = await api.searchEvidence({ user_id: userId, query, limit: 20 }, call);
        if (!controller.signal.aborted) setEvidence(result);
      } else {
        const result = await api.reviewMemories({ user_id: userId }, call);
        if (!controller.signal.aborted) setReview(result);
      }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error, t("Request failed. Please try again.", "请求失败，请稍后重试"))); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(context?.context ?? ""); setCopied(true); }
    catch { setError(t("Copy failed", "复制失败")); }
  }
  return <section className="context-panel search-view">
    <div className="segmented context-tabs" aria-label={t("View mode", "查看内容")}>
      {([
        ["context", t("Context", "上下文")],
        ["evidence", t("Evidence", "原文依据")],
        ["review", t("Review", "记忆检查")],
      ] as const).map(([value, label]) =>
        <button key={value} aria-pressed={mode === value} onClick={() => { clear(); setMode(value); }}>{label}</button>)}
    </div>
    <form onSubmit={submit} className="context-form">
      {mode === "context" && <div className="form-grid">
        <label>{t("Retrieval mode", "检索模式")}<select value={retrieval} onChange={event => { clear(); setRetrieval(event.target.value as RetrievalMode); }}>
          <option value="lexical">{t("Lexical", "词法")}</option>
          <option value="semantic">{t("Semantic", "语义")}</option>
          <option value="hybrid">{t("Hybrid", "混合")}</option>
        </select></label>
        <label>{t("Max length (UTF-16 chars)", "长度上限（UTF-16 字符）")}<input type="number" min={512} max={24000} step={1} required value={budget}
          onChange={event => { clear(); setBudget(event.target.valueAsNumber); }} /></label>
      </div>}
      {mode !== "review" && <label>{t("Query", "查询")}<input required maxLength={1000} value={query} onChange={event => { clear(); setQuery(event.target.value); }} /></label>}
      <button className="primary" disabled={busy || !userId.trim()}><Search size={16} />{busy ? t("Running...", "查询中") : mode === "review" ? t("Check memories", "检查记忆") : t("Search", "查询")}</button>
    </form>
    {!userId.trim() && <p className="muted">{t("Enter a user ID first.", "请选择用户")}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div aria-live="polite">
      {context && <>
        <div className="context-summary"><span>{lang === "zh" ? `${context.memories.length} 条 · ${context.budget.used} / ${context.budget.limit} 字符` : `${context.memories.length} records · ${context.budget.used} / ${context.budget.limit} chars`}</span>
          <button className="icon-button" title={copied ? t("Copied", "已复制") : t("Copy context", "复制上下文")} aria-label={t("Copy context", "复制上下文")} disabled={!context.context} onClick={() => void copy()}>
            {copied ? <Check size={17} /> : <ClipboardCopy size={17} />}
          </button>
        </div>
        {context.truncated && <p className="context-warning">{lang === "zh" ? `有 ${context.omitted_count} 条候选未纳入当前长度或条数上限。` : `${context.omitted_count} candidate records omitted to respect the current budget.`}</p>}
        {context.degraded && <p className="context-warning">{t("Fell back to lexical results: ", "本次使用词法结果：")}{context.warning}</p>}
        {context.memories.map(memory => <article className="result" key={memory.id}>
          <header><span className="mono">{memory.id}</span><small>v{memory.version}</small></header><p>{memory.content}</p>
          {memory.sources.map((source, index) => <details key={index}><summary>{source.ref} · {formatTime(source.observed_at)}</summary><blockquote>{source.text}</blockquote></details>)}
          <footer><button className="secondary" onClick={() => onOpen(memory.id)}>{t("Inspect memory", "查看记忆")}</button></footer>
        </article>)}
        {!context.memories.length && <p className="empty">{context.candidate_count ? t("No complete record fits the current character budget.", "没有可完整纳入当前长度上限的记忆") : t("No matching active memories.", "没有匹配的有效记忆")}</p>}
        {context.context && <details><summary>{t("Context JSON", "上下文 JSON")}</summary><pre className="context-json">{context.context}</pre></details>}
      </>}
      {evidence && <>
        <p className="context-summary">{lang === "zh" ? `${evidence.data.length} 条依据` : `${evidence.data.length} evidence matches`}</p>
        {evidence.data.map((hit, index) => <article className="result" key={`${hit.memory_id}-${index}`}>
          <header><span>{hit.kind === "primary" ? t("Primary source", "原始依据") : t("Supporting source", "补充依据")}</span><small>v{hit.memory_version}</small></header>
          <p>{hit.content}</p><blockquote>{hit.source.text}</blockquote>
          <footer><span>{hit.source.ref}</span><button className="secondary" onClick={() => onOpen(hit.memory_id)}>{t("Inspect memory", "查看记忆")}</button></footer>
        </article>)}
        {!evidence.data.length && <p className="empty">{t("No matching active source evidence.", "没有匹配的有效依据")}</p>}
      </>}
      {review && <>
        <p className="context-summary">{lang === "zh" ? `已检查 ${review.scanned} 条 · ${review.finding_count} 项待查看 · 未更改记忆` : `Scanned ${review.scanned} records · ${review.finding_count} findings · read-only`}</p>
        <p className="muted">{lang === "zh" ? `原始依据时间早于 ${formatDate(review.stale_before)} 的记录已标出，不代表内容错误。` : `Sources observed before ${formatDate(review.stale_before)} are flagged for review; older does not imply incorrect.`}</p>
        {review.findings.map((finding, index) => <article className="result" key={index}>
          <h2>{findingNames[finding.kind]}</h2>{finding.fact_key && <p className="mono">{finding.fact_key}</p>}
          <ul className="review-links">{finding.memories.map(memory => <li key={memory.id}>
            <button onClick={() => onOpen(memory.id)}>{memory.id} · v{memory.version}</button>
          </li>)}</ul>
        </article>)}
        {review.truncated && <p className="context-warning">{t("Showing the first 100 findings only.", "当前只显示前 100 项。")}</p>}
        {!review.findings.length && <p className="empty">{t("No duplicates, slot conflicts, or aged sources found.", "未发现这三类问题")}</p>}
      </>}
    </div>
  </section>;
}
