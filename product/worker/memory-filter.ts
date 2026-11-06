import { date, fail, object } from "./domain";

type Scalar = string | number | boolean | null;
type Op = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "exists";
export type MemoryFilter = { AND: MemoryFilter[] } | { OR: MemoryFilter[] } | { NOT: MemoryFilter } |
  { field: string; op: Op; value: Scalar | Scalar[] };
const columns: Record<string, string> = {
  category: "m.category", event_time: "m.event_time", valid_from: "m.valid_from", valid_to: "m.valid_to",
  created_at: "m.created_at", updated_at: "m.updated_at", origin: "m.origin", fact_key: "m.fact_key",
  "source.type": "json_extract(m.source,'$.type')", "source.ref": "json_extract(m.source,'$.ref')",
  "source.observed_at": "json_extract(m.source,'$.observed_at')",
};
const timeFields = new Set(["event_time", "valid_from", "valid_to", "created_at", "updated_at", "source.observed_at"]);
export function parseFilter(value: unknown): MemoryFilter | null {
  if (value === undefined || value === null) return null;
  let nodes = 0;
  function visit(value: unknown, depth: number): MemoryFilter {
    if (++nodes > 32 || depth > 4) fail(422, "invalid_filter", "filter最多32个节点、4层嵌套");
    const data = object(value), keys = Object.keys(data);
    for (const op of ["AND", "OR", "NOT"] as const) if (op in data) {
      if (keys.length !== 1) fail(422, "invalid_filter", "逻辑节点不能混用其他字段");
      if (op === "NOT") return { NOT: visit(data.NOT, depth + 1) };
      const children = data[op];
      if (!Array.isArray(children) || children.length < 1 || children.length > 8) fail(422, "invalid_filter", "AND/OR需要1至8个子条件");
      return { [op]: children.map(x => visit(x, depth + 1)) } as MemoryFilter;
    }
    if (keys.length !== 3 || !keys.every(k => ["field", "op", "value"].includes(k))) fail(422, "invalid_filter", "条件必须包含field、op、value");
    const field = String(data.field), op = String(data.op) as Op;
    if (!Object.hasOwn(columns, field) && !/^metadata\.[A-Za-z][A-Za-z0-9_]{0,47}$/.test(field)) fail(422, "invalid_filter", "不支持此筛选字段");
    if (["metadata.constructor", "metadata.prototype", "metadata.__proto__"].includes(field)) fail(422, "invalid_filter", "不支持此筛选字段");
    if (!["eq", "ne", "in", "gt", "gte", "lt", "lte", "exists"].includes(op)) fail(422, "invalid_filter", "筛选操作无效");
    if (op === "exists") {
      if (typeof data.value !== "boolean") fail(422, "invalid_filter", "exists需要布尔值");
      return { field, op, value: data.value };
    }
    const validate = (v: unknown): Scalar => {
      if (!(v === null || typeof v === "boolean" || (typeof v === "string" && v.length <= 256) || (typeof v === "number" && Number.isFinite(v)))) fail(422, "invalid_filter", "筛选值必须是有限标量");
      if (!field.startsWith("metadata.") && v !== null && typeof v !== "string") fail(422, "invalid_filter", "此筛选字段需要字符串");
      return timeFields.has(field) && v !== null ? date(v, field) : v as Scalar;
    };
    if (op === "in") {
      if (!Array.isArray(data.value) || !data.value.length || data.value.length > 16) fail(422, "invalid_filter", "in需要1至16个值");
      return { field, op, value: data.value.map(validate) };
    }
    const scalar = validate(data.value);
    if (["gt", "gte", "lt", "lte"].includes(op) && !(typeof scalar === "number" || (timeFields.has(field) && typeof scalar === "string"))) {
      fail(422, "invalid_filter", "范围比较只接受数字或日期时间");
    }
    return { field, op, value: scalar };
  }
  return visit(value, 1);
}
export function filterSql(filter: MemoryFilter | null): { sql: string; args: (string | number | null)[] } {
  const args: (string | number | null)[] = [];
  function leaf(field: string, op: Op, value: Scalar): string {
    const meta = field.startsWith("metadata.");
    const path = meta ? `$.${field.slice(9)}` : "";
    // Field names pass the allowlist; all dynamic values, including JSON paths, are bound.
    const expr = () => meta ? (args.push(path), "json_extract(m.metadata,?)") : columns[field];
    const type = () => (args.push(path), "json_type(m.metadata,?)");
    const exists = () => meta ? `${type()} IS NOT NULL` : `${expr()} IS NOT NULL`;
    const typed = (v: Exclude<Scalar, null>) => {
      if (!meta) return "1";
      return typeof v === "number" ? `${type()} IN ('integer','real')` : `${type()}='${typeof v === "boolean" ? (v ? "true" : "false") : "text"}'`;
    };
    const equal = () => {
      if (value === null) return meta ? `${type()}='null'` : `${expr()} IS NULL`;
      const check = typed(value), e = expr(); args.push(typeof value === "boolean" ? Number(value) : value);
      return `(${check} AND ${e}=?)`;
    };
    if (op === "exists") return value ? `(${exists()})` : `(NOT (${exists()}))`;
    if (op === "eq") return `COALESCE(${equal()},0)`;
    if (op === "ne") { const present = exists(); return `(${present} AND NOT COALESCE(${equal()},0))`; }
    const check = typed(value as Exclude<Scalar, null>), e = expr();
    args.push(value as string | number);
    return `COALESCE((${check} AND ${e}${({gt:">",gte:">=",lt:"<",lte:"<="} as Record<string,string>)[op]}?),0)`;
  }
  function compile(f: MemoryFilter): string {
    if ("AND" in f) return `(${f.AND.map(compile).join(" AND ")})`;
    if ("OR" in f) return `(${f.OR.map(compile).join(" OR ")})`;
    if ("NOT" in f) return `(NOT ${compile(f.NOT)})`;
    if (f.op === "in") return `(${(f.value as Scalar[]).map(v => leaf(f.field, "eq", v)).join(" OR ")})`;
    return leaf(f.field, f.op, f.value as Scalar);
  }
  const sql = filter ? compile(filter) : "1";
  if (args.length > 80) fail(422, "invalid_filter", "筛选组合过大，请减少in值或条件数量");
  return { sql, args };
}
export function searchConstraints(input: Record<string, unknown>, now = new Date().toISOString()) {
  return { filter: parseFilter(input.filter), at: input.at === undefined ? now : date(input.at, "检索有效时间") };
}
export function validitySql(at: string) {
  return { sql: "(m.valid_from IS NULL OR m.valid_from<=?) AND (m.valid_to IS NULL OR m.valid_to>?)", args: [at, at] };
}
