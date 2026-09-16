# Customization Migration and Deployment Handoff

## 1. Status and scope

This document records the current local Customization migration artifacts,
conceptual ordering, disposable verification evidence, historical-preservation
requirements, and deployment stop gates. It is a documentation handoff only.
It creates no SQL, changes no migration, applies nothing to Supabase, selects
no storage provider, and authorizes no deployment.

Current state:

- Customization progress: **56/70** before Task 10.3 completion.
- Tasks 7.1–7.9, 8.1–8.4, 9.1–9.5, 10.1, and 10.2 are complete.
- Task 8.5 is **BLOCKED** by the C1 / Phase C ordered dependency.
- Tasks 8.6 and 8.7 are not started.
- C1 remains **41/61**.
- C1 Task 3.5 is **BLOCKED**; C1 Tasks 3.6, 3.7, 3.8, and 7.4 are not
  complete.
- **BACKFILL AUTHORIZED: NO**.
- Production CustomerUploadReceiptRepository persistence: **NOT ACTIVATED**.
- Normalized checkout: **503 FAIL-CLOSED**.
- Production Customer Upload Provider: **UNRESOLVED / STOPPED**.

The authoritative supporting records are:

- [Customization schema decision packet](../openspec/changes/build-product-customization-workflow/schema-decision-packet.md)
- [Customization schema proposal](../openspec/changes/build-product-customization-workflow/schema-proposal.md)
- [Catalog schema baseline](catalog-schema-baseline.md)
- [Customization workflow contracts](customization-workflow.md)
- [Customer-upload trust model](customer-upload-trust-model.md)
- [Customer-upload provider handoff](customer-upload-production-provider-handoff.md)
- [Migration policy](database-migrations.md)
- [C1 design](../openspec/changes/build-configurable-product-catalog/design.md)
- [C1 tasks](../openspec/changes/build-configurable-product-catalog/tasks.md)

## 2. Four state distinctions

The following claims are intentionally different:

| Claim | Meaning |
|---|---|
| **LOCAL MIGRATION ARTIFACT EXISTS** | A SQL file is present in this repository. |
| **DISPOSABLE LOCAL VERIFICATION EXISTS / PASSED** | A specific local fixture, static check, or disposable runtime check produced evidence. |
| **KNOWN APPLIED TO CONNECTED DATABASE** | A target database's applied state was independently inspected or recorded. |
| **AUTHORIZED FOR PRODUCTION DEPLOYMENT** | A separate deployment owner approved the exact target, ordering, provider values, and release. |

Neither a local filename nor a local test proves that a connected Supabase
database has applied the file. Neither local evidence nor a human-reviewed
artifact authorizes production deployment.

## 3. Approved migration principles

The approved Customization schema approach is additive and provider-neutral:

- Phase A adds normalized Product-owned CustomizationField configuration.
- Phase B adds pre-order draft and private-media lifecycle structures.
- The publication RPC is an atomic server-side configuration-publication
  primitive ordered after Phase A and B.
- Phase C is a later conceptual attachment/snapshot stage and is not present as
  a local migration artifact.
- Legacy Product/customization/order relations remain preserved and are not
  reinterpreted as normalized authority.
- No automatic legacy customization backfill is authorized.
- No Product configuration rows, customer receipt rows, or production fixture
  rows are created by the local artifacts.
- Database schema approval does not choose Supabase Storage or Cloudflare R2.

## 4. Existing local customization artifacts

The following files actually exist under `supabase/migrations/`:

| Local file | Classification | Purpose | Remote applied state |
|---|---|---|---|
| `20260812120000_add_customization_configuration_schema.sql` | **LOCAL CUSTOMIZATION MIGRATION ARTIFACT — PHASE A** | Adds normalized Product-owned configuration relations, typed constraints, indexes, RLS, policies, and service-role grants. | **UNKNOWN FROM CURRENT LOCAL EVIDENCE** |
| `20260812121000_add_customization_draft_media_schema.sql` | **LOCAL CUSTOMIZATION MIGRATION ARTIFACT — PHASE B** | Adds pre-order drafts, draft values, private receipt metadata, ordered image placements, lifecycle checks, cleanup indexes, and Phase B integrity trigger support. | **UNKNOWN FROM CURRENT LOCAL EVIDENCE** |
| `20260812122000_add_atomic_customization_publication_rpc.sql` | **LOCAL CUSTOMIZATION MIGRATION ARTIFACT — ATOMIC PUBLICATION RPC** | Adds `publish_product_customization_configuration(...)` for atomic immutable Product configuration publication. | **UNKNOWN FROM CURRENT LOCAL EVIDENCE** |

