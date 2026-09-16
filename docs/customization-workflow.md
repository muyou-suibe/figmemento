# PhotoGift Customization Workflow Contracts

## 1. Status and scope

This document describes what Customization means in the current codebase. It
documents implemented contracts and boundaries; it does not activate
production checkout, choose a storage provider, or replace the OpenSpec
requirements.

Current status:

- Customization progress: **54/70** before Task 10.1 completion.
- Tasks 7.1–7.9, 8.1–8.4, and 9.1–9.5 are complete.
- Task 8.5 is **BLOCKED** by the C1 / Phase C ordered dependency.
- Tasks 8.6 and 8.7 are not started.
- C1 remains **41/61**; C1 Task 3.5 remains blocked.
- **BACKFILL AUTHORIZED: NO**.
- The Production Customer Upload Provider remains **UNRESOLVED / STOPPED**.
- Normalized checkout is structurally understood but runtime-disabled with a
  fail-closed `503` response.

The current implementation is classified below as **Implemented**, **Local /
Provider-neutral**, **Legacy compatibility**, **Blocked**, or **Deferred**.

Related source documents:

- [Customization OpenSpec design](../openspec/changes/build-product-customization-workflow/design.md)
- [Customization workflow specification](../openspec/changes/build-product-customization-workflow/specs/product-customization-workflow/spec.md)
- [Private customer upload specification](../openspec/changes/build-product-customization-workflow/specs/private-customer-uploads/spec.md)
- [Customer-upload production provider handoff](customer-upload-production-provider-handoff.md)
- [Local catalog Demo runbook](local-demo.md)

## 2. Core terminology

**Variant/SKU** is catalog commerce authority: which purchasable catalog
combination is selected and what its base commercial and fulfillment facts are.

**CustomizationField** is Product-owned configuration describing one approved
customer input, such as an image, short text, or long text field.

**CustomizationValue** is one customer's submitted value for one active field.

**ProductCustomizationDraft** is browser-local working state while the shopper
is editing a Product configuration.

**ConfiguredItemHandoff** is a normalized structured candidate, or a canonical
server-accepted handoff after revalidation. It is not by itself a cart line,
order row, payment authorization, or durable order snapshot.

## 3. CustomizationField contract

The implemented provider-neutral field contract is Product-owned and contains:

- stable field identity (`id`);
- owning Product identity (`productId`);
- Product-scoped `code`;
- customer-facing `label`;
- `kind`: `image`, `short_text`, or `long_text`;
- `required`;
- `isActive`;
- deterministic non-negative `position`;
- non-blank `configurationRevision`;
- a strict kind-specific `constraints` object.

Current field definitions are parsed strictly. Product ownership, field
identity, code, revision, duplicate IDs/codes/positions, active state, and
field kind are validated before a configuration is treated as current.
Public configuration is position ordered and contains active fields only;
administrator reads may retain inactive definitions for explicit reactivation.

Production field configuration is expected to come from the authoritative
server repository. The server source-selection boundary uses the Supabase-
shaped repository for normal production source selection and permits the
development repository only through the explicit fixture branch. It does not
infer fields from Product names, slugs, legacy `customization_schema`, seed
examples, or development fixtures in production.

### Current constraints

For `short_text` and `long_text`:

- positive bounded `maxLength`;
- optional non-blank `helpText`.

For `image`:

- allowed MIME types limited to JPEG, PNG, and WebP;
- positive `maxBytes`;
- positive minimum dimensions;
- optional recommended dimensions that cannot be below the minimum;
- non-negative `minImageCount` and positive `maxImageCount`;
- `cropEnabled`.

Pricing formulas, surcharges, arbitrary conditions, AI instructions, supplier
rules, routing rules, and production-preview settings are not field
constraints. Unknown properties fail parsing rather than surviving as hidden
metadata.

## 4. CustomizationValue contract

The implemented normalized value union is:

