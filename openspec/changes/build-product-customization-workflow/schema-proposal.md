# Exact Additive Customization Schema Proposal — Task 3.2 (second revision)

**Status:** revised for final Task 3.3 human approval; approval remains pending.
**Scope:** relational design only. This document creates no SQL, migration artifact, remote inspection, or application implementation authorization.

## 1. Decision summary

This additive design introduces normalized, server-mediated Customization persistence without changing or reinterpreting legacy Product or order storage.

```text
Product
  → product_customization_configs (immutable configuration revisions)
  → customization_field_identities (stable logical field identity)
  → customization_fields (immutable revision-specific definition)
  → customization_drafts (guest pre-order draft)
  → customization_draft_values (one value per definition)
  → customer_upload_receipts (private opaque receipt)
  → customization_value_images (ordered current draft image placements)
  → order_item_customization_snapshots (Phase C only)
  → order_item_customization_values (Phase C only)
  → order_item_customization_images (Phase C only)
```

There are **10 proposed additive relations**. `products.customization_schema`, `order_items.customization`, and `order_uploads` remain untouched compatibility structures: there is no legacy rewrite, backfill, or reinterpretation. Phase C customization snapshots preserve only customization meaning and never duplicate C1 Product name/slug, Variant/SKU identity/code, selected options, base price, or currency snapshots.

`customization_field_identities` is intentionally a small identity registry, not a field-version subsystem. It separates the stable Task 2.x domain `CustomizationField.id` from the immutable revision-definition row ID.

## 2. Configuration revisions and stable field identity — Phase A

`product_customization_configs` is the normalized authority for a Product's current configuration. A Product with no current approved configuration has no normalized customizer; production fails closed rather than accepting legacy JSON or an empty permissive shape. The server generates a UUID v4 `configuration_revision_id`; its canonical UUID string is the existing provider-neutral Task 2.x `configurationRevision` representation.

Administrative edits append a complete new revision and complete new immutable definition rows. Existing drafts retain their claimed revision and become stale once it is not current. Attached Phase C history retains its revision indefinitely. Old revisions are privileged history, never a public catalog result.

### Relation: `product_customization_configs`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Immutable configuration revision identity. |
| `product_id` | `uuid` | No | FK → `products.id` | `ON DELETE RESTRICT`; revision owner. |
| `is_current` | `boolean` | No | — | Default false; public authority marker. |
| `created_at` | `timestamptz` | No | — | Default `now()`; creation time. |
| `superseded_at` | `timestamptz` | Yes | — | Records when a previously current revision was superseded. |

**Declarative rules:** partial UNIQUE permits at most one `is_current = true` row per Product; unique `(id, product_id)` supports composite FKs; CHECK requires `is_current = true → superseded_at IS NULL`. The reverse implication is deliberately not required, so a new non-current revision may be assembled inside one transaction before publication without fabricating a supersession timestamp.

**Publication command:** the authorized server boundary validates the complete new configuration before a database transaction. In that transaction it creates the new revision and every immutable definition, atomically changes the former current revision to `is_current = false` and sets its `superseded_at`, then sets the new complete revision `is_current = true` with null `superseded_at`, and commits. Readers see the old complete current revision or the new complete current revision, never a committed staging/partial configuration. A failed transaction rolls back all of its revision/definition rows.

### Relation: `customization_field_identities`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Stable logical/domain `CustomizationField.id`. |
| `product_id` | `uuid` | No | FK → `products.id` | `ON DELETE RESTRICT`; permanent Product owner. |
| `code` | `text` | No | — | Lowercase catalog code, length 1–80; immutable for this identity. |
| `created_at` | `timestamptz` | No | — | Default `now()`; audit timing. |

UNIQUE `(product_id, code)` and UNIQUE `(id, product_id)` prevent a code or stable identity crossing Product ownership. A new logical field receives a new stable ID and code; a definition cannot redefine either.