These files are not `supabase/schema.sql`, `seed.sql`, `coupons.sql`, or
`operations.sql`. Those older files remain legacy bootstrap/setup inputs and
are not migration history.

No approved Phase C migration artifact was found under
`supabase/migrations/`.

## 5. Phase A — normalized configuration

`20260812120000_add_customization_configuration_schema.sql` is the local Phase
A artifact. Its actual scope includes:

- `product_customization_configs`;
- `customization_field_identities`;
- `customization_fields`;
- Product ownership foreign keys and immutable revision relationships;
- Product-scoped stable field codes;
- `image | short_text | long_text` kind checks;
- typed text and image constraint checks;
- deterministic position and current-revision uniqueness;
- relevant indexes;
- explicit RLS enablement;
- service-role-only policies/grants for server persistence.

The file is additive and does not modify `products.customization_schema`. It
contains no Product configuration rows, no fixture import, no customer data,
and no production field values. It does not establish a Product/SKU purchase
snapshot and does not select an object-storage provider.

The publication RPC later writes only these Phase A configuration relations;
it does not make legacy JSON authoritative.

## 6. Phase B — drafts and private media

`20260812121000_add_customization_draft_media_schema.sql` is the local Phase B
artifact. Its actual scope includes:

- `customization_drafts`;
- `customization_draft_values`;
- `customer_upload_receipts`;
- `customization_value_images`;
- guest-owner binding and Product/configuration-revision context;
- receipt metadata, expiry, replacement relation, and lifecycle states;
- ordered image positions and optional crop coordinates;
- cleanup candidate and cleanup-lease indexes;
- row checks and the Phase B graph-integrity trigger.

Phase B deliberately has:

- no `order_items` reference;
- no durable OrderItem attachment;
- no `attached` lifecycle state;
- no Phase C immutable order snapshot;
- no C1 Product/Variant/base-price/currency snapshot;
- no provider bucket, binding, credential, or deployment configuration.

The schema contains internal provider-locator metadata columns for the future
private-object persistence boundary. Their presence in a local schema design
does not approve Supabase Storage, Cloudflare R2, S3, a bucket, or a production
binding. The application-facing contract remains provider-neutral.

## 7. Atomic customization-publication RPC

`20260812122000_add_atomic_customization_publication_rpc.sql` is a local
artifact ordered after Phase A and Phase B. It is **not Phase C**.

It defines:

```text
public.publish_product_customization_configuration(
  p_product_id uuid,
  p_expected_current_revision_id uuid,
  p_fields jsonb
)
```

The approved local design is a `SECURITY INVOKER` function callable only by
`service_role`. It locks the Product/current revision, performs final revision
and field validation, creates a complete immutable replacement revision, and
returns bounded outcomes such as `applied`, `not_found`,
`stale_revision`, or `invalid_configuration`.

The checked-in static test verifies ordering, signature, invoker posture,
privilege posture, Product ownership qualification, complete-replacement
rules, scalar guards, and that writes are limited to Phase A configuration
relations. This RPC does not:

- attach receipts to OrderItems;
- create C1 purchase snapshots;
- mutate `order_items` or `order_uploads`;
- choose or configure storage;
- perform Product backfill;
- replace Phase C.

Atomicity claims are limited to the RPC's own database transaction and locked
publication behavior. They do not imply that the entire migration chain or
object-storage/receipt system is one transaction.

## 8. Phase C — future attachment and immutable snapshots

The approved conceptual Phase C contains only a later, separately gated
attachment/snapshot stage. Expected concepts include:

- OrderItem attachment linkage for drafts/receipts;
- `order_item_customization_snapshots`;
- `order_item_customization_values`;
- `order_item_customization_images`;
- immutable field meaning and configuration revision association;
- ordered image association and crop association;
- exactly-once receipt attachment semantics.