- `short_text`: `fieldId`, `fieldCode`, `kind`, and a string `value`;
- `long_text`: the same shape with `kind: "long_text"`;
- `image`: `fieldId`, `fieldCode`, `kind: "image"`, and an ordered `images`
  array.

Each image entry contains an opaque `receiptId` and may contain normalized crop
metadata. It does not contain or accept as authority:

- `storageKey`, bucket, provider object path, or object key;
- permanent public URL or signed provider URL;
- provider credentials or storage configuration.

Image order is meaningful within the field and is preserved through the
normalized handoff and the Task 8.3 compatibility projection. A field value
cannot be duplicated in one value collection; unknown fields, duplicate image
receipts, incompatible kinds, cross-Product fields, inactive fields, stale
revisions, missing required values, and out-of-bounds metadata fail strict
parsing or authoritative validation.

## 5. Crop terminology

Crop is implemented as normalized, non-destructive customer-input metadata:

```text
x, y, width, height
```

All coordinates are finite and normalized to the image bounds. Crop metadata
does not mean that image bytes were edited, a derivative was rendered, or that
production framing is guaranteed. It does not create a manufacturing preview
or production artwork approval.

## 6. ProductCustomizationDraft contract

`ProductCustomizationDraft` is a Product-scoped, configuration-revision-
scoped, browser-local working state. Switching Product requires a new draft;
the reducer does not carry values across Products.

The current draft contains:

- Product identity and configuration revision;
- separately selected Variant/SKU identity (`variantId`, `skuCode`);
- selected Variant Option values;
- normalized text/image values;
- browser-safe copies of accepted receipt metadata for local evaluation;
- active upload operation state;
- upload-failure and owner-expired signals.

It is not database persistence, server authority, cart persistence, an order
snapshot, or ownership proof. It does not expose a generic status setter. The
reducer accepts explicit local actions and has no persistence or network
dependency.

### Derived draft lifecycle

The evaluator derives one of:

```text
empty | editing | upload_pending | ready | invalid | expired
```

The result is derived from the current Product/configuration authority,
selected eligible Variant/SKU and Options, required-field completeness,
normalized values, receipt metadata/lifecycle, active upload operations, and
stale/expired signals. A browser cannot make an invalid draft authoritative by
setting `ready = true`.

`ready` means only locally eligible for the next handoff step. It does not mean
server accepted, paid, persisted, or ready for production.

## 7. Configured-empty versus not_configured

These states are intentionally different:

- **not_configured**: no authoritative customization configuration exists for
  the Product. The public detail composition represents this as
  `{ status: "not_configured" }`.
- **configured-empty**: an authoritative configuration exists, has a valid
  current `configurationRevision`, and contains `fields: []`.

Configured-empty may produce `customizationValues: []` when the authoritative
Product, Variant, and Option requirements are otherwise satisfied. It must not
be silently collapsed into `not_configured`, a fixture configuration, or a
permissive fallback after source failure.

An invalid configuration or source failure remains a fail-closed error state;
it is not treated as configured-empty.

## 8. Variant/SKU and Customization separation

Variant/SKU owns:

- Product/Variant identity;
- SKU code;
- selected Product Options and their combination;
- base price and currency;
- weight;
- availability;
- `supplyMethod`.

Customization owns Product-specific customer input only, such as a photo, name,
message, or other value represented by an approved field.

Customization MUST NOT determine or mutate Variant identity, SKU code, base
price, currency, weight, availability, or `supplyMethod`. Product Options are
SKU-defining choices; CustomizationFields are not Product Options. A photo,
name, note, pose text, or other free text must never be converted into an
OptionValue.

The current Product detail parent composes the existing Variant selector with a
sibling customization form. Selecting a Variant does not rewrite customer
values, and customer values do not participate in Variant resolution.

## 9. Browser responsibilities

Browser code may:

- render the current field definitions supplied by the Product detail read;
- collect text and image input;
- maintain the local draft;
- provide prompt client-side validation and image preflight;
- show upload progress and failure feedback;
- show the shopper's own customer-input preview;
- hold opaque receipt IDs and safe receipt metadata returned by the server;
- compose a candidate configured-item handoff;
- show a locally-ready state that explicitly requires server verification.

The browser is not authoritative for:

- Product publication or current eligibility;
- Variant/SKU availability, price, currency, or fulfillment facts;
- field configuration freshness;
- receipt ownership, lifecycle, or authoritative metadata;
- storage-provider locators;
- order acceptance or payment state.

Text edits and Variant changes remain local; they do not write a database per
keystroke. Explicit upload is the boundary that may cross to a server upload
route, subject to the current provider/source stop gates.

## 10. Server responsibilities

Before accepting a configured item, Task 8.1 server logic re-resolves:

- Product identity and public eligibility;
- Variant/SKU and selected Options;
- current Product-owned CustomizationField configuration;
- configuration revision;
- owned active receipts;
- authoritative receipt metadata and expiry.

It rejects malformed, stale, unavailable, cross-Product, mismatched, or
browser-authoritative input with bounded safe reasons. It then emits a new
canonical accepted handoff whose Product, Variant, Option, configuration, and
ordered value data came from the server-side checks.

**Browser locally-ready != server accepted.** A locally-ready candidate still
requires server revalidation. A server-accepted handoff is still not a durable
order snapshot, cart line, payment authorization, or receipt attachment.

## 11. Customer-input preview terminology

The canonical term is **Customer input preview**. It previews the shopper's
selected or uploaded input using temporary browser-local or authorized private
preview behavior.

It is not:

- a production preview;
- a product mockup;
- a manufacturing proof;
- final artwork approval;
- a supplier proof;
- a guarantee of production framing.

The current UI wording, “Customer input preview — this is not a production
mockup,” is aligned with this boundary. Task 10.2 owns the detailed private
upload trust model, ownership, lifecycle, cleanup, retention, and preview
access documentation.

## 12. Configured-item handoff

The current structural `ConfiguredItemHandoff` contains:

- Product identity;
- Variant identity;
- SKU code;
- selected Variant Options;
- `configurationRevision`;
- ordered `customizationValues`.

Image values carry opaque `receiptId` values and optional crop metadata. The
structural parser proves only that the payload has the approved shape. The
Task 8.1 acceptance service additionally proves current server authority for
the Product, Variant, configuration, and owned receipts before returning a
canonical accepted handoff.

Neither form of handoff proves by itself:

- current authority unless the server acceptance path has run;
- price/currency authority inside the payload;
- cart identity or merge behavior;
- order persistence;
- payment success;
- durable receipt attachment;
- production readiness.

## 13. Same-SKU copy semantics

Two configured items may share Product, Variant, SKU, and selected Options while
having different customer content. They remain two ordered payloads. Even two
identical payload entries remain two entries until a separately approved cart
identity/merge contract changes that behavior.

The current copy sequence deliberately has no fingerprint, merge key, hash,
quantity aggregation, or cart-line identity. It only clones and preserves
ordered structure.

## 14. Order compatibility boundary

Task 8.3 maps an accepted normalized handoff into an isolated compatibility
projection with two parts:

- `customerInput`: configuration revision and normalized values;
- `uploadReferences`: `fieldId`, `fieldCode`, image position, opaque
  `receiptId`, and optional crop metadata.

This projection is provider-neutral and performs no persistence or receipt
attachment. It does not convert a receipt ID into a storage path.

Operational concepts remain outside normalized customer input, including
`photoReviewStatus`, digital-delivery values, payment status, and fulfillment
status.

## 15. Legacy compatibility boundary

The existing legacy order boundary remains separate from the normalized model.
Historical/current legacy paths use:

- `order_items.customization` for the broad legacy customization JSON;
- `order_uploads` for historical/current legacy order-upload references.

