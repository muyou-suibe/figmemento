# Phase 1 C08 decision review

Status: PRE-IMPLEMENTATION REVIEW — no C08 implementation approved or applied.

## Baseline

- Branch: `impl/complete-local-mvp-provider-independent`
- Parent SHA: `7d15ca7fc75c56eb781a1118d5d99a83f223dc5b`
- Current HEAD: `c57bd7ae966b98d09bf1eba68199153882ef7064`
- Remote implementation branch: `c57bd7ae966b98d09bf1eba68199153882ef7064`
- Remote `main`: `80a0698898c5e43e9de56341582f5826c198fde5`
- PostgreSQL baseline: 17
- Schema version: 42
- SQL migrations: 42
- Manifest migrations: 42
- Retained ledger: `42/42`, pending `0`
- Migration checksum mismatches: `0`
- Migration `0043`: absent
- Task state: `0.1–0.3 [x]`, `1.1 [x]`, `1.2 [x]`, `1.3 [ ]`, `1.4–1.9 [ ]`

Only this decision artifact is created by this review. Application code,
tests, migrations, and task checkboxes are unchanged.

## EXISTING FACT

### Current C07 choice authority

The accepted C07 implementation has:

- `CustomizationFieldKind` containing `single_select`.
- `CustomizationSingleSelectChoice` with `id`, `code`, `label`, `position`,
  and `isActive`.
- bounded 1–50 choices, unique IDs/codes/positions, safe labels, and
  authoritative position ordering in
  `app/domain/customization-field.ts`.
- exact browser value shape `{ fieldId, fieldCode, kind, choiceId }` in
  `app/domain/customization-value.ts`.
- server validation for Product ownership, field identity, field kind,
  configuration revision, unknown choices, and inactive choices in
  `app/domain/customization-validation.ts`.
- a public configuration projection that omits inactive choices while the
  Admin projection retains them in
  `app/application/customization-field-repository.ts`.
- local Admin choice identity history keyed by Product and field. The current
  implementation rejects retired ID/code rebinding and permits edits to the
  label, position, or active flag when the ID/code pair is unchanged.
- detached C07 Order facts in the existing JSON snapshot boundary. The
  current internal fact contains field identity/label and choice
  ID/code/label/position; public projection does not resolve historical facts
  from the current Catalog.

### Current persistence boundaries

The current persistent Cart and Order paths already carry customization data in
JSON:

- `cart_lines.configuration_values` stores accepted customization values.
- the accepted Cart item carries the configuration revision and normalized
  values.
- `order_item_purchase_snapshots.customization_facts` stores the immutable
  configuration definition, accepted values, fulfillment facts, and selected
  option facts.
- `local_commerce.order_commit(...)` revalidates current purchase facts and
  writes the immutable snapshot in one transaction.

No C08-specific table or column is required by the current shape alone.

### Existing C03 pricing authority

C03 uses the one existing `field_present` selector. The TypeScript authority
is `calculateCustomizationPricing` in
`app/application/customization-surcharge-pricing.ts`; the persistent authority
is `local_commerce.compute_customization_pricing(text,jsonb)` introduced and
forward-replaced through the C03 migrations.

The current TypeScript presence rules are:

- image: one or more accepted images;
- text: non-empty trimmed text;
- C07 single-select: one active choice;
- each matching rule allocates once per field.

The current SQL function still contains an explicit kind allowlist and the
0042 forward fix adds only `single_select`. It does not yet understand
`multi_select`.

## PROPOSED OWNER POLICY

The proposed C08 policy is compatible with the current architecture if it is
implemented as another Product-owned customization field, not as a Product
Option, Variant selector, SKU fact, Supplier option, or pricing authority.

The proposed browser value is the correct minimal customer shape:

```ts
{
  fieldId,
  fieldCode,
  kind: "multi_select",
  choiceIds: string[]
}
```