**NO APPROVED/ACTIVE PHASE C MIGRATION ARTIFACT EXISTS IN THE CURRENT
REPOSITORY.** The schema proposal labels Phase C as future and keeps it dormant
until the ordered C1 purchase-snapshot work is complete.

Phase C must not duplicate or replace C1 purchase authority. C1 owns the
immutable purchase snapshot concepts:

- Product identity/name/slug;
- Variant reference;
- SKU identity/code;
- selected Product Options;
- unit base price;
- currency.

Customization Phase C owns only immutable customer-input meaning and receipt
association. It does not own the Product/SKU purchase snapshot.

Because Phase C is not implemented, this repository does not verify an
OrderItem attachment FK, immutable customization snapshot persistence,
attachment/cleanup database race, historical dual-read adapter, or complete
Task 8.5 behavior.

## 9. Task 3.4 status

Customization Task 3.4 remains **unchecked**. The presence of the Phase A,
Phase B, and publication-RPC files does not by itself complete the full
approved additive migration scope or make it ready for connected deployment.

Task 10.3 documents that status; it does not complete Task 3.4, create Phase C,
or authorize remote apply. Tasks 3.4–3.6 are not modified by this handoff.

## 10. Actual local artifact chronology

This is the filename/timestamp order currently present in the repository:

```text
20260807151745_expand_configurable_product_catalog.sql
→ 20260808120000_add_atomic_catalog_sku_graph_rpc.sql
→ 20260810120000_add_atomic_catalog_lifecycle_rpc.sql
→ 20260812120000_add_customization_configuration_schema.sql       [Phase A]
→ 20260812121000_add_customization_draft_media_schema.sql          [Phase B]
→ 20260812122000_add_atomic_customization_publication_rpc.sql      [Phase A RPC]
```

This is **LOCAL FILE ORDER**. It is not proof that any file was applied to a
connected Supabase project and it is not, by itself, the conceptual dependency
order for every future runtime feature.

## 11. Conceptual dependency ordering

The approved conceptual gates are separate from filename order:

```text
target applied-state / baseline review
→ Customization Phase A configuration
→ Customization Phase B draft/media
→ frozen C1 chain:
    3.5 → 3.6 → 3.7 → 3.8 → 7.4
→ future Customization Phase C attachment/snapshot
→ later runtime attachment and checkout cutover
```

Phase A and Phase B are conceptually independent of C1 Variant backfill for
their provider-neutral/local scope. Phase C is deliberately ordered after C1
3.8 because it must attach to an order item without duplicating C1's immutable
Product/SKU purchase facts. Runtime normalized attachment remains disabled
until C1 7.4 and later approved Customization integration are complete.

Filename timestamps do not override these gates.

## 12. C1 coordination gate

Current C1 status is:

| C1 item | Status |
|---|---|
| C1 progress | **41/61** |
| Task 3.5 | **BLOCKED / awaiting business input** |
| Task 3.6 | **NOT COMPLETE** |
| Task 3.7 | **NOT COMPLETE** |
| Task 3.8 | **NOT COMPLETE** |
| Task 7.4 | **NOT COMPLETE** |
| Backfill | **NOT AUTHORIZED** |

No C1 task or planning artifact is changed by this document. No default
Variant production row, weight, lead-time value, guarded backfill, or C1 order
snapshot is created here.

## 13. Historical preservation and no-backfill rule

All additive work must preserve without rewrite or inferred reinterpretation:

- every `products.customization_schema` value;
- every historical `order_items.customization` value;
- every `order_uploads` row;
- existing `orders → order_items` relationships;
- existing `products → order_items` compatibility relationships;
- legacy administrator review, fulfillment, digital-delivery, and photo
  behavior until a separately approved adapter/cutover preserves it safely.

The legacy values are compatibility/history, not normalized CustomizationField
authority. No migration may use them as automatic normalized production
configuration or receipt backfill input.

The following are explicitly not translated by this change:

- `products.customization_schema`;
- legacy `note`, `photoPath`, or `photoMeta` values;
- `order_uploads.storage_key`;
- `supabase/seed.sql` examples;
- development fixture configuration;
- customer-upload bytes or filenames.

No legacy customization backfill is authorized. No old column is dropped,
rewritten, or contracted by this documentation task.

## 14. Disposable verification evidence

Evidence is recorded at the strongest level supported by checked-in files.