### Relation: `customization_fields`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Revision-specific immutable field-definition row ID; never the browser/domain field ID. |
| `configuration_revision_id` / `product_id` | `uuid` | No | composite FK → config `(id, product_id)` | Exact revision and Product owner. |
| `stable_field_id` | `uuid` | No | composite FK → identity `(id, product_id)` | Stable logical field ID carried across revisions. |
| `label` | `text` | No | — | Trimmed non-blank, 1–200. |
| `kind` | `text` | No | — | Exactly `image`, `short_text`, or `long_text`. |
| `required` / `is_active` | `boolean` | No | — | Default false / true; revision-specific customer behavior. |
| `position` | `integer` | No | — | Non-negative deterministic field order. |
| `max_length` / `help_text` | `integer` / `text` | Yes | — | Text-only typed constraints; positive max length; help text non-blank when present. |
| `allowed_mime_types`, `max_bytes`, dimensions, counts, `crop_enabled` | typed nullable columns | Yes | — | Image-only bounded constraints: JPEG/PNG/WebP, positive byte/dimension bounds, valid count range, and crop flag. |
| `created_at` | `timestamptz` | No | — | Default `now()`; audit timing. |

Kind-discriminating row-local CHECKs require a text definition to have its text constraints and all image columns null; an image definition must have its required image constraints and text columns null. Recommended dimensions are both absent or both present and never below minimum.

UNIQUE `(configuration_revision_id, stable_field_id)` gives one definition of one logical field per revision; UNIQUE `(configuration_revision_id, position)` fixes ordering. UNIQUE `(id, stable_field_id, product_id, configuration_revision_id)` supports exact composite FKs from values/receipts. The public projection returns `stable_field_id AS id`, the immutable identity code, and this revision's safe definition fields; it never exposes the definition row ID as `CustomizationField.id`.

## 3. Guest draft ownership and lifecycle — Phase B

### Relation: `customization_drafts`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Specific pre-order draft identity. |
| `product_id` / `configuration_revision_id` | `uuid` | No | composite FK → config `(id, product_id)` | Product and claimed revision for staleness validation. |
| `owner_binding_id` | `uuid` | No | indexed, **not unique** | Non-secret server comparison identity; one owner may own multiple drafts. |
| `state` | `text` | No | — | Phase B CHECK exactly `active`, `expired`, or `abandoned`. |
| `expires_at` | `timestamptz` | No | — | Explicit expiry instant. |
| `created_at` / `updated_at` | `timestamptz` | No | — | Default `now()` / server-managed audit timing. |

UNIQUE `(id, product_id, configuration_revision_id)` is a composite-FK target for values and receipts. Index `(owner_binding_id, state, expires_at)` supports owner-verified lookup/expiry; `owner_binding_id` intentionally has no uniqueness constraint.

The Task 5.2 HttpOnly/SameSite signed ownership context carries the integrity-protected `owner_binding_id` (and only necessary version/expiry claims), not one cookie slot per draft. The request identifies the particular `draft.id`; the server verifies the signed context and then requires the requested draft's `owner_binding_id` to match. The same valid owner context can safely operate multiple drafts because every operation also scopes the requested draft. Receipt IDs alone grant no authority; raw cookies, HMAC secrets, bearer tokens, and owner values are never logged or made browser credentials.

**Phase B draft transitions:**

```text
active → expired       (atomically expires its unattached active receipts and removes their draft placements)
active → abandoned     (atomically removes its unattached active receipts and removes their draft placements)
expired → abandoned
```

`active` is the only Draft state that accepts values and receipt placement. An `expired` or `abandoned` draft has no active attachable receipt and no current image placement. Phase B has no `attached` state and no `order_items` column/FK.

## 4. Draft values and ordered image placements — Phase B

### Relation: `customization_draft_values`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Draft value identity. |
| `draft_id`, `product_id`, `configuration_revision_id` | `uuid` | No | composite FK → draft `(id, product_id, configuration_revision_id)` | Carried tuple proves exact owner/revision; not a second authority. |
| `field_definition_id` / `stable_field_id` | `uuid` | No | composite FK → definition `(id, stable_field_id, product_id, configuration_revision_id)` | Exact immutable definition plus stable browser/domain field identity. |
| `text_value` | `text` | Yes | — | Customer normalized text when valid for the definition; no cross-table CHECK claim. |
| `created_at` / `updated_at` | `timestamptz` | No | — | Default `now()` / server-managed. |

UNIQUE `(draft_id, field_definition_id)` gives at most one value per field definition. UNIQUE `(id, draft_id, stable_field_id)` supports image placement FKs. The browser/domain continues using the stable ID, while persistence retains the revision-specific definition required for exact validation/history.

