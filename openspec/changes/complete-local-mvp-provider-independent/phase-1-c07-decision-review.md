# PHASE 1 C07 DECISION REVIEW

Status: PRE-IMPLEMENTATION REVIEW ONLY

This document records the repository and migration review for C07 (single-select
customization fields). It does not implement C07, approve new business semantics,
change a task checkbox, or create a migration.

## Baseline

- Branch: `impl/complete-local-mvp-provider-independent`
- HEAD: `b06dc0302c4a5dfb6ab661ef5a47833532e3717f`
- Parent: `a12e507572f6ed204f336a6bc44a96965db3db5d`
- `origin/impl/complete-local-mvp-provider-independent`: `b06dc0302c4a5dfb6ab661ef5a47833532e3717f`
- `origin/main`: `80a0698898c5e43e9de56341582f5826c198fde5`
- Local commerce migration baseline: schema version 41, migrations 0001–0041
- `0042` is absent
- Task state: Phase 0 and Task 1.1 checked; Task 1.2 remains unchecked

## Review conclusion

The proposed C07 interpretation is compatible with the existing authority
boundaries, but C07 is not implemented. A single-select customization is a
CustomizationField value and must not become a Product Option, Variant selector,
SKU fact, or a new `selectedSpecificationKey` field.

The existing JSON configuration and purchase-snapshot columns can represent the
additional choice data without a new relational table. That does not make the
current implementation safe automatically: the typed parsers, authoritative
validation, Admin read/write boundary, PDP/Draft handoff, Checkout acceptance,
the C03 `field_present` calculation, and the database-side purchase/pricing
functions currently reject or do not understand `single_select`. Those changes
belong to the later implementation task and are intentionally not made here.

Recommendation: `READY FOR OWNER C07 POLICY APPROVAL`.

## Existing customization model

### Existing facts

1. `app/domain/customization-field.ts:12` defines
   `CustomizationFieldKind` as only `image`, `short_text`, and `long_text`.
   `CustomizationFieldCore` already carries the stable field identity (`id` and
   `code`), label, required/active flags, position, and configuration revision.
   The field parser at `app/domain/customization-field.ts:210` rejects any other
   kind.
2. `app/domain/customization-value.ts:21` currently has text values and image
   values only. `parseCustomizationValue` therefore has no single-select value
   shape.
3. `app/application/customization-field-repository.ts:17` treats one Product's
   configuration as a versioned ordered field collection and rejects duplicate
   field IDs, codes, or positions. Public reads exclude inactive fields; Admin
   reads retain inactive definitions.
4. `app/domain/catalog/variant.ts:16` defines Product Options separately from
   customization fields. Its approved kinds are SKU-defining option kinds, and
   `parseProductOption` rejects personalization-like option codes at
   `app/domain/catalog/variant.ts:75-111`. This is the existing anti-confusion
   boundary for C07.
5. The current Product customization composition keeps Variant selection and
   customization values as separate inputs (`app/application/product-detail-
   customization-composition.ts`). Customer values are not catalog Variant
   authority.
6. The current PDP/Admin implementation exposes only the three existing field
   kinds. `app/admin/products/AdminCustomizationFieldEditor.tsx` publishes
   complete field replacements through the existing restricted Admin boundary;
   it has no choice editor/read-back surface yet.

### Proposed policy, pending owner approval

`single_select` is a new `CustomizationField` kind. Each such field owns a
bounded, ordered set of choices. A choice is not a Product Option value and does
not select a Variant or SKU.

For an approved configuration, the minimum choice facts are:

```text
choiceId    stable choice identity within the field
choiceCode  stable machine-readable identity
choiceLabel display label
position    non-negative unique order within the field
isActive    whether the choice is currently selectable
```

The intended field semantics are:

- required field: exactly one active choice;
- optional field: zero or one active choice;
- duplicate choice IDs/codes or ambiguous positions: invalid configuration;
- unknown, foreign, inactive, duplicated, or stale choices: reject;
- choice code should remain stable across configuration revisions unless a
  separate owner decision explicitly permits a migration/rename policy;
- the browser submits only the minimum choice identity; the server resolves the
  current Product configuration and supplies authoritative label/order facts.

The last five bullets are proposed policy, not existing behavior. They require
owner approval before implementation and acceptance.

## Proposed single-select compatibility

The intended authoritative flow is:

```text
current local_persistent Product configuration
        │
        ├─ ordered CustomizationField(kind=single_select, choices)
        │
PDP/Draft ── browser submits fieldId + choiceId only
        │
server ── resolves Product + field + choice + revision
        │
ConfiguredItemHandoff ── normalized single-select value
        │
Cart/Checkout ── revalidate current revision and choice ownership
        │
Order snapshot ── retain immutable configuration and selected choice facts
```

