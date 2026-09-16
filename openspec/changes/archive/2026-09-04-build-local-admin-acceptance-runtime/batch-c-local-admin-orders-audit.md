# Batch C — Local Admin Orders Audit

## Scope

Tasks 3.1–3.4 establish a provider-neutral, read-only Admin Orders seam for
the later route-integration task. The real `/admin/orders` page and export
route remain on their existing production composition until Task 4.4.

## Contract

- `AdminOrdersReadRepository` exposes only normalized filtered reads and a
  safe export projection; it has no mutation method.
- Query semantics match the current page boundary: trimmed search text capped
  at 80 characters, the same bounded `(),.%`-to-space search normalization,
  exact fulfillment/payment filters, `attention=1` only, positive page
  numbers, and a fixed page size of 20. Attention filtering is authoritative
  from `awaiting_review`, `quality_check`, and `issue` fulfillment states.
- Search matches only the order reference and synthetic customer email, as on
  the real page; customer display name is not an additional search authority.
- A successful empty result is distinct from `unavailable` and
  `source_failure`.
- The export projection contains only display-safe order facts and prefixes
  spreadsheet-formula-leading text with an apostrophe. It is not a replacement
  for the existing CSV route.

## Fixture and privacy boundary

The fixture set contains 24 deterministic `LOCAL / TEST ONLY` orders with
synthetic `@example.test` identities, fixed timestamps, long reference/content,
paid/unpaid/failed payment states, multiple fulfillment/tracking states,
physical/digital line items, attention cases, and injectable empty/error
outcomes. It contains no real PII, provider identifiers, private photo
locator, storage key, digital-delivery file, or payment secret.

Photo-shaped presentation uses only `previewAvailable=false` and
`localSyntheticAsset=true`; no binary asset, signed URL, Storage client, or
provider choice is introduced.

## Control disposition

Order/payment state is display-only. Fulfillment, photo review, and tracking
controls are disabled in local mode. Digital delivery and upload cleanup are
bounded unavailable. No local Order, Payment, Fulfillment, or Tracking
mutation is implemented and no success response is fabricated.

## Verification

`tests/local-admin-orders.test.mjs` covers the read contract, deterministic
fixture matrix, pagination/filtering, long content, safe empty/error states,
private-locator/provider isolation, safe export projection, and all local
control dispositions. No real Admin route is rewired in Batch C.