**Text rule aligned with Task 2.5:** an absent optional text field has no row. A supplied optional string which Task 2.5 normalizes to `""` may persist as an empty `text_value`; it is not rejected merely for emptiness. A required text value needs a row and a non-empty normalized value. The Phase C immutable snapshot uses exactly the same absence/empty-string rule.

### Relation: `customization_value_images`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Draft image placement identity. |
| `draft_value_id`, `draft_id`, `stable_field_id` | `uuid` | No | composite FK → draft value `(id, draft_id, stable_field_id)` | Exact draft image field. |
| `receipt_id` | `uuid` | No | with draft/field composite FK → receipt `(id, draft_id, stable_field_id)` | Same-draft/same-field opaque receipt. |
| `position` | `integer` | No | — | Non-negative order within the image field. |
| `crop_x`, `crop_y`, `crop_width`, `crop_height` | `double precision` | Yes | — | All null or all valid finite normalized crop values; see precision rule below. |
| `created_at` | `timestamptz` | No | — | Default `now()`. |

UNIQUE `(draft_value_id, position)` preserves ordering and UNIQUE `receipt_id` prevents one receipt occupying multiple draft placements.

**Crop representation:** Task 2.4 accepts JavaScript finite numbers, whose runtime numeric representation is IEEE-754 binary64. PostgreSQL `double precision` preserves that intended number representation without imposing arbitrary fixed-scale decimal quantization. Each crop column is checked not to be `NaN`, `Infinity`, or `-Infinity`; all four are null together or all non-null; `x ≥ 0`, `y ≥ 0`, `width > 0`, `height > 0`, all are `≤ 1`, and `x + width ≤ 1`, `y + height ≤ 1`. There is no rounding, clamping, or five-decimal persistence rule. This same `double precision` representation and exact range/finite checks apply in `order_item_customization_images`.

## 5. Private opaque upload receipts, placement invalidation, and cleanup — Phase B

### Relation: `customer_upload_receipts`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Opaque public receipt identity. |
| `draft_id`, `product_id`, `configuration_revision_id` | `uuid` | No | composite FK → draft `(id, product_id, configuration_revision_id)` | Exact draft/revision ownership. |
| `field_definition_id` / `stable_field_id` | `uuid` | No | composite FK → definition `(id, stable_field_id, product_id, configuration_revision_id)` | Exact image definition and stable field association. |
| `provider_kind`, `object_container`, `object_key` | `text` | No | — | Private provider-neutral locator; bounded non-blank values. |
| `original_filename` | `text` | Yes | — | Safe normalized metadata only. |
| `mime_type`, `file_size_bytes`, `width`, `height` | typed | No | — | Server-inspected JPEG/PNG/WebP and positive trusted metadata. |
| `state` | `text` | No | — | Phase B CHECK exactly `active`, `replaced`, `removed`, `expired`, `cleanup_pending`, `cleanup_failed`, `cleanup_completed`. |
| `replaced_by_receipt_id` | `uuid` | Yes | with draft/field composite self-FK → receipt `(id, draft_id, stable_field_id)` | Same-draft/same-field replacement target only. |
| `expires_at` | `timestamptz` | No | — | Explicit expiry. |
| cleanup lease/attempt/error/timing fields | typed | as applicable | — | Lease only in `cleanup_pending`; bounded sanitized error code; `cleaned_at` only after completion. |
| `created_at` / `updated_at` | `timestamptz` | No | — | Default `now()` / server-managed. |

UNIQUE `(provider_kind, object_container, object_key)` prevents locator reuse. UNIQUE `(id, draft_id, stable_field_id)` is the composite-FK target for placements and replacement lineage. `dimension_state` is deliberately not persisted: later services derive it from trusted width/height and immutable definition constraints, preventing duplicated warning state from drifting. Receipt response IDs are opaque; no object URL/key/container, provider credential, bytes, moderation/AI result, or payment data is exposed. Selecting Supabase Storage or Cloudflare R2 remains deferred.

### Exact Phase B receipt lifecycle

| State | Meaning | Legal next state |
|---|---|---|
| `active` | Accepted usable temporary receipt of an active Draft. | `replaced`, `removed`, `expired`. |
| `replaced` | Superseded by a distinct active replacement receipt. | `cleanup_pending`. |
| `removed` | Removed from usable customer input. | `cleanup_pending`. |
| `expired` | Invalidated by receipt/draft expiry. | `cleanup_pending`. |
| `cleanup_pending` | Worker holds cleanup lease. | `cleanup_completed` or `cleanup_failed`. |
| `cleanup_failed` | Physical cleanup failed and may retry. | `cleanup_pending`. |
| `cleanup_completed` | Physical cleanup confirmed. | Terminal. |

