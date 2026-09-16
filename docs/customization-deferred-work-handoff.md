# PhotoGift Customization Deferred-Work Handoff

## Status

**CUSTOMIZATION CHANGE IS NOT PRODUCTION-DEPLOYABLE YET.**

This document is the final Task 10.10 handoff for the locally implementable,
provider-neutral Customization work. It records what remains, why it remains,
which items require an independent approval, and which compatibility paths must
stay in place. It is not approval for a migration, provider, deployment, or
future feature change.

Before Task 10.10:

- Customization: **63/70**.
- C1: **41/61**.
- C1 Task 3.5: **BLOCKED**.
- `BACKFILL AUTHORIZED: NO`.
- Production Customer Upload Provider: **UNRESOLVED / STOPPED**.
- Production `CustomerUploadReceiptRepository`: **NOT ACTIVATED**.
- `/api/uploads`: **503 FAIL-CLOSED**.
- `/api/customer-uploads/preview`: **503 FAIL-CLOSED**.
- Normalized checkout: **503 FAIL-CLOSED**.

After Task 10.10 is accepted:

- Customization: **64/70**.
- The remaining incomplete tasks are exactly **3.4, 3.5, 3.6, 8.5, 8.6,
  and 8.7**.
- These six tasks are not ordinary local feature backlog. They depend on
  schema completion, disposable migration proof, connected-database approval,
  C1 purchase snapshots, Phase C attachment, historical normalized reads, and
  the complete guest order matrix.

## 1. Blocked required work

| Task | Why it is blocked | Upstream dependency | Required before completion | Must not happen early |
|---|---|---|---|---|
| Customization 3.4 | The approved additive scope stops before Phase C; no approved Phase C artifact exists. | Approved schema boundary and C1 ordering | Create the complete approved additive artifact, including any separately approved Phase C scope. | Do not create Phase C in this handoff. |
| Customization 3.5 | Full disposable migration verification has not been completed. | 3.4 artifacts and the approved migration chain | Verify fresh apply, rerun, constraints, indexes, RLS/grants, ownership, lifecycle, attachment integrity, preservation, and forward-fix assumptions. | Do not treat static SQL review or limited local evidence as full proof; do not run Docker/database verification here. |
| Customization 3.6 | Connected-database application requires a separate explicit approval. | 3.4/3.5 evidence and deployment ordering | Obtain approval for the exact connected database, ordering, and release procedure. | Do not run remote Supabase migration, `db push`, or production SQL. |
| Customization 8.5 | Durable OrderItem attachment must follow the C1 purchase-snapshot chain and Phase C. | C1 3.5 → 3.6 → 3.7 → 3.8 → 7.4 → Phase C | Persist accepted receipts exactly once after the OrderItem exists, with ordered association and zero mutation on rejection. | Do not treat provider-neutral ports or fakes as durable attachment. |
| Customization 8.6 | Historical normalized read/admin adapters require the new durable snapshot first. | Phase C and 8.5 | Preserve legacy reads while adding adapters for the new normalized snapshot. | Do not remove or rewrite legacy rows, reads, or admin behavior. |
| Customization 8.7 | The complete guest handoff/order matrix is not proven. | 8.5 and 8.6 | Add the full durable attachment, historical-read, and OrderItem persistence matrix. | Do not claim the existing 8.1–8.4 tests prove durable order persistence. |

### Task-specific detail

#### 3.4 — additive schema artifact

Phase A/B/RPC local artifacts exist. The full approved additive schema scope is
still incomplete because Phase C does not exist. The presence of local SQL is
not permission to create Phase C or to mark 3.4 complete.

#### 3.5 — disposable verification

The remaining proof categories include, where applicable:

- fresh apply and rerun safety;
- constraints and indexes;
- RLS and grants;
- Product/field ownership;
- receipt lifecycle and cleanup/attachment integrity;
- historical-row preservation;
- rollback/forward-fix assumptions;
- the later Phase C behavior.

No Docker or database verification is performed by Task 10.10.

#### 3.6 — connected database gate

No current task authorizes a remote Supabase migration, database push, or
production SQL execution. Connected-database work remains a separately approved
deployment activity.

#### 8.5 — ordered persistence dependency

The authoritative dependency is:

`C1 3.5 → C1 3.6 → C1 3.7 → C1 3.8 → C1 7.4 → Customization Phase C → Task 8.5`

This is not merely waiting for an upload provider. The primary blocker is the
C1/Phase C order-persistence structure.

The current implementation does **not** durably persist:

- OrderItem attachment of accepted receipts;
- an immutable normalized customization snapshot;
- field ID/code association;
- ordered image position;
- crop metadata;
- configuration revision;
- exactly-once durable OrderItem association.

Provider-neutral attach-once ports and local fakes are not equivalent to this
durable persistence.

