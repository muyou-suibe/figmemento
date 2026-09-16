# Media authority completion acceptance

Date: 2026-09-11. Scope: 5.4 → 5.5 → 5.1 → 5.3 only.
The owner's explicit clarification governs this implementation: media ready is
not confirmed Draft state. Task 5.2 remains accepted and was not reimplemented.

## Authority and effects

Migration 0011 creates `media_slot_reservations` and `media_operations`, both
project/owner/Draft-bound, RLS-enabled and service-role-only. The server creates
operation and reservation UUIDs. The reservation uses the SAME UUID when an
explicit existing `draft_command` save CAS confirms `draft_media_links.id`.
There is no second application-facing Draft save boundary. The previous Draft
RPC implementation is private; even service_role cannot execute it directly.

`begin` persists pending operation identity and normalized server-derived source
facts before any Storage write. Original write is immutable and followed by
exact length/SHA-256 read-back. The existing helper then processes the original;
`prepare` persists output facts with expected version, derivative bytes are
written/read back, and `publish` checks version and current generation/revision
before atomically creating receipt/derivative metadata and marking ready.

Neither begin nor ready publication changes confirmed Draft links, version,
confirmedRevision, order or crop. The explicit Draft save checks its current
version, receipt and reservation lineage, and confirms the same UUID atomically.
Removed confirmed slots cannot be revived by late results. Existing confirmed
content remains readable while newer work is pending/failed.

DB and Storage are NOT a distributed transaction. A failed write, read-back or
render leaves no accepted receipt. Exact known pending operations can reconcile;
unknown operations cannot guess success. A lost publish response is resolved by
fresh exact operation lookup. Failed-operation cleanup is limited to that
operation's objects, may be retried, and never deletes a shared crop original or
ready operation's objects. Broad expiry/retention cleanup remains Task 5.6.

## Per-task evidence

| Task | Evidence | Result |
| --- | --- | --- |
| 5.4 | Durable-first Storage-write assertion, pending/ready/failed, explicit Draft CAS, wrong owner/project, new Node process recovery, actual Storage/RPC/read/helper failures, lost response, conflicting retry, stale generation | PASS |
| 5.5 | Exact owned receipt → exact private derivative relation, digest/length verification, safe same-origin response, absent object, expired/inactive receipt, actual durable member session revoke, anon/authenticated HTTP denial | PASS |
| 5.1 | Existing POST `/api/uploads` persistent branch: source/origin/owner/current field, bounded single-file form, actual JPEG/PNG/WebP accepted HTTP 201, malformed/SVG/HTML/truncated/oversize/pixel-bomb/multiple/extra-field rejected HTTP 400 | PASS |
| 5.3 | Existing 8 EXIF/pixel helper tests plus real DB crop revision/Storage derivatives, immutable original bytes, stale crop rejection, helper failure preserving prior confirmed crop and derivative, explicit save-only crop confirmation | PASS |

Each upload request is independent, including identical bytes/Product/field.
No filename/hash/owner-wide receipt deduplication or image-count quota is added.
Configured-item images[] count validation remains its existing authority.
Browser MIME/filename claims are ignored: actual detected bytes control MIME.
SVG/HTML pretending to be an image are rejected, not accepted using the claim.

## Actual local environment and evidence

- New run: `run-cef496a3`.
- Exact project: `figmemento-local-commerce-test-run-cef496a3`.
- PostgreSQL 17; existing local Supabase CLI 2.114.0 / ledger-aware start path.
- Ports: shadow 55620, API 55621, DB 55622, Studio 55623, SMTP 55624,
  helper 55625; test-only Node HTTP route harness 55626.
- Marker validated before test writes; migration ledger 11/11, checksums match.
- 0001–0010 untouched. Only new 0011 was applied to this new disposable stack.
- 0011 SHA-256:
  `ecde24cfde31b03e67fa784ec5c1021829fe0ada894b656ceb6afd00ed48b4b3`.
