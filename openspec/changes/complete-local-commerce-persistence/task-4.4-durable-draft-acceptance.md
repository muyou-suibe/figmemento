# Task 4.4 — durable confirmed Draft authority

2026-09-11. Task 4.4 PASS; progress 23/85. Task 1.1 remains unchecked.
This report does not complete 4.5 or any 5.x task.

## Authority

`draft_media_links.id` is the canonical server-allocated slot identity. The
existing browser reducer is unchanged and is not persistent authority.
`LocalCommerceDraftPort` is independent of Cart mutations: create/read/save use
verified caller context, required expectedVersion and idempotency for writes.
The adapter re-invokes the supplied existing guest/session verifier per command,
verifies the local project marker before RPC, and does not authorize from a cache.
The SQL command locks exact owner/draft rows, validates current Product-owned
image fields and exact ready receipt ownership, then commits slot/order/crop and
version plus confirmedRevision together. New slot IDs and both revisions are
server-owned. Safe projections omit project/owner internals and private locators.
The existing canonical normalized crop parser is reused in the application port;
SQL also rejects invalid bounds/types before writes. No renderer/Storage or media
operation readiness claim is made by this task.

## New isolated DB evidence

- Run: `run-f65d52d2`.
- Project: `figmemento-local-commerce-test-run-f65d52d2`.
- Ports: shadow 55580, API 55581, DB 55582, Studio 55583, SMTP 55584, helper 55585.
- PostgreSQL 17 / Supabase CLI 2.114.0; ledger-aware first startup PASS.
- Migration 0010: `0010_local-commerce-draft-authority.sql`.
- SHA256: `8104759a5740c6cd1fcc8ce544c510e3aa6ef3048d6d05d195bb8a214e05dc5d`.
- Applied ledger and all checksums: 10/10 PASS; 0001–0009 unchanged.
- No outer SQL transaction; wrapper owns SQL plus ledger transaction.
- Fixed search_path, service_role-only function and RLS-protected command bindings.

`tests/database/local-commerce-draft-acceptance.mjs` passed **12 groups**:
marker/ledger; synthetic Catalog; draft ID/revision/idempotency; controlled receipt
setup; two slots/reorder/crop; stale/invalid/forged rejection; fresh Node restore;
two independent concurrent writers (one winner, one version_mismatch); wrong
owner/project/marker/expired authority; member isolation plus session revoke;
RLS/RPC denial; unconfirmed draft unavailable with confirmed state unchanged.

Actual process IDs, concurrent results and anon HTTP status are recorded in
`local/commerce/runtime/disposable/run-f65d52d2/task-4.4-evidence.json` (ignored).
Only synthetic private receipt metadata was seeded: no Storage objects were
created, and this is expressly not upload/ready-media acceptance. New test records
use fresh IDs on rerun; no reset occurred. All old evidence runs were untouched.

## Validation

- Focused Draft/ledger/schema/security/Cart regression: 40/40, exit 0.
- Real DB: 12 groups, exit 0.
- Lint: exit 0, 0 errors; existing ProductCustomizationImageField.tsx:496 warning.
- Typecheck: exit 0.
- Offline: 913/913, exit 0 after updating manifest-total assertions from 9 to 10.
  Existing migration checksum and security assertions were not removed/weakened.
- Fresh build: exit 0, then rendered 11/11, exit 0.
- Full verify: exit 0; all its stages ran and passed.
- OpenSpec strict: 23/23, exit 0; git diff check exit 0.

The first member test used the wrong test-side session projection; corrected to
the existing `ok/value.authenticated` provider contract, with no auth code change.
An anon RPC test initially supplied no parameters and did not address the function;
corrected to the exact signature and verified permission denial, not a relaxed
status assertion. Failed runs are not counted as passes.

Logs: `/private/tmp/draft-media-{db,focused,lint,typecheck,offline,build,rendered,verify,openspec}.log`.
No visual/Catalog/Supplier semantics, production config, remote service, deploy,
stage, commit or push. Only Task 4.4 was checked. Proceed to the separately
authorized media operation foundation; no 4.5, 5.6 or Task 6 work is authorized.
