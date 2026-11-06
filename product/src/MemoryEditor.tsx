import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { api, errorMessage } from "./api";
import { Dialog } from "./Dialog";
import type { MemoryRecord, Source } from "../worker/domain";

export function MemoryEditor({ entry, userId, close, saved }: { entry?: MemoryRecord; userId: string; close: () => void; saved: () => void }) {
  const [content, setContent] = useState(entry?.content ?? "");
  const [user, setUser] = useState(entry?.user_id ?? userId);
  const [sourceType, setSourceType] = useState<Source["type"]>(entry?.source.type ?? "manual");
  const [reference, setReference] = useState(entry?.source.ref ?? "");
  const [evidence, setEvidence] = useState(entry?.source.text ?? "");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState(entry?.expires_at?.slice(0, 10) ?? "");
  const [observed, setObserved] = useState(entry?.source.observed_at ?? new Date().toISOString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const value = {
        user_id: user, content,
        source: { type: sourceType, ref: reference, text: evidence, observed_at: observed },
        expires_at: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null,
      };
      if (entry) await api.update(entry.id, { ...value, expected_version: entry.version, reason });
      else await api.add({ ...value, request_id: requestId });
      saved(); close();
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof Error && "status" in error && error.status === 422) setRequestId(crypto.randomUUID());
    }
    finally { setBusy(false); }
  }
  return <Dialog title={entry ? "更新记忆" : "新增记忆"} close={close}>
    <form onSubmit={submit} className="form-stack">
      <div className="form-grid"><label>用户标识<input required value={user} disabled={!!entry || !!userId} onChange={e => setUser(e.target.value)} maxLength={100} /></label>
        <label>来源类型<select value={sourceType} onChange={e => setSourceType(e.target.value as Source["type"])}><option value="manual">人工确认</option><option value="conversation">对话</option><option value="business">业务事件</option></select></label></div>
      <label>记忆内容<textarea required rows={3} value={content} maxLength={8000} onChange={e => setContent(e.target.value)} /></label>
      <label>来源标识<input required value={reference} maxLength={300} onChange={e => setReference(e.target.value)} placeholder="ticket-104 / session-2026-11-04" /></label>
      <label>来源正文<textarea required rows={3} value={evidence} maxLength={8000} onChange={e => setEvidence(e.target.value)} /></label>
      <div className="form-grid"><label>来源时间<input required value={observed} onChange={e => setObserved(e.target.value)} /></label><label>到期日期<input type="date" value={expires} onChange={e => setExpires(e.target.value)} /></label></div>
      {entry && <label>变更原因<input required value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>}
      {error && <p role="alert" className="error">{error}</p>}
      <footer><button type="button" className="secondary" onClick={close}>取消</button><button className="primary" disabled={busy}><Save size={16} />{busy ? "保存中" : "保存"}</button></footer>
    </form>
  </Dialog>;
}