#### 8.6 — historical compatibility

Legacy reads and admin behavior remain active and preserved. Task 8.6 later
owns normalized historical-read/admin adapters after the new durable snapshot
exists. Legacy reads must not be removed early.

#### 8.7 — full guest order matrix

Existing 8.1–8.4 and offline tests prove handoff structure, server
revalidation, copy separation, compatibility projection, and the request
boundary. They do not prove durable attachment, historical normalized reads,
or the full OrderItem persistence matrix.

## 2. C1 coordination and business-input gate

Current C1 state is unchanged:

| C1 item | Status |
|---|---|
| Progress | **41/61** |
| Task 3.5 | **BLOCKED** |
| Task 3.6 | **NOT COMPLETE** |
| Task 3.7 | **NOT COMPLETE** |
| Task 3.8 | **NOT COMPLETE** |
| Task 7.4 | **NOT COMPLETE** |
| Backfill | **BACKFILL AUTHORIZED: NO** |

C1's blocked production mapping and business-input gate must be resolved through
the independent C1 workflow. This document does not modify C1 and does not
bypass the ordered chain.

Do not copy demo fixture values, AI assumptions, development fixtures, or seed
values into production authority. In particular, do not infer C1 weights or
lead times as part of this task.

## 3. Production Product-specific field values

The actual production `CustomizationField` definitions for each Product remain
**UNRESOLVED / REQUIRE BUSINESS APPROVAL**. Business-owned configuration may
include, when explicitly approved:

- field presence;
- label and help text;
- required state;
- field kind;
- text length limits;
- image MIME rules;
- image count;
- decoded-dimension requirements;
- crop enablement.

No production values may be inferred from Product names, slugs, categories,
demo fixtures, legacy `customization_schema`, seed data, or AI output.

## 4. Storage provider, retention, and cleanup

### Provider decision

Production Customer Upload Provider remains **UNRESOLVED / STOPPED**.

The approved candidates are:

- Supabase Storage — **candidate / not approved**;
- Cloudflare R2 — **candidate / not approved**.

This handoff does not rank or select them and does not introduce S3.

The following provider-owned values remain unresolved:

- private bucket/container/binding identity;
- credential or binding mechanism;
- environment binding values;
- deployment owner;
- secret/configuration owner;
- activation approval.

No production adapter is activated.

### Retention and cleanup

Production policy values remain unresolved for:

- temporary unattached-upload retention;
- order-attached media retention/preservation;
- preview authorization TTL;
- production cleanup scheduler/runtime.

Do not reuse test TTLs, cookie TTLs, fixture `expiresAt`, local smoke
durations, or provider signed-link lifetimes as production policy.

## 5. Future capabilities deliberately deferred

Each item below requires a separately approved OpenSpec change. This handoff
does not design any of them.

### Complete cart-line identity — future capability

The following are intentionally absent:

- cart fingerprint;
- customization hash;
- merge key;
- complete line identity;
- quantity aggregation;
- durable cart persistence.

The current rule guarantees only that ordered configured copies remain
distinct. Even identical copies remain separate entries under current handoff
semantics. The final cart identity algorithm is not designed here.

### Customization pricing — deferred

Variant/SKU base price and Variant currency remain authoritative. The following
are not supported:

- customization surcharge;
- per-field surcharge;
- per-image charge;
- formula pricing;
- customer-input price modifiers.

No pricing formula is proposed here.

### Advanced conditional fields — deferred

Deferred capabilities include `condition`, `dependsOn`, arbitrary expressions,
visibility formulas, and cross-field dynamic rules. Current basic fields remain
unconditional apart from normal active-state and validation semantics. No
expression language is proposed.

### Automated image analysis — deferred

Deferred capabilities include AI image analysis, face detection, people count,
pose detection, intelligent blur analysis, background removal, moderation,
generative editing, and automatic production correction. Current deterministic
handling is limited to supported MIME, bytes, decoded dimensions, configured
dimension warnings, and crop metadata. Dimension checks are not AI quality
analysis.

### Production preview — deferred

Deferred capabilities include production mockups, manufacturing proofs,
finished-product rendering, 3D production previews, artwork approval, supplier
proofs, and AI-generated previews. `CustomerInputPreview` is only customer-input
feedback and must not be represented as a production preview.

## 6. Legacy compatibility that must remain

The following compatibility paths must not be removed or rewritten until the
replacement is proven:

- `products.customization_schema`;
- `order_items.customization`;
- `order_uploads`;
- `photoPath` / `photoPaths`;
- `photoMeta` / `photoMetas`;
- `storage_key` compatibility;
- legacy admin photo review;
- legacy fulfillment and digital-delivery reads where applicable.

Legacy adapter removal is **DEFERRED**. At minimum it requires:

1. a new durable normalized order snapshot and attachment;
2. historical read compatibility;
3. admin review compatibility;
4. migration and preservation evidence;
5. explicit cutover approval.

## 7. Scope exclusions and current stop states

This Customization change does not own customer authentication, new payment
behavior, payment-provider changes, shipping-price logic, inventory, supplier
procurement, or warehouse behavior.

| Capability / gate | Current state |
|---|---|
| Production Product-specific field values | **UNRESOLVED / REQUIRE BUSINESS APPROVAL** |
| Production Customer Upload Provider | **UNRESOLVED / STOPPED** |
| Production receipt repository | **NOT ACTIVATED** |
| `/api/uploads` | **503 FAIL-CLOSED** |
| `/api/customer-uploads/preview` | **503 FAIL-CLOSED** |
| Production cleanup scheduler | **UNRESOLVED** |
| C1 purchase snapshot | **NOT COMPLETE** |
| Phase C | **NOT CREATED** |
| Task 8.5 | **BLOCKED** |
| Normalized checkout | **503 FAIL-CLOSED** |
| Legacy adapter removal | **DEFERRED** |
| Production deployment | **NOT APPROVED** |

## 8. Local completion versus production activation

The independently implementable local/provider-neutral Customization scope is
substantially complete and conforms to the approved domain, trust, security,
and fixture boundaries.

That does **not** mean production activation is approved. Local implementation
conformance and production provider/schema/business approval are separate
states.

Allowed local work may continue through separately scoped changes:

- local fixture-based UI demonstration;
- deterministic offline tests;
- documentation;
- provider-neutral domain/application maintenance;
- bug fixes that preserve approved scope.

Production provider activation is not required merely to keep local development
working.

## 9. Approval matrix

| Decision / work | Current status | Required owner/input | Blocking capability | Must not infer from |
|---|---|---|---|---|
| C1 business mapping | **BLOCKED** | Business owner | C1 3.5 | Fixtures, seed data, AI, industry estimates |
| C1 backfill authorization | **NO** | C1/business owner | Guarded backfill | Matching fixture counts |
| Connected database migration | **NOT APPROVED** | Architecture/deployment owner | Customization 3.6 | Local SQL or static review |
| Phase C schema | **NOT CREATED** | Architecture owner | Task 8.5 | Provider-neutral fakes |
| Production provider | **UNRESOLVED** | Architecture/security owner | Production uploads | Preference or candidate ranking |
| Bucket/binding | **UNRESOLVED** | Deployment/security owner | Provider activation | Test bucket or local object store |
| Retention policy | **UNRESOLVED** | Business/operations/security owner | Cleanup and preservation | Test TTLs or signed-link TTLs |
| Cleanup scheduler | **UNRESOLVED** | Operations/deployment owner | Production cleanup | Local smoke duration |
| Production field configuration | **UNRESOLVED** | Business owner | Production customization | Product name, slug, legacy JSON, fixtures |
| Deployment activation | **NOT APPROVED** | Deployment owner | Production release | Passing offline tests |

### Owner decision record — C-A Phase C design

On 2026-09-10, the owner approved the **conceptual Phase C schema design only**.
The approved design covers OrderItem customization attachment,
`order_item_customization_snapshots`,
`order_item_customization_values`,
`order_item_customization_images`, configuration-revision association, stable
customization field identity/code, ordered image and crop association,
exactly-once accepted-receipt attachment, and the immutable customer-input
meaning snapshot.

This record does **not** create or approve a Phase C migration artifact,
disposable verification, connected-database application, Catalog backfill, or
runtime durable attachment. C-B through C-F remain closed. The required order
is unchanged: `C1 3.5 → C1 3.6 → C1 3.7 → C1 3.8 → C1 7.4 → Phase C`.
Phase C must not duplicate C1 Product, Variant/SKU, selected-option, price, or
currency purchase authority. Customization remains **64/70** and C1 remains
**41/61**; no checkbox is changed by this record.

## 10. Future-change boundary

Pricing, conditional rules, AI/image processing, production preview, complete
cart identity, and legacy adapter removal must each be implemented through a
separately approved change. This document is a handoff and deferral record;
it is not approval to quietly begin any of those capabilities.

No new design, business data, provider selection, retention number, weight,
lead time, provider cost, supplier instruction, or production field value is
introduced here.

## 11. Explicit non-operations for this handoff

Task 10.10 does not authorize:

- production TypeScript/TSX changes;
- `package.json`, TypeScript, lint, runtime, or provider-config changes;
- migration creation, modification, or execution;
- remote Supabase, Storage, R2, payment, email, tracking, DNS, Cloudflare,
  deployment, or Docker operations;
- changes to C1 task status or Customization Tasks 3.4–3.6 and 8.5–8.7;
- production fixture import or business-data invention.

The document is not evidence that any remote migration, provider binding,
bucket, credential, or deployment has been applied.
