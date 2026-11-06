# v0.2.1 API additions

Local development candidate, not a production release.

## Fact slots

`worker/fact-slots.ts` maintains the versioned `self-facts/1` registry:

- `user.home_city`: long-term home city only; accepts the reviewed aliases `residence_city` and `current_residence_city`.
- `user.preferred_language`: durable communication language.
- `user.commute_mode`: primary routine commuting method.
- `user.timezone`: explicit timezone, never inferred from a city.

`user.current_city` is not mapped to home city. Unregistered slots may be extracted but require review. Existing aliases are expanded during candidate lookup rather than bulk rewriting history. Multiple targets, manual corrections, ambiguous time, or insufficient support continue to require review and return `review_reasons`.

## Write attributes

```json
{
  "metadata": {"priority": 2, "vip": true, "ticket": "demo-42"},
  "category": "support",
  "event_time": "2026-11-01T08:00:00+08:00",
  "valid_from": "2026-11-01T00:00:00Z",
  "valid_to": "2026-12-01T00:00:00Z"
}
```

These are caller-provided attributes for explicit creates/updates and ingestions. Models do not choose metadata or validity windows.

Metadata permits at most 16 flat fields and 4,096 bytes. Values may be strings of up to 256 characters, finite numbers, booleans, or null. Arrays, nested objects, and special prototype fields are rejected. Categories use identifier characters and are limited to 64 characters. Timestamps must include a timezone and valid calendar values; storage uses UTC.

Creates default to `metadata={}` and null for the other attributes. Updates preserve omitted attributes; `metadata={}` and `category=null` explicitly clear values. Metadata is replaced as a whole, not deep-merged. New history records retain versioned attributes; older history has empty defaults rather than fabricated event timestamps. An ingestion merge adds evidence only; differing attributes cause a conflict rather than silently replacing categories or metadata.

## Retrieval filters

For `POST /v1/search` and `POST /v1/answer`:

```json
{
  "user_id": "customer-42",
  "query": "refund status",
  "mode": "lexical",
  "filter": {
    "AND": [
      {"field":"category","op":"eq","value":"support"},
      {"field":"metadata.priority","op":"gte","value":2}
    ]
  },
  "at": "2026-11-05T08:00:00+08:00",
  "limit": 10
}
```

- Each `AND`/`OR` node has 1–8 children; `NOT` has one. Maximum 32 nodes and depth 4.
- Compiled filters allow at most 80 bound parameters. Oversized expressions return 422, not a database error.
- Leaves contain exactly `field`, `op`, and `value`.
- Allowed fields: flat `metadata` fields, `category`, `event_time`, `valid_from/to`, `created_at`, `updated_at`, `origin`, `fact_key`, and `source.type/ref/observed_at`.
- `user_id`, `project_id`, and `role` are not filter fields. Server-side key authorization always defines scope; OR/NOT cannot broaden it.
- Operators: `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, and `exists`. Range comparisons apply only to numbers/timestamps; `in` has at most 16 values.
- Types distinguish `true`, `1`, and `"1"`. Metadata `eq:null` matches explicit null, not a missing field. `exists` tests presence; `ne` excludes missing fields; `NOT(eq)` can include missing fields.
- SQL identifiers are allowlisted, while paths and values use bound parameters. Filtering happens before `limit`.
- Lexical, semantic, hybrid, and explicitly requested fallback retain the same `filter` and `at` constraints.

GET list/export endpoints accept URL-encoded JSON in `filter`; SDK `list`/`exportPage` encode it automatically. List/export do not automatically hide records outside validity windows, because they support management. Use search for validity-filtered retrieval.

## Time fields are different concepts

- `source.observed_at`: when the source was observed; maintenance ordering continues to use this field.
- `event_time`: caller-declared event time, used only for filtering and never automatically inferred.
- `valid_from/to`: the current record's validity window, `[from,to)`. Search defaults to the current request time.
- `expires_at`: physical online cleanup time, not temporary exclusion from retrieval; expired records do not reappear.

**`at` is not a historical snapshot or as-of query.** It filters the currently saved version's validity window. It does not reconstruct old versions, deleted records, or expired data and does not implement bitemporal history or general temporal reasoning.

## Threshold

Only semantic/hybrid modes accept an explicit number in `0..1`. It is a **cosine gate**, not a probability or unified score. With a hybrid threshold, lexical hits must pass the same cosine gate; returned ranking scores are still RRF. Lexical mode and requests with `fallback:"lexical"` reject `threshold` rather than silently dropping it. Omitting the threshold preserves the original hybrid semantics.

Coverage is still checked across the whole user scope. A narrow filter cannot hide a missing index. If coverage is complete and filtering leaves no candidates, no embedding request is made. The implementation remains bounded to 1,000 records per user and at most 2,048 dimensions.

## Outside this increment

This API round did not deliver real-model quality validation, general temporal reasoning, a unified task queue, profiles, OpenAPI/Python packages, MCP, multiple organizations, billing, SSO, or website pages. Subsequent website work is tracked separately in the [roadmap](../docs/ROADMAP.md); this document describes the API increment only.

## Upgrade and rollback

The migration adds fields to `memories` and `history`, preserves existing values, and is safe to initialize repeatedly. **Do not downgrade directly to the old Worker**: its history writes use positional inserts that are incompatible with added columns. Before a production upgrade, verify backups and restoration, then use a schema-compatible forward fix or complete restoration strategy. This round did not perform a production backup/recovery drill.
