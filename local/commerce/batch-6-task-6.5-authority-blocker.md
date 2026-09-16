# Task 6.5 — historical preview authority gap

Status: BLOCKED / unchecked. Progress remains 37/85 after independent Task 6.4 PASS. No 6.6, 6.7 or Task 7 implementation started.

## Required fact

The change's local-configured-item-read-authority spec, `Immutable configured-item snapshot`, requires persisted accepted fulfillment configuration and whether each item requires a production preview. Historical reads may not reconstruct missing facts from current Catalog or supplier state. The local-order-runtime spec likewise requires purchased fulfillment/preview rules to survive restart.

## Actual evidence

- `app/domain/catalog/fulfillment.ts`: ProductFulfillmentConfig and its strict parser accept id, productId, fulfillmentType, requiresShipping, productionMode and leadTime. There is no production-preview requirement field; adding one ad hoc would be rejected by the existing parser.
- `app/application/local-order-purchase-facts.server.ts`: persists that fulfillment configuration and the accepted customization definition/values, but captures no separate preview policy.
- Applied immutable `0014_local-commerce-order-commit.sql`: writes the prepared fulfillment into item customization_facts, with no independent preview policy capture.
- Read-only exact run-5576dfd8/project-marker verified DB inspection of newly created synthetic reference `FM-LOCAL-803B5B889344417A` found two immutable item snapshots. Both fulfillment objects have exactly `fulfillmentType,id,leadTime,productId,productionMode,requiresShipping`; their configuration roots have `configurationRevision,fields,productId`. This is current DB evidence, not an inferred fixture outcome.

Neither shipping classification, image presence nor production mode proves the missing preview decision. The reader cannot default it to true/false or copy a later configuration into an old purchase.

## Stopped work

A draft read RPC and mapper were started, then withdrawn before use after this gap was found. The draft 0016 was never added to the manifest or applied; no application/HTTP/history adapter change remains. Migrations 0001–0015 and manifest remain unchanged. No existing Order or fixture was repaired.

## Owner decision needed

Specify the upstream, server-owned versioned preview-policy source and its explicit value semantics for new purchases, and approve minimal forward capture at Order creation. Proposed safe legacy behavior: an existing snapshot lacking this required fact remains unavailable for preview-dependent consumers, with no backfill or inferred default. Any SQL change must be a new 0016+ migration after approval; applied migrations and accepted historical evidence remain immutable.

No claim that a newly added reader field can repair already committed purchase history. Do not automatically reopen completed checkboxes or mark 6.5 complete.
