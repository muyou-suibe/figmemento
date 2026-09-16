# Catalog Business Decision Handoff

## WAITING FOR BUSINESS OWNER

Unresolved:

- physical weights: 19
- min lead times: 22
- max lead times: 22
- total: 63

Current status:

- C1 progress: 41/61
- Task 3.5: **BLOCKED / awaiting business input**
- BACKFILL AUTHORIZED: **NO**

## Purpose

This handoff is the single input worksheet for the future business owner, supplier owner, or project liaison who will approve the remaining Task 3.5 catalog data. It does not replace or modify the approved Product mapping.

Authoritative supporting records:

- `docs/catalog-product-preflight.md` — active Product mapping and fixed default Variant identities
- `docs/catalog-product-preflight-exceptions.md` — unresolved decision register
- `docs/catalog-schema-baseline.md` — read-only remote schema baseline

No guarded backfill may be created or authorized from this worksheet until every unresolved field has approved evidence and the active preflight has been reviewed accordingly.

## Already approved — do not reopen

The following are already fixed in the active preflight and require no further discussion in this handoff:

- all 22 Product identities
- all 22 Product slugs
- authoritative legacy prices
- USD currency
- Category assignments
- `fulfillment_type`
- `requires_shipping`
- `production_mode`
- approved SKU codes
- fixed default Variant UUIDs
- default Variant compatibility behavior
- `selectedOptions = []`
- `weight_grams = 0` for the three digital Products

The approved mappings must not be replaced, regenerated, inferred from development fixtures, or otherwise changed while completing this worksheet.

## Decisions still required

| Required decision | Unresolved count | Required authority |
|---|---:|---|
| Physical packaged `weight_grams` | 19 | Business owner or supplier/fulfillment owner with evidence |
| `min_lead_time_business_days` | 22 | Business owner or authorized production owner |
| `max_lead_time_business_days` | 22 | Business owner or authorized production owner |
| **Total unresolved cells** | **63** | — |

Products fully ready for guarded backfill: **0/22**.

## Field definitions

### `weight_grams`

The packaged weight used for logistics and shipping calculation. It is the weight of the Product in its shipping-ready packaging, not an estimate of the bare Product.

### `min_lead_time_business_days`

The shortest normal number of business days from the point at which an order is ready to enter production until production is complete.

### `max_lead_time_business_days`

The longest production period, in business days, promised under normal business conditions. It does not include international shipping or delivery transit time.

## Approval and evidence rules

- Development fixture values are not acceptable as production evidence.
- AI or Codex guesses are not acceptable.
- General “industry approximate values” are not acceptable.
- Product weight must be packaged/shipping weight, not bare-product weight.
- Lead time means production duration and excludes international logistics transit time.
- A Category-level lead-time policy may be approved only through an explicit decision by an authorized business owner.
- If a Category-level policy is approved, its values and evidence must still be expanded and recorded separately for every Product below.
- Evidence should identify a verifiable source, such as a supplier specification, measured packaged sample, approved production SLA, or signed business decision.
- `approved_by` must identify the accountable human approver; `approval_date` should use `YYYY-MM-DD`.
- Leave a field blank when evidence or approval is unavailable. Do not substitute an inferred value.

## Decision worksheet by Category

### 3D Figures — physical Products

```text
Product: bobblehead — Custom Bobblehead
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: brick-person — Photo Brick Figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: couple-figure — Custom Couple Figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: figurine-keychain — 3D Printed Figurine Keychain
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: pixel-cube — Custom Pixel Photo Cube
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: solo-figure — Photo to Mini Figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:
```

### Custom Crafts — physical Products

```text
Product: crystal-frame — Crystal Photo Frame
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: custom-pillow — Custom Photo Pillow
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: custom-puzzle — Custom Photo Puzzle
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: fridge-magnet — Custom Fridge Magnet
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: glass-light-picture — Custom Glass Light Picture
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: herbal-tattoo — Herbal Temporary Tattoo Set
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: leaf-engraving — Leaf Engraved Picture
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: phone-case — Custom Phone Case
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: temporary-tattoo — Custom Temporary Tattoos
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: wood-engraving — Custom Wood Engraving
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:
```

### Pet Memories — physical Products

```text
Product: pet-figure — Pet Portrait Figurine
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: pet-memorial — Always With You Portrait
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: pet-portrait — Custom Pet Portrait
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:
```

### Digital Gifts — digital Products

The approved packaged-weight value for each Product in this Category remains `weight_grams = 0`; only production lead times require approval.

```text
Product: ai-oil-portrait — AI Oil Painting Portrait
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: digital-portrait — AI Illustrated Portrait
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:

Product: digital-wallpaper — Digital Wallpaper Illustration
min_lead_time_business_days:
max_lead_time_business_days:
evidence/source:
approved_by:
approval_date:
```

## Completion gate

Task 3.5 must remain blocked until all 63 unresolved cells have evidence-backed human approval and the values have been reconciled into the active Product preflight without changing any existing approved mapping.

Completion of this worksheet alone does not authorize backfill, migration creation, migration execution, or continuation to Tasks 3.6–3.8 or 7.4.
