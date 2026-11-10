import { access, fail, identifier, type Identity } from "./domain";
import { MEDIA_CHUNK_BYTES, mediaUploadInput } from "./media-domain";
import type { Auth } from "./project";

type Part = { key: string; sha256: string; size: number };
export type MediaUpload = {
  id: string; actor: string; user_id: string; request_id: string; digest: string; input: string;
  size_bytes: number; received_bytes: number; parts: string; state: string; expires_at: string;
  job_id: string | null; auth: string | null; token_hash: string | null; next_at: string | null; error: string | null;
};
export type MediaUploadAction = "media_upload_begin" | "media_upload_get" | "media_upload_part" | "media_upload_ready" | "media_upload_delete";
export class MediaStore {
  constructor(private sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS media_uploads (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
      digest TEXT NOT NULL, input TEXT NOT NULL, size_bytes INTEGER NOT NULL, received_bytes INTEGER NOT NULL,
      parts TEXT NOT NULL, state TEXT NOT NULL, expires_at TEXT NOT NULL, job_id TEXT, auth TEXT,
      token_hash TEXT, next_at TEXT, error TEXT, UNIQUE(actor,request_id)
    )`);
  }
  get(id: string) { return this.sql.exec<MediaUpload>("SELECT * FROM media_uploads WHERE id=?", id).toArray()[0]; }
  scoped(who: Identity, id: unknown, write = false) {
    const row = this.get(identifier(id, "上传ID"));
    if (!row) fail(404, "not_found", "未找到媒体上传");
    access(who, row.user_id, write);
    return row;
  }
  view(row: MediaUpload) {
    return { id: row.id, user_id: row.user_id, state: row.state, size_bytes: row.size_bytes, received_bytes: row.received_bytes,
      part_size: MEDIA_CHUNK_BYTES, next_part: (JSON.parse(row.parts) as Part[]).length + 1,
      expires_at: row.expires_at, ingestion_id: row.job_id, error: row.error };
  }
  dispatch(who: Identity, action: MediaUploadAction, input: Record<string, unknown>, digest: string) {
    if (action === "media_upload_begin") {
      const data = mediaUploadInput(input); access(who, data.user_id, true);
      if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) fail(422, "invalid_expiry", "到期时间已过");
      const old = this.sql.exec<MediaUpload>("SELECT * FROM media_uploads WHERE actor=? AND request_id=?", who.key_id, data.request_id).toArray()[0];
      if (old) { if (old.digest !== digest) fail(409, "idempotency_conflict", "请求标识已用于其他内容"); return this.view(old); }
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM media_uploads WHERE state IN ('uploading','queued','running')").one().n >= 8) fail(409, "media_upload_limit", "项目已有8个待处理媒体，请先完成或清理");
      const id = crypto.randomUUID(), expires = new Date(Math.min(Date.now() + 2 * 3600_000, data.expires_at ? Date.parse(data.expires_at) : Infinity)).toISOString();
      this.sql.exec("INSERT INTO media_uploads VALUES (?,?,?,?,?,?,?,0,'[]','uploading',?,NULL,NULL,NULL,NULL,NULL)", id,who.key_id,data.user_id,data.request_id,digest,JSON.stringify(data),data.size_bytes,expires);
      return this.view(this.get(id)!);
    }
    const row = this.scoped(who, input.id, action !== "media_upload_get");
    if (action === "media_upload_get") return this.view(row);
    if (action === "media_upload_part") {
      if (row.state !== "uploading") fail(409, "invalid_state", "媒体不在上传状态");
      const parts = JSON.parse(row.parts) as Part[], index = Number(input.part) - 1;
      const size = Number(input.size), sha256 = String(input.sha256), key = String(input.key);
      if (!Number.isSafeInteger(index) || index < 0 || index > parts.length) fail(409, "invalid_media_part", "请按顺序上传分片");
      if (parts[index]) {
        if (parts[index].sha256 !== sha256 || parts[index].size !== size) fail(409, "media_part_conflict", "此分片已上传其他内容");
        return { ...this.view(row), duplicate: true };
      }
      const expected = Math.min(MEDIA_CHUNK_BYTES, row.size_bytes - row.received_bytes);
      if (size !== expected || size <= 0) fail(422, "invalid_media_part", "分片大小与声明的文件大小不符");
      parts.push({ key, sha256, size });
      this.sql.exec("UPDATE media_uploads SET parts=?,received_bytes=received_bytes+? WHERE id=?", JSON.stringify(parts),size,row.id);
      return this.view(this.get(row.id)!);
    }
    if (action === "media_upload_ready") {
      if (row.state !== "uploading") return this.view(row);
      if (row.received_bytes !== row.size_bytes) fail(409, "media_upload_incomplete", "文件尚未完整上传");
      this.sql.exec("UPDATE media_uploads SET state='queued',job_id=?,auth=?,next_at=?,input=? WHERE id=?", String(input.job_id),JSON.stringify(input.auth),new Date(Date.now() + 1000).toISOString(),JSON.stringify({ ...JSON.parse(row.input), _epoch: input.epoch }),row.id);
      return this.view(this.get(row.id)!);
    }
    this.sql.exec("UPDATE media_uploads SET state='cancelled',token_hash=NULL,auth=NULL,next_at=NULL WHERE id=?",row.id);
    this.sql.exec("UPDATE ingest_jobs SET state='deleted',plan=NULL WHERE id=? AND state IN ('running','review')",row.job_id);
    return this.view(this.get(row.id)!);
  }
  queued() { return this.sql.exec<MediaUpload>("SELECT * FROM media_uploads WHERE state='queued' ORDER BY next_at LIMIT 1").toArray()[0]; }
  start(id: string, tokenHash: string) {
    this.sql.exec("UPDATE media_uploads SET state='running',token_hash=?,next_at=? WHERE id=? AND state='queued'",tokenHash,new Date(Date.now()+12*60_000).toISOString(),id);
  }
  done(id: string, error: string | null) {
    this.sql.exec("UPDATE media_uploads SET state=?,error=?,token_hash=NULL,auth=NULL,next_at=NULL,input='{}' WHERE id=? AND state IN ('queued','running')",error ? 'failed' : 'processed',error,id);
  }
  expire(now: string) {
    this.sql.exec("UPDATE media_uploads SET state='expired',token_hash=NULL,auth=NULL,next_at=NULL,input='{}' WHERE expires_at<=? AND state IN ('uploading','queued','running')",now);
    this.sql.exec("UPDATE media_uploads SET state='failed',error='processing_interrupted',token_hash=NULL,auth=NULL,next_at=NULL,input='{}' WHERE state='running' AND next_at<=?",now);
    this.sql.exec("UPDATE ingest_jobs SET state='failed',plan=NULL WHERE state='running' AND id IN (SELECT job_id FROM media_uploads WHERE state IN ('expired','failed'))");
    this.sql.exec("DELETE FROM media_uploads WHERE expires_at<? AND parts='[]'",new Date(Date.parse(now)-30*86400_000).toISOString());
  }
  cleanup() { return this.sql.exec<MediaUpload>("SELECT * FROM media_uploads WHERE state NOT IN ('uploading','queued','running') AND parts!='[]'").toArray(); }
  cleaned(id: string) { this.sql.exec("UPDATE media_uploads SET parts='[]',input='{}' WHERE id=?",id); }
  next() {
    return this.sql.exec<{ next: string | null }>("SELECT MIN(CASE WHEN next_at IS NULL THEN expires_at ELSE MIN(expires_at,next_at) END) AS next FROM media_uploads WHERE state IN ('uploading','queued','running')").one().next;
  }
  parts(row: MediaUpload) { return JSON.parse(row.parts) as Part[]; }
  auth(row: MediaUpload) { return JSON.parse(row.auth!) as Auth; }
  invalidate(field: "user_id" | "actor", id: string) {
    this.sql.exec(`UPDATE media_uploads SET state='cancelled',token_hash=NULL,auth=NULL,next_at=NULL,input='{}' WHERE ${field}=? AND state IN ('uploading','queued','running')`,id);
    this.sql.exec("UPDATE ingest_jobs SET state='deleted',plan=NULL WHERE state IN ('running','review') AND id IN (SELECT job_id FROM media_uploads WHERE state='cancelled')");
  }
}