`fieldId`, `fieldCode`, and `kind` remain consistency claims that the server
must re-resolve. `choiceIds` is the only choice fact accepted from the
browser. Browser choice codes, labels, positions, active flags, prices,
surcharges, Product Option IDs, Variant IDs, and SKU facts remain forbidden.

The proposed constraints are safe and bounded:

- total choices: 1–50;
- `minSelections`: integer 0–50;
- `maxSelections`: integer 1–50;
- `minSelections <= maxSelections`;
- active field requires `activeChoiceCount >= minSelections` and
  `maxSelections <= activeChoiceCount`;
- `required=false` requires `minSelections=0`;
- `required=true` requires `minSelections>=1`.

The last two rules are compatible with the existing generic `required` flag.
They make the base configuration unambiguous: an optional field may be empty,
while a required field must contain at least one choice. Future C28 conditional
requiredness must be a separate effective-validation layer. It may raise an
effective minimum to one when its predicate is true, but must never lower the
persisted C08 minimum or change C08 into pricing/visibility authority.

## REQUIRED OWNER DECISION

The following policy decisions should be explicitly approved before Task 1.3
implementation starts:

1. Approve the proposed `multi_select` constraints, including the strict
   `required`/`minSelections` relationship.
2. Approve that an empty optional multi-select is valid only when
   `minSelections=0`, and that a non-empty optional selection is still
   considered present for C03.
3. Approve immediate server normalization of `choiceIds` into authoritative
   choice-position order.
4. Approve that a Cart whose configuration revision becomes stale after a
   choice is deactivated is rejected/review-required and is never silently
   pruned, rebound, or revalidated against the new revision.
5. Approve the additive historical snapshot representation described below.
6. Approve a forward-only `0043` function migration if persistent C08
   validation is required. No migration is created by this review.

## C07 REUSE

### Answers to A and B

The exact C07 choice *item* type should be reused, but the exact C07
single-select constraints object cannot be reused unchanged because C08 adds
cardinality fields. The safe generalization is:

- shared `CustomizationChoice` item: `id`, `code`, `label`, `position`,
  `isActive`;
- `SingleSelectCustomizationFieldConstraints`: shared `choices` plus
  `helpText`;
- `MultiSelectCustomizationFieldConstraints`: shared `choices`,
  `minSelections`, `maxSelections`, plus optional `helpText`.

This is an authority-preserving type extraction, not a second choice entity.
Existing C07 validation and snapshots must remain behaviorally identical.

### Identity history and Admin

The existing Product/field identity-history map can be reused unchanged in
semantics. The implementation should generalize the current
`materializeSingleSelectConstraints` and `registerChoiceIdentityHistory`
branches to all choice-bearing field kinds, while preserving the same rules:

- an existing ID can retain only its historical code;
- an existing code cannot move to another ID;
- a retired ID/code pair cannot be rebound;
- label, position, and `isActive` may change for the same ID/code pair;
- server allocation remains the only source of stable IDs for new drafts.

The Admin UI should reuse the C07 ordered choice editor and add only
`minSelections` and `maxSelections` controls for C08. It must not create a
parallel multi-select identity editor.

## C03 INTERACTION

`field_present` remains the only C03 interaction:

- zero accepted choice IDs: field is not present; no surcharge allocation;
- one or more accepted choice IDs: field is present; exactly one surcharge
  allocation for that field;
- selection count never multiplies the surcharge;
- no per-choice, `selection_value`, quantity, percentage, or browser amount
  pricing is introduced.

The TypeScript change required later is to generalize `valueIsPresent` so a
valid `multi_select` value is present when `choiceIds.length > 0`. The
allocation loop remains one allocation per `field_present` rule.

The persistent SQL equivalent must apply the same rule. C08 does not modify
C03 semantics.

## ORDERING SEMANTICS

### Answers to C, D, and E

`choiceIds: string[]` is the minimum safe browser shape, provided the server
requires an exact value object and validates every ID against the current
Product-owned field.