There is **no `attached` state in Phase B**. Normal `active → cleanup_pending` is forbidden; `replaced`, `removed`, and `expired` cannot jump directly to cleanup completion/failure. Cleanup selects only unattached-by-design Phase B receipts in `replaced`, `removed`, `expired`, or `cleanup_failed`, locks a bounded `SKIP LOCKED` batch, conditionally claims it as `cleanup_pending`, and only then completes or fails cleanup. Lease expiry is reclaimable through the same conditional claim; a failed deletion never claims success.

### Placement and state-transition commands

Every usable Phase B `customization_value_images` placement references an `active` receipt. The locked server/database transition command keeps this true:

- **Replace:** lock active draft, predecessor receipt, and predecessor placement; create and server-validate a *different*, same-draft/same-stable-field new receipt in `active`; remove the predecessor placement and create the new placement at the chosen valid position in the same transaction; set predecessor `replaced_by_receipt_id` to that target and predecessor state to `replaced`; commit. The target must be active at the predecessor transition; cross-draft, cross-field, self-reference, inactive-target, and missing-placement replacement fail closed. The transaction's internal delete/insert order is implementation detail; no reader sees an unplaced committed replacement state.
- **Remove:** lock draft/receipt/placement, delete the current placement, then transition active receipt to `removed` in the same transaction. It becomes cleanup eligible only after that transaction commits.
- **Receipt expiry:** lock draft/receipt/placement, delete the current placement, then transition active receipt to `expired` in the same transaction.
- **Draft expiry:** lock active draft and every unattached active receipt/placement; delete each active placement and transition those receipts to `expired`, then draft to `expired`, atomically.
- **Draft abandonment:** same locked shape, deleting active placements and transitioning active receipts to `removed`, then draft to `abandoned`, atomically.

Thus a current placement never points at a non-active receipt after commit. A cleanup/replace/remove/expiry race has one row-lock winner; a command that loses re-reads state and fails safely rather than creating a stale placement.

## 6. Phase C attachment and immutable order customization snapshots

Phase C occurs only after C1 3.8 and remains runtime-dormant until C1 7.4 and later approved customization tasks. It adds no new relation beyond the 10 above.

Phase C adds `attached_order_item_id → order_items.id` and `attached_at` to **both** drafts and receipts, expands the Draft state CHECK with `attached`, and expands the receipt state CHECK with `attached`.

- `customization_drafts.attached_order_item_id` is UNIQUE when non-null: one Draft attaches once to one OrderItem.
- `customer_upload_receipts.attached_order_item_id` is **not unique**: multiple distinct receipts may attach to the same OrderItem. Each receipt still has one nullable attachment target and the attached state/command permits setting it once.

### Relation: `order_item_customization_snapshots`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Immutable snapshot identity. |
| `order_item_id` | `uuid` | No | FK → `order_items.id` | `ON DELETE RESTRICT`; unique, one snapshot per OrderItem. |
| `draft_id` | `uuid` | No | FK → draft | `ON DELETE RESTRICT`; unique source draft. |
| `product_id` / `configuration_revision_id` | `uuid` | No | composite ownership relation | Must equal attached Draft's Product/revision. |
| `created_at` | `timestamptz` | No | — | Default `now()`. |

There is no `configuration_revision_value`: `configuration_revision_id` is the sole authority and serializes canonically as the domain revision string.

### Relation: `order_item_customization_values`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Immutable value identity. |
| `snapshot_id`, `product_id`, `configuration_revision_id` | `uuid` | No | composite FK → snapshot context | Exact snapshot revision. |
| `field_definition_id` / `stable_field_id` | `uuid` | No | composite FK → definition | Exact definition and stable domain field identity. |
| `label_snapshot`, `kind_snapshot`, `required_snapshot`, `position_snapshot` | typed | No | — | Revision-dependent copied meaning. |
| `text_value` | `text` | Yes | — | Same optional-empty/required-non-empty Task 2.5 server rule as drafts. |
| `created_at` | `timestamptz` | No | — | Default `now()`. |