| Verification category | Current status | Evidence and limits |
|---|---|---|
| Static migration/source verification | **PASS** | `tests/customization-publication-rpc-migration.test.mjs` verifies the Phase A/B/RPC ordering and the publication SQL's static safety properties. It is not a database runtime test. |
| Disposable legacy baseline fixture classification | **PASS — fixture contract only** | `tests/database/fixtures/legacy-schema-before-c1.sql` and `tests/disposable-legacy-baseline.test.mjs` prove it is schema-only, outside `supabase/migrations/`, zero-business-data, and not production provenance. |
| Full six-file fresh apply | **NOT VERIFIED BY CURRENT CHECKED-IN TEST EVIDENCE** | `docs/disposable-legacy-baseline-proposal.md` records the earlier missing-baseline failure and the later schema-only fixture design. The current repository has no checked-in executable fresh-apply result for the complete chain. |
| Phase A/B schema runtime behavior | **NOT RUN IN THIS TASK** | No database was started or queried for this documentation task. Local SQL presence does not prove applied/runtime behavior. |
| Publication RPC runtime behavior | **NOT VERIFIED BY CURRENT CHECKED-IN AUTOMATION** | The repository contains static SQL tests, not a runtime RPC test harness. Any external/manual review result must not be upgraded into full migration verification here. |
| Publication RPC concurrency | **NOT VERIFIED BY CURRENT CHECKED-IN AUTOMATION** | No current repository artifact proves concurrent publication behavior. |
| Publication RPC rerun/idempotency | **NOT VERIFIED BY CURRENT CHECKED-IN AUTOMATION** | Static checks prove shape only; no current repository artifact proves a runtime rerun. |
| Full Phase A/B lifecycle/security verification | **PARTIAL** | SQL contains checks, RLS, grants, indexes, and Phase B integrity logic; complete disposable runtime proof is not established in the current tree. |
| Historical-row preservation verification | **NOT RUN** | The local legacy baseline is schema-only and contains zero business rows; it cannot prove preservation of real historical rows. |
| Rollback/forward-fix verification | **DOCUMENTED ONLY** | The approved design records additive rollback limits and forward-fix assumptions; no connected rollback or production forward fix was run. |
| Phase C verification | **BLOCKED / NOT APPLICABLE** | No Phase C migration or active persistence exists. |

The static SQL evidence and any RPC-specific local/manual evidence must remain
separate from the broader Task 3.5 gate. Task 3.5 requires more than static
publication-RPC checks, including fresh apply, schema constraints/indexes,
RLS/grants, ownership, lifecycle/cleanup concurrency, historical preservation,
and rollback/forward-fix assumptions.

## 15. Legacy baseline fixture and seed policy

`tests/database/fixtures/legacy-schema-before-c1.sql` is **LOCAL TEST
INFRASTRUCTURE**. It reconstructs a high-confidence schema-only pre-C1 shape
for disposable migration testing. It is not:

- a production initial migration;
- remote migration history;
- production provenance reconstruction;
- a backfill;
- seed data;
- authorization to apply any migration.

The fixture creates no Product, order, customer, upload, coupon, or migration
rows. It must remain outside `supabase/migrations/`.

`supabase/seed.sql` is not migration history and is not authoritative
Production CustomizationField data. It remains a legacy bootstrap/fixture input
and must not be enabled as migration-only verification data when the test
design excludes seed data.

## 16. Connected-database baseline gate

Before any connected-database migration action, the deployment workflow must
independently establish the actual target environment's applied baseline,
including, as applicable:

- applied migration history;
- tables, columns, types, defaults, constraints, and foreign keys;
- indexes, RLS state, policies, grants, and relevant triggers/functions;
- current Product/order relationships and preservation requirements;
- customization rows, if any;
- Storage configuration and policies;
- target-specific operational ownership and approval.

The existing `docs/catalog-schema-baseline.md` is a dated read-only record from
2026-08-07. It does not prove the current target state after that inspection.
Local migration filenames do not prove:

- what remote Supabase has applied;
- current remote RLS/policies/grants;
- current remote rows;
- remote Storage configuration;
- remote migration history after the recorded baseline.

Unless separately inspected and approved, these remain **UNKNOWN**:

- which local Customization or C1 files are applied remotely;
- current connected schema/policies/grants;
- remote Product, order, receipt, or customization rows;
- production Storage provider/bucket/binding configuration.

## 17. Deployment stop gates

| Gate | Current status | Required before connected/production action |
|---|---|---|
| Target applied migration baseline | **REQUIRES DEPLOYMENT REVIEW** | Inspect and reconcile the actual target first. |
| C1 Task 3.5 | **BLOCKED** | Resolve all business mapping inputs. |
| C1 guarded backfill | **NOT AUTHORIZED** | Human approval after complete preflight only. |
| C1 Task 3.8 | **NOT COMPLETE** | Add approved purchase snapshot persistence. |
| C1 Task 7.4 | **NOT COMPLETE** | Persist immutable Product/SKU purchase facts. |
| Customization Phase C | **NOT CREATED / BLOCKED** | Create only under its later approved dependency gate. |
| Customization Task 8.5 | **BLOCKED** | Complete durable attachment and normalized snapshot work. |
| Production receipt repository | **NOT ACTIVATED** | Approved persistence implementation and deployment review. |
| Production upload provider | **UNRESOLVED / STOPPED** | Separate provider architecture approval. |
| Production bucket/binding | **UNRESOLVED** | Deployment/security approval. |
| Production retention | **UNRESOLVED** | Business/security/operations approval. |
| Production cleanup scheduler | **UNRESOLVED** | Deployment/operations design and approval. |
| Normalized checkout | **503 FAIL-CLOSED** | Later approved runtime cutover. |
| Remote Customization migration | **NOT AUTHORIZED BY THIS TASK** | Separate deployment-owner approval. |
| Production deployment | **NOT AUTHORIZED BY THIS TASK** | Separate release approval. |

## 18. Provider and database-migration separation

The private object-storage decision between Supabase Storage and Cloudflare R2
is a separate architecture/deployment gate. Database schema approval does not
select a storage provider. Storage-provider selection does not authorize a
database migration.

No provider-specific bucket, binding, credential, region, retention number, or
environment variable is added here. The provider handoff remains the source of
truth for the unresolved candidates and values.

## 19. Rollback and forward-fix strategy

Before normalized order attachment is active, additive schema rows may remain
dormant while application paths are disabled or rolled forward. The default
rollback assumption is not to drop new relations automatically; a target-
specific plan must account for the actual applied baseline.

After customer receipts or immutable snapshots become durable, destructive
rollback can destroy customer or historical meaning. Corrections should
generally use a forward fix that preserves:

- customer content;
- attached media;
- immutable customization meaning;
- C1 purchase snapshots;
- legacy order compatibility.

The approved design does not claim one transaction for the entire future
migration/deployment. Migration transaction blocks, publication-RPC atomicity,
receipt metadata persistence, and object-provider writes are separate concerns.

## 20. Explicit non-automatic-action statement

**No customization migration is applied to a connected or production database
automatically by this change.**

Also:

- no provider configuration is applied automatically;
- no bucket or binding is created automatically;
- no backfill is authorized automatically;
- no deployment occurs automatically;
- no remote SQL command is run by this documentation task.

This handoff does not instruct anyone to run `supabase db push`, a remote
migration command, production `psql`, a remote SQL editor, provider bucket
creation, or deployment. Any such future action belongs to an explicitly
approved deployment-owner workflow.

## 21. Current handoff checklist

Before a connected database is modified, the responsible owner must confirm:

- the actual target migration/schema baseline has been inspected;
- local artifacts are reconciled against that target;
- C1 3.5–3.8 and 7.4 gates are resolved in their approved order where Phase C
  depends on them;
- no ambiguous Product mapping or unauthorized backfill remains;
- historical Product/customization/order/upload relationships are preserved;
- Phase C, if required, has its own approved artifact and runtime plan;
- receipt repository, provider, bucket/binding, retention, preview TTL, and
  cleanup operations have separate approvals;
- rollback/forward-fix ownership is recorded;
- application cutover is sequenced after the required schema;
- production deployment has a separate release approval.

This document contains no production Product rows, customer receipt rows,
order JSON, filenames, object keys, supplier data, weight/lead-time values,
remote URLs, database credentials, service-role keys, provider credentials,
bucket secrets, owner signing secrets, or tokens.