Canonical ordering must happen immediately at the server acceptance boundary,
where the current authoritative field and choices are available. A pure value
parser without configuration cannot sort safely. The accepted handoff and
Cart value should therefore contain `choiceIds` sorted by authoritative
`choice.position`, with a deterministic ID tie-breaker only as a defensive
fallback; duplicate authoritative positions remain invalid configuration and
must never be accepted as a tie-breakable authority.

The browser's original order is not business data. Cart persists the canonical
sorted order. Checkout compares that canonical value. Order persists the same
canonical order in its immutable purchase facts.

## CARDINALITY SEMANTICS

### Answers to I and J

At configuration publication:

- validate `minSelections` and `maxSelections` as bounded integers;
- enforce `minSelections <= maxSelections`;
- enforce the `required` relationship;
- enforce `maxSelections <= activeChoiceCount` for an active field;
- enforce `activeChoiceCount >= minSelections` for an active field.

At customer acceptance:

- reject non-array `choiceIds`;
- reject duplicates without deduplication;
- reject unknown, cross-field, cross-Product, or inactive choices;
- reject counts below the effective minimum or above `maxSelections`;
- return canonical position order;
- reject stale configuration revisions.

### Answer to K: later choice deactivation

A previously accepted Cart is not silently repaired when a choice is retired.
The current configuration revision changes, so the Cart/Checkout acceptance
boundary returns a stale or unavailable result and requires the customer to
reselect against the current configuration. It must not remove one choice,
rebind its ID, keep the old revision as current, or reduce the selected count
behind the customer's back.

Historical Orders remain readable from their immutable snapshot and retain the
retired choice facts.

## BROWSER VALUE / PDP / DRAFT

### Answers to C and PDP requirements

The PDP should render active choices only, in authoritative position order,
using a labeled checkbox group. It may show selected count and min/max/help
text, but disabled controls are only presentation. The draft remains local
editing state; final readiness and server acceptance enforce the rules.

The reducer should add one `set_multi_select_value` path and preserve the
minimal value shape. Deselecting is allowed while editing. It must not change
Variant, SKU, Product Option, or price authority.

The existing summary model can render a multi-select row as a display-only
value containing the selected active labels, while the normalized handoff
continues to contain IDs only.

## ADMIN

The existing Admin boundary already publishes a complete Product-owned field
configuration with expected revision and atomic replacement. C08 should add
only:

- the `multi_select` field kind;
- shared choice editor support;
- bounded `minSelections` and `maxSelections` controls;
- publication validation for active-choice cardinality and requiredness.

H03 remains separate and is not completed by this work.

## CART / CHECKOUT

### Answer to F

The existing JSON Cart and immutable Order snapshot boundaries can carry C08
without new tables or columns. The accepted Cart item should retain:

- Product and Variant/SKU facts from existing Catalog authority;
- configuration revision;
- normalized `multi_select` value with canonical `choiceIds`;
- C03 pricing snapshot with at most one field-present allocation.

Checkout must revalidate the same current configuration, choice lifecycle,
cardinality, and pricing revision. It must never trust a browser-selected
order or surcharge amount.

## ORDER SNAPSHOT

### Answers to G and H

Each selected choice requires detached immutable facts:

```ts
{
  choiceId,
  choiceCode,
  choiceLabel,
  choicePosition
}
```

The multi-select field snapshot must also retain:

- `fieldId`;
- `fieldCode`;
- `fieldLabel`;
- `kind: "multi_select"`;
- configuration revision;
- canonical selected `choiceIds`;
- the ordered selected-choice facts above.

The existing C07 detached fact structure can be generalized internally to a
shared `CustomizationChoiceFact`. To avoid changing accepted C07 semantics
unnecessarily, retain the current C07 projection and add an additive C08
multi-select fact shape, for example `multiSelectChoiceFacts` with one entry
per field and an ordered `selectedChoices` array. No historical read may
resolve labels or positions from the current Catalog.