UNIQUE `(snapshot_id, stable_field_id)` and `(snapshot_id, position_snapshot)` preserve one immutable value per logical field and deterministic history. Stable identity's immutable Product code remains in `customization_field_identities`, avoiding a redundant mutable code authority.

### Relation: `order_item_customization_images`

| Column | Type | Null? | Key/FK | Constraint and purpose |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK | Immutable image-placement identity. |
| `snapshot_value_id` | `uuid` | No | FK → snapshot value | `ON DELETE RESTRICT`; image definition only. |
| `receipt_id` | `uuid` | No | FK → receipt | Attached receipt for same OrderItem. |
| `position` | `integer` | No | — | Non-negative immutable image order. |
| `crop_x`, `crop_y`, `crop_width`, `crop_height` | `double precision` | Yes | — | Same all-null-or-finite/in-bounds no-rounding crop checks as draft placement. |
| `created_at` | `timestamptz` | No | — | Default `now()`. |

UNIQUE `(snapshot_value_id, position)` and UNIQUE `receipt_id` preserve one immutable ordered placement. Phase C attachment locks active Draft, selected active receipts, target OrderItem, and placements; it copies ordered receipt/crop data to immutable snapshot rows, sets Draft/receipt attachment targets, and transitions all to `attached` in one transaction. Attached receipt placement is represented only by the immutable snapshot, never by a current draft placement; attached receipts are terminal and never cleanup eligible.

## 7. Security, RLS, grants, deletion, and preservation

Every relation enables RLS. `anon` and `authenticated` receive no direct SELECT/INSERT/UPDATE/DELETE. Guest routes verify signed owner context and requested Draft before privileged repository/provider construction; receipt IDs alone authorize nothing. Public catalog read is one server-side projection of current active field definitions, returning only stable field ID, code, label, kind, required/position, safe constraints, and revision ID. It returns no prior definition, draft, owner, receipt, locator, private metadata, or admin timing.

Server/service access is minimal for authorized configuration, owner-verified draft/media work, cleanup, and Phase C attachment. All new foreign keys use `ON DELETE RESTRICT`; revisions supersede rather than delete history. Legacy schema and all historical relationships remain unchanged. No storage provider, bucket, public URL, or provider-specific type is selected.

## 8. Indexes and enforcement matrix

### Access/index plan

| Index or uniqueness | Purpose |
|---|---|
| Partial unique current config; `(id, product_id)` | Current config and composite ownership. |
| Unique `(product_id, code)` and `(id, product_id)` on field identities | Stable Product code and ownership. |
| Definition unique `(revision, stable field)` / `(revision, position)` | One logical field and deterministic order per revision. |
| `(owner_binding_id, state, expires_at)` on drafts | One guest context can look up multiple owned drafts. |
| Unique `(draft_id, field_definition_id)` | One draft value per definition. |
| Unique `(draft_value_id, position)` / unique `receipt_id` | Ordered current image placements and no receipt reuse. |
| Unique provider locator / `(draft_id, state)` / cleanup partial indexes | Private-object identity, lifecycle query, cleanup leasing. |
| Phase C unique Draft attachment target; snapshot order/identity uniqueness | Attach-once draft and immutable ordering. |
| Phase C non-unique receipt attachment target index | Find multiple receipts for one OrderItem without falsely limiting cardinality. |

### Integrity/enforcement ownership

| Invariant | Enforced by | Why |
|---|---|---|
| One current complete published revision | partial UNIQUE + config CHECK + locked publication transaction | Unique/current state is relational; atomic publication prevents a visible partial revision. |
| Stable field Product/code and definition's exact Product/revision/stable identity | FK / composite FK / UNIQUE | Direct tuple and cardinality integrity. |
| Draft/value/receipt exact Product/revision/definition/stable-field tuple | composite FK / UNIQUE | Prevents cross-Product, cross-revision, and cross-field references declaratively. |
| Phase B and C allowed state vocabularies; cleanup lease/timing shape; crop finite/range/all-or-none | row-local CHECK | These inspect only the row's own columns. Crop uses `double precision` explicit `NaN`/infinity rejection and bounds. |
| Image definition must not persist `text_value`; text definition value shape; optional empty text; required non-empty text; maxLength; required-field completeness; image min/max count | **server Task 2.5 validator before persistence** | Field kind, requiredness, max length, and count live on the referenced definition; a draft-value row CHECK cannot inspect them. Optional empty text remains allowed exactly as Task 2.5 defines. |
| One draft value per definition, one current receipt placement, deterministic positions; one Draft/snapshot attachment | UNIQUE | Direct cardinality/order rules. |
| Receipt accepted only for active Draft + image definition; active current placement only; replacement target active and same state graph; non-active Draft has no active receipt/current placement | **one deferred stateful DB constraint trigger**, plus locked lifecycle command | Requires joined lifecycle/type state and commit-time multi-row absence proof. It is not represented as a row CHECK. |
| Replace/remove/expiry/abandon placement deletion and state transition | locked transactional command, guarded by that Phase B trigger | Command gives exact atomic ordering; trigger prevents committed graph corruption. |
| Cleanup lease race and Phase C attachment race | locked conditional commands (`SKIP LOCKED` for cleanup) | Competing state transitions require winner/re-read behavior, not a generic trigger. |
| Phase C Draft/receipt/OrderItem/snapshot agreement and immutable copy from source placement | **one deferred stateful DB constraint trigger** plus locked attachment command | Cross-relation attachment state and copied snapshot facts cannot be a row CHECK. |

