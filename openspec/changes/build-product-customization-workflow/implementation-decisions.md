# Customization Implementation Decisions

Status: **APPROVED / LOCKED FOR THIS CHANGE**

This is the implementation contract for Tasks 2.x and later. It records approved decisions and does not expand the change scope.

## Decision table

| Decision | Approved behavior | Explicitly prohibited | Owned future work |
|---|---|---|---|
| Product Option boundary | Product Options and Values define SKU/Variant identity only, such as size, material, or color. | Customer photos, uploads, names, text, notes, pose instructions, and personalization requests must not affect SKU identity, combinations, availability, supply method, weight, currency, or base price. | C1 catalog owns SKU options; later customization work owns customer fields. |
| CustomizationField kinds | Only `image`, `short_text`, and `long_text` are allowed. | No generic file, select, multiselect, numeric, checkbox, arbitrary condition, or rule-expression kind. | Later approved scope may add kinds. |
| Production configuration | Product-specific field/production values require authoritative business approval. Fixtures and legacy seed examples are non-production only. | Do not infer production rules from names, slugs, categories, fixtures, seed SQL, legacy `customization_schema`, demos, or AI/Codex assumptions. | Business owner approval and later production configuration work. |
| Preview terminology | Customer-input preview may show local/uploaded input, ordering, metadata, or non-destructive crop information. | No finished-product mockup, generated rendering, 3D result, AI result, production proof, or production approval workflow. | Production preview is a separate future change. |
| Pricing | C1 Variant/SKU remains authoritative for base price and currency. | No customization price, surcharge, formula, promotion, or browser-supplied pricing authority. | Separate customization-pricing change. |
| Storage provider | Domain and application contracts remain provider-neutral; final provider is undecided. | Do not select Supabase Storage or Cloudflare R2, create production buckets, bind R2, or migrate production files here. | Provider decision and adapter/deployment gate. |
| Cart identity | Preserve structured values so future work can distinguish different customer content for the same Product/SKU. | No fingerprint, hash, merge key, merge algorithm, durable cart persistence, or generalized cart-line identity. | Separate cart/order change. |

## Supporting boundaries

- Customer uploads are private customer content; `ProductAsset` remains public marketing media.
- New browser upload contracts must use opaque, provider-neutral receipt identity rather than bucket or storage paths.
- The broad legacy `Customization` object remains historical/compatibility data; it is not normalized field authority.
- C1 Task 7.4 remains independent and blocked. Customization data must never substitute for immutable Product/SKU order snapshots.
- Production source failure must fail closed and must not promote fixtures or legacy seed examples.

## Implementation checklist

Before implementing any customization feature:

- If it changes SKU identity, stop.
- If it adds an unapproved field kind, stop.
- If it promotes fixture or seed data to production, stop.
- If it claims a production preview, stop.
- If it adds customization pricing, stop.
- If it selects Supabase Storage or R2 as the final provider, stop.
- If it creates complete cart identity, stop.
- If it bypasses C1 Task 7.4, stop.