The browser's field ID or choice ID is a selector, not authority. The server
must reject a choice that is not owned by the current Product and field, is
inactive, is duplicated, or comes from a stale configuration revision.

## Choice identity

### Existing identity facts

- Field identity is already `field.id`; field code is already a separate stable
  identifier and is checked for uniqueness.
- Product Option identity is `optionId` plus `valueId`, and its selected value is
  Variant/SKU authority. C07 must not reuse this model for customization.
- No existing customization choice identity is present in the domain, JSON
  parser, fixtures, or current Admin editor.

### Recommended C07 shape, pending approval

Use a server-owned choice identity scoped to its field, with `choiceId` and
`choiceCode` retained as identity facts. Resolve and retain `choiceLabel` and
`position` from the authoritative configuration. Do not put a choice identity
into `selectedOptions`, `ProductVariant`, `skuCode`, or a new canonical Product
or Order field named `selectedSpecificationKey`.

The owner must approve the exact choice ID/code lifecycle rule, whether labels
are snapshot facts, the maximum number of choices, and whether inactive choices
remain readable only in Admin/history or are fully excluded from public
configuration revisions.

## Configured item value shape

### Recommended normalized value, pending approval

```json
{
  "fieldId": "<field identity>",
  "fieldCode": "<field code>",
  "kind": "single_select",
  "choiceId": "<choice identity>",
  "choiceCode": "<choice code>"
}
```

`choiceLabel` should be resolved from the current authoritative configuration
and retained in the accepted purchase snapshot, rather than trusted from the
browser. The normalized value is a customization value and is carried in the
existing `customizationValues` member of `ConfiguredItemHandoff`; it does not
change the Product/Variant/SKU portion of that handoff.

## PDP / Draft

The PDP would render an ordered radio/select-style control from the current
active configuration. The Draft reducer would need a field-value action that
accepts the proposed single-select value shape and clears/rejects it when the
field or configuration revision is no longer current. A required field must not
be considered ready without one valid choice; an optional field may be absent.

The Draft remains a browser editing projection. It cannot authorize the choice,
price, Cart, or Order. Upload, image receipts, and image-count semantics remain
owned by their existing image field path; C07 does not create a combined upload
or selection aggregate.

## Admin

The existing signed/restricted Admin customization boundary is the correct
surface. It would need to support complete replacement/read-back of a
single-select field and its ordered choices, including:

- field identity ownership and configuration revision;
- choice ID/code/label/position/active validation;
- duplicate and ambiguous-order rejection;
- expected-revision/CAS and audit behavior already used by the Admin boundary;
- inactive choice handling without silently changing historical snapshots.

The current editor has only image, short-text, and long-text controls and no
choice collection. No Admin code is changed by this review.

## Cart / Checkout / Order

### Existing persistence capacity

- `local/commerce/migrations/0002_local-commerce-identity-catalog-cart-media.sql:162-180`
  stores the versioned configuration in
  `catalog_configuration_snapshots.definition jsonb`, keyed by Product and
  revision.
- `local/commerce/migrations/0002_local-commerce-identity-catalog-cart-media.sql:221-246`
  stores `cart_lines.configuration_revision` and
  `cart_lines.configuration_values jsonb`.
- `local/commerce/migrations/0002_local-commerce-identity-catalog-cart-media.sql:249`
  begins the durable Draft representation; it is not a new C07 authority.
- `local/commerce/migrations/0014_local-commerce-order-commit.sql:164-176`
  compares the accepted Cart customization and current configuration before
  commit.
- `local/commerce/migrations/0014_local-commerce-order-commit.sql:293-297`
  stores configuration and normalized values in the immutable Order-item
  customization facts, together with configuration revision and other purchase
  facts.

These existing JSONB boundaries can carry the proposed choices and normalized
value without a new table or column. They are only storage capacity: current
parsers and SQL validation still need an explicit C07 implementation.

### Required implementation behavior

Cart and Checkout must re-resolve the current Product configuration, enforce the
same revision, validate exact field/choice ownership, and reject stale or
inactive choices. Order commit must snapshot the accepted configuration and
choice facts immutably. It must not re-resolve a historical Order from the
current Catalog after commit.

No Cart, Checkout, Order, pricing, SKU, or API implementation is changed here.

## C03 interaction

Current C03 pricing uses the `field_present` selector in
`app/application/customization-surcharge-pricing.ts:94-101` and the persistent
counterpart in `local/commerce/migrations/0039_local-commerce-customization-
surcharge.sql`. It currently treats image presence as a non-empty image list and
text presence as a non-empty trimmed value.

For an approved C07 implementation, a valid single-select value should count as
present when its choice is accepted by the authoritative field configuration.
The C03 behavior must remain:

- selector kind stays `field_present`;
- no per-choice surcharge is introduced by C07;
- no percentage, arbitrary browser amount, or Product Option price is inferred;
- stale/invalid configuration remains unavailable or rejected according to the
  existing C03 boundary.

The TypeScript and SQL `field_present` paths will require an explicit future
implementation update to recognize the new value kind. That is not performed
in this review.

## Schema consequence

**New migration required for this review: NO.**

The current `catalog_configuration_snapshots.definition jsonb`, Cart
`configuration_values jsonb`, Draft value snapshot, and immutable Order
customization facts already provide versioned JSON boundaries for the proposed
choice structure. The current `read_catalog_authority` RPC returns the
configuration definition as part of the same Catalog snapshot, so a structurally
valid choice collection can be preserved there after parser and acceptance
changes.

This is not permission to bypass schema safety. If the eventual C07
implementation must change a database-side acceptance/pricing function or add a
database constraint/RPC needed for authoritative choice validation, it must use
the next ordered migration after 0041, with a fresh checksum and the existing
ledger/security evidence. Migrations 0001–0041 remain immutable, and `0042` is
not created by this review.

## Persistence and authority caveat

The local persistent read path is `LocalCatalogAuthority` in
`app/infrastructure/local-commerce/local-catalog-authority.server.ts:38-124`.
It verifies project ownership, active lifecycle, Product/configuration identity,
revision alignment, and then calls `normalizeCustomizationFieldConfiguration`.
That normalization currently rejects the new kind, so C07 must extend this same
authority rather than introduce a second Catalog reader or a memory fallback.

The older generic customization repository and root/public Catalog repository
are not substitutes for the local_persistent Catalog authority. Any future
Admin/persistence wiring must preserve that source boundary and the existing
project/marker/fail-closed checks.

## Dependencies and separation

| Area | Review result |
| --- | --- |
| C08 multi-select | Separate choice/cardinality semantics; may reuse approved identity conventions but must not be implemented as part of C07. |
| C09 numeric | Separate value normalization and range/step policy. |
| C10 generic file | Separate private-file policy and receipt/storage authority. |
| C28 conditional-required | May consume a validated C07 field/value predicate later; no predicate graph is added here. |
| C29 conditional-visibility | May hide C07 choices later; hidden browser values must still be rejected by the future server evaluator. |
| H03 Admin customization | Required for C07 Admin editing/read-back, but this review does not extend H03. |
| C03 | Existing `field_present` semantics need a future single-select presence branch; no per-choice pricing is approved here. |

## Owner decisions still required

Before Task 1.2 implementation can be accepted, the owner should approve:

1. The exact `single_select` field and value vocabulary.
2. Required versus optional semantics (exactly one versus zero-or-one).
3. Choice identity shape (`choiceId`, `choiceCode`) and code/label lifecycle
   across configuration revisions.
4. Maximum choices per field and maximum lengths for IDs, codes, labels, and
   help text.
5. Position ordering and whether inactive choices remain visible in Admin and
   historical reads.
6. Whether the browser may submit `choiceId`, `choiceCode`, or both as the
   minimum selector; the server must remain authoritative either way.
7. The exact immutable Order snapshot shape for choice facts.
8. Confirmation that C03 remains field-presence-only, with no per-choice
   pricing in C07.
9. Confirmation that no new relational schema is required unless the
   implementation proves an authoritative SQL/RPC constraint cannot be safely
   expressed in the existing JSON/version boundary.

## OpenSpec and safety review

- `openspec/changes/complete-local-mvp-provider-independent/tasks.md:10` still
  leaves Task 1.2 unchecked.
- Phase 0 and Task 1.1 remain checked; no task checkbox is changed here.
- No application implementation was changed.
- No test was changed.
- No migration was changed or executed.
- Migration baseline remains schema version 41 with 41 migrations; `0042` is
  absent.
- Catalog authority remains the existing local_persistent/read-only boundary.
- Supplier semantics, production configuration, payment, fulfillment, and
  remote services are untouched.

## Validation performed after creating this review artifact

The following checks are required for this bounded documentation change:

- `npx openspec validate --all --strict`
- `git diff --check`

The application, tests, and migrations must remain byte-unchanged relative to
the baseline; only this review artifact may appear in the change.

## Recommendation

`READY FOR OWNER C07 POLICY APPROVAL`

The current architecture has a clean separation between Product options and
customization values and has sufficient versioned JSON snapshot capacity. Owner
approval is still required for the exact choice semantics and bounds before any
C07 implementation begins. Task 1.2 should remain unchecked until the approved
semantics are implemented and independently accepted across Domain, persistence,
Admin, PDP, configured item, Cart, Checkout, and immutable Order snapshot.
