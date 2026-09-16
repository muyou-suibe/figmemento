# 12 — Immutable migration whitespace exception

Status: **APPROVED PUBLICATION-HYGIENE EXCEPTION**

## Purpose

The reviewed 85/85 handoff index contains two accepted local-commerce
migrations whose original immutable bytes produce Git's `new blank line at
EOF` diagnostic. These migrations predate the publication cleanup and have
already been accepted under the migration ledger and checksum authority.

Migration immutability takes precedence over cosmetic whitespace cleanup. This
exception permits the existing Git whitespace findings to remain; it does not
permit any SQL, formatting, line-ending, filename, checksum, or byte change.

## Exact allowlist

- `local/commerce/migrations/0017_local-commerce-history-context.sql`
- `local/commerce/migrations/0025_local-commerce-admin-timeout.sql`

No other path is covered by this exception.

## Checksum evidence

Before publication cleanup, every migration source file was hashed from disk
and compared with `local/commerce/migrations/manifest.json`:

- SQL migration files: 37
- Manifest entries: 37
- Matching checksums: 37/37
- Checksum mismatches: 0
- Schema version: 37
- Migration range: `0001`–`0037`
- `0038`: absent

The immutable exception files matched their accepted manifest checksums:

- `0017`: `2339a17b5cbd4c86341bf7dbed345a99f0c308205f17e1aff04ffd9f68628b4d`
- `0025`: `4828906d9ee765566bbd63547db3a2bdb83e76a42c8592ff9e643da82519cc93`

Neither migration was modified during publication cleanup.

## Whitespace validation

All staged whitespace findings outside the two immutable files were repaired
with whitespace-only edits. The staged index then produced:

- Scoped `git diff --cached --check`, excluding only `0017` and `0025`:
  exit 0 with no findings.
- Unscoped `git diff --cached --check`: exit 2, with findings only at:
  - `0017_local-commerce-history-context.sql:104` — new blank line at EOF.
  - `0025_local-commerce-admin-timeout.sql:208` — new blank line at EOF.

No third path remains. The unscoped result is retained as truthful evidence;
it is not reclassified as a clean result.

## Boundary

This is a publication-hygiene exception only. It does not authorize migration
execution, migration repair, a new migration, remote database access,
deployment, provider activation, or relaxation of any application test or
security boundary.