- Manifest schemaVersion 11; rollback/forwardFix instructions included.
- Real acceptance: **20/20 groups PASS**, exit 0.
- Executable evidence: `tests/database/local-commerce-media-acceptance.mjs`.
- Machine report: ignored local artifact
  `local/commerce/runtime/disposable/run-cef496a3/media-authority-evidence.json`.
  It records ledger checksums, actual child PID, checks and safe HTTP statuses,
  never credentials, raw cookies, private locators or customer data.

Failure injection changes test transport credentials/marker to obtain actual
Storage/helper/RPC rejection, rather than substituting a memory repository.
Lost-response injection discards an actual successful publish response. The
new-process recovery uses the real durable operation and signed guest context.
All test business rows/images are synthetic and confined to this new run.
Old evidence runs, including `run-f65d52d2` and `run-68938831`, were not modified.
Test helper/HTTP listeners close in finally; the new database stack is retained
with evidence, not reset or silently deleted.

## Validation

- Focused media/helper/Draft/schema/ledger/session/security: **60/60 PASS**.
- `npm run lint`: exit 0, no errors; one existing
  `ProductCustomizationImageField.tsx:496` no-img-element warning.
- `npm run typecheck`: exit 0.
- `npm run test:offline`: **913/913 PASS**, exit 0.
- Fresh `npm run build`: exit 0, before rendered tests.
- `npm run test:rendered`: **11/11 PASS**, exit 0.
- `npm run verify`: **PASS**, exit 0; lint → typecheck → offline → fresh build → rendered.
  Final log: `/private/tmp/media-authority-final-verify.log`.
- `openspec validate --all --strict`: **23/23 PASS**, exit 0.
- `git diff --check` and direct/non-index checks cover new untracked files too.

The first sandboxed focused helper run could not listen (EPERM); the unchanged
tests subsequently passed with local-listener permission. This was not an
application failure and no assertion, skip or retry-until-pass workaround was
introduced.

## Boundaries and intentionally unexecuted work

HTTP acceptance invokes the actual exported upload/preview route handlers via a
local Node HTTP server, with real DB/Storage/helper. It is NOT claimed as the
actual vinext/Worker→helper smoke; that remains the separately gated Task 5.7.
The existing 5.2 helper is unchanged; its tests were rerun as regressions only.

Persistent upload requires an already server-issued Draft ID and expectedVersion
whose Product and owner match. It does not create an implicit draft, infer a
slot from browser state, or add a Draft creation HTTP endpoint. Browser journey
wiring, Cart/readiness receipt consumption (4.5), retention/cleanup leases (5.6),
and Order attach/copy (Task 6) remain outside this batch and unclaimed.

Catalog/purchase authority, Supplier semantics, visuals and production configs
are unchanged. No remote Supabase, production DB, deployment or real provider
was accessed. No git staging, commit, push, reset, clean or stash was performed.
Existing unrelated dirty worktree files remain untouched.

Task accounting: 5.4, 5.5, 5.1 and 5.3 independently checked after the evidence
above; total **28/85**. Task 1.1 remains unchecked/blocked; 4.5, 5.6, 5.7 and
Task 6 remain unchecked. No historical test failures were inferred.

## Files owned by this batch

- `app/infrastructure/local-commerce/local-persistent-media-authority.server.ts`
- `app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts`
- `app/server/local-persistent-media-http.server.ts`
- `app/api/uploads/route.ts`
- `app/api/customer-uploads/preview/route.ts`
- `local/commerce/migrations/0011_local-commerce-media-operations.sql`
- `local/commerce/migrations/manifest.json`
- `tests/database/local-commerce-media-acceptance.mjs`
- `tests/local-commerce-media-authority.test.mjs`
- `tests/local-commerce-security-boundary.test.mjs`
- `tests/local-commerce-migration-ledger.test.mjs`
- `tests/local-commerce-schema-contract.test.mjs`
- `tests/local-commerce-purchase-schema-contract.test.mjs`
- `tests/customer-session-persistence.test.mjs` (manifest version assertion only)
- This acceptance report and the four corresponding `tasks.md` checkboxes.