## SCHEMA CONSEQUENCE

### Answer to M and N: `0043 REQUIRED` for persistent C08

No new table or column is proven necessary. A forward migration is nevertheless
required if C08 is admitted by the persistent Cart/Order authority, because
the applied SQL contains C07-specific kind branches:

1. `local_commerce.compute_customization_pricing(text,jsonb)` in the C03
   authority rejects field kinds outside `image`, `short_text`, and
   `long_text`; 0042 adds `single_select` but not `multi_select`. Its forward
   replacement must validate the exact C08 value, canonical active choices,
   cardinality, and `field_present` presence semantics.
2. `local_commerce.snapshot_single_select_facts(jsonb,jsonb)` in 0042
   explicitly handles only `single_select` and passes other values through.
   Its forward replacement must validate and detach ordered C08 selected-choice
   facts while preserving the accepted C07 result.
3. `local_commerce.cart_command` calls the pricing function, so the pricing
   forward replacement covers persistent Cart admission.
4. `local_commerce.order_commit` calls the pricing function and the snapshot
   helper. If the helper signature is preserved, `order_commit` need not be
   replaced; if the helper is renamed, `order_commit` must receive a matching
   forward replacement.

The minimum 0043 scope is therefore forward replacement of the existing
server-owned function logic, not new business tables, public seed endpoints,
or a second Cart/Order authority. This review creates no 0043.

## IMPLEMENTATION CONSEQUENCE

If the owner approves this policy, Task 1.3 should proceed in this order:

1. extract the shared `CustomizationChoice` type and choice parser without
   weakening C07;
2. add bounded multi-select constraints and exact `choiceIds` parsing;
3. add configuration-aware canonical normalization and validation;
4. generalize Admin identity history and reuse the C07 choice editor;
5. add PDP checkbox rendering and draft/summary support;
6. extend C03 field-presence pricing once per field;
7. extend Cart/Checkout acceptance and immutable Order detached facts;
8. create and validate ordered migration 0043 only after rollback-only and
   security checks prove it is required;
9. run disposable real DB evidence for active-only projection, cardinality,
   canonical ordering, stale choice rejection, C03 one-allocation pricing,
   Cart/Checkout, and immutable Order facts.

## AUTHORITY SEPARATION / RISK REVIEW

C08 choices must never enter:

- `selectedOptions`;
- Product Option or Variant selection;
- SKU identity or SKU pricing;
- Supplier specification mapping;
- `selectedSpecificationKey`;
- browser-authored surcharge or price facts.

The main implementation risks are stale Cart values after choice retirement,
duplicate or non-canonical choice ordering, accidental per-choice surcharge,
and SQL validation that accepts a value the TypeScript boundary rejects. These
are acceptance-test requirements, not reasons to add a second authority.

## DEPENDENCIES

- C09: independent; no numeric-field semantics are needed for C08.
- C10: independent; no generic-file semantics are needed for C08.
- C28: later conditional-required logic may raise effective requiredness but
  must not alter C08 base cardinality or introduce C08 conditional predicates.
- C29: independent later visibility authority; hidden values must not bypass
  C08 validation when that task is implemented.
- H03: separate Admin persistence scope; C08 must use the existing Admin
  boundary and does not mark H03 complete.

## OpenSpec

- Task 1.3 remains `[ ]`.
- Tasks 1.4–1.9 remain `[ ]`.
- No task checkbox was changed by this review.
- No migration was created or executed.

## Git / Safety

- Application changes: none.
- Test changes: none.
- Migration changes: none.
- Remote Supabase/provider access: none.
- Deployment: none.
- Main branch: unchanged.
- This artifact is documentation-only.

## Recommendation

**READY FOR OWNER C08 POLICY APPROVAL**

The proposed policy is compatible with the existing C07 authority and JSON
snapshot boundaries. Approval is still required for the explicit cardinality,
stale-Cart, historical-fact, and 0043 forward-function decisions above before
implementation begins.