The legacy shape may contain older fields such as `note`, `photoPath`/
`photoPaths`, and `photoMeta`/`photoMetas`, plus operational fields such as
`photoReviewStatus` and digital-delivery values. These are compatibility and
historical-read concepts, not the normalized Product-owned CustomizationField
authority.

**receiptId != storage path.** The normalized mapper does not translate a new
`receiptId` into `photoPath`, `storage_key`, `storageKey`, or an object key.
Legacy path behavior remains compatibility-only behind the existing legacy
boundary.

## 16. Normalized order request and current checkout status

Task 8.4 understands the normalized request family and rejects malformed
normalized payloads before they can downgrade into legacy parsing. It also
rejects mixed normalized and legacy customization authority.

The real normalized checkout is currently disabled. `/api/orders` detects a
normalized customization request and returns:

```text
503 — Personalized checkout is temporarily unavailable.
```

No normalized order, payment, coupon, shipping, or receipt-attachment mutation
is claimed by this workflow.

## 17. Current production STOP gates

Task 8.5 is **not complete**. The missing durable boundary includes:

- attaching each accepted receipt to the resulting OrderItem exactly once;
- an immutable normalized customization snapshot;
- durable field, image-position, and crop association.

The required ordering remains tied to the C1 / Phase C chain. C1 is currently
41/61, C1 Task 3.5 is blocked, and `BACKFILL AUTHORIZED` remains `NO`. The
compatibility projection does not solve durable persistence and does not bypass
C1 order/Variant snapshot work.

Production Customer Upload Provider is **UNRESOLVED / STOPPED**. This document
does not choose Supabase Storage, Cloudflare R2, or S3 and does not define a
bucket, binding, retention period, or deployment secret.

## 18. Future cart/order dependencies

The following work remains outside the completed boundary:

- complete cart-line identity and customized-cart persistence;
- approved merge policy, if any;
- normalized OrderItem receipt attachment and immutable customization snapshot;
- historical-read normalization in Task 8.6;
- the complete guest handoff/order matrix in Task 8.7;
- payment, shipping, and production fulfillment integration.

These are future dependencies, not current completed features.

## 19. Deferred capabilities

The Customization workflow does not implement:

- customization pricing or surcharges;
- advanced conditional fields or arbitrary dependency rules;
- supplier or production-routing semantics;
- AI/image analysis, background removal, face processing, or automated
  moderation;
- production preview, mockup, proof, or approval workflow;
- complete cart identity or merge behavior;
- final production customer-upload storage-provider selection.

## 20. Fixture and data-safety terminology

Development CustomizationField fixtures are explicit, deterministic,
non-production, not business-approved, not supplier data, and not migration
data. They are available only through the explicit development/test fixture
source branch. Production source failure must not fall back to them.

This document invents no production Product field values, supplier-approved
requirements, production dimensions/counts, lead times, retention durations,
credentials, cookies, customer receipt IDs, object paths, or private media URLs.

## 21. Implementation boundary summary

| Area | Current classification |
|---|---|
| Field/value/draft parsers and validators | **Implemented, provider-neutral** |
| Product detail form, summary, Variant sibling composition | **Implemented locally** |
| Local customer-input preview and crop metadata | **Implemented locally, non-production preview** |
| Server handoff revalidation | **Implemented as read-only Task 8.1 acceptance** |
| Task 8.3 compatibility projection | **Implemented, no persistence** |
| Legacy `order_items.customization` / `order_uploads` behavior | **Legacy compatibility** |
| Normalized `/api/orders` persistence/checkout | **Blocked/disabled; 503 fail-closed** |
| OrderItem receipt attachment and immutable normalized snapshot | **Blocked by Task 8.5 / C1 Phase C** |
| Production upload provider and activation | **Unresolved / stopped** |
| Complete cart identity and durable customized cart | **Deferred** |