**Final deferred stateful trigger count: 2.** One Phase B Draft/receipt/placement lifecycle-integrity trigger, and one Phase C attachment/snapshot-integrity trigger. Declarative keys, UNIQUE constraints, and row-local CHECKs carry all other described rules; Task 2.5 owns validation of field-dependent customer values before persistence.

## 9. Migration ordering and dependencies

| Question | Answer |
|---|---|
| Legacy tables required | `products` in Phase A/B; `order_items` only in Phase C. Legacy JSON and `order_uploads` are preserved but are not dependency/backfill sources. |
| Depends on C1 expanded Product/Variant tables? | No. It uses stable legacy `products.id`, not Category, Variant, SKU values, fulfillment, or ProductAssets. |
| Can Phase A/B exist before C1 3.8? | Yes conceptually: neither phase contains an OrderItem attachment column/FK or attached state. Connected-database application still requires its own approved baseline. |
| Can Phase C exist before C1 3.8? | No. It is ordered after C1 3.8 and runtime remains disabled until C1 7.4 and later approved customization work. |

1. **Baseline/order gate:** separate approved deployment work establishes actual applied migration baseline. Existing C1 artifacts are local only; no applied-state assumption is made here.
2. **Phase A:** configuration revisions, stable field identities, immutable definitions, typed constraints, security/projection support. No production Product field data or backfill.
3. **Phase B:** pre-order drafts, draft values, receipts, current image placements, lifecycle/cleanup and security. State checks exclude `attached`; there are no `order_items` references.
4. **Frozen C1 chain:** independently complete C1 3.5 → 3.6 → 3.7 → 3.8 → 7.4 under its approved gates.
5. **Phase C:** attachment columns/state-check expansion plus immutable order customization snapshots. The behavior stays dormant until all ordered gates are separately complete.

This is conceptual ordering, not executable migration work. All additions are additive; no legacy backfill is proposed.

## 10. Traceability and non-decisions

| Requirement | Exact proposed element |
|---|---|
| Stable CustomizationField identity across immutable revisions | `customization_field_identities.id`; definition rows carry `stable_field_id`. |
| Normalized text and ordered images | Draft/snapshot values plus placements. |
| Guest ownership | reusable `owner_binding_id` plus signed server context and specific `draft.id`. |
| Opaque private receipt | Receipt UUID; provider/container/key internal only. |
| Replace/remove/expiry/cleanup | Phase B lifecycle and atomic placement invalidation commands. |
| Immutable customization history | Phase C snapshots with stable IDs and revision-specific copied meaning. |
| No C1 duplication | No Product/SKU/options/base-price/currency snapshot fields. |
| Legacy compatibility | Legacy columns/relations untouched; later isolated adapter only. |

Rejected or deferred: legacy JSON as authority; a field row reused across revisions; direct anonymous CRUD; persisted `dimension_state`; Phase B OrderItem FKs; a duplicate revision string; storage-provider selection; production field definitions; retention durations; exact owner-cookie cryptography; custom pricing, condition engines, production previews, supplier semantics, and cart identity.

## STOP

**Task 3.3 remains HUMAN APPROVAL PENDING.** This second revision modifies no artifact other than this proposal and authorizes no SQL, migration, application code, remote Supabase access, C1 change, or provider decision.
