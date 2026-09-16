# 06 — Shipping rates and tracking integration

Overall status: **PRODUCTION INTEGRATION REQUIRED**.

Shipping-price authority and tracking-provider integration are separate.
17TRACK is a tracking integration target; it is not a shipping-rate quotation
authority.

## Current local capabilities

| Capability | Classification | Current boundary |
| --- | --- | --- |
| Shipping calculation | LOCAL CORE COMPLETE | Bounded local rules validate destination eligibility, method, amount/currency, version and display range. |
| Physical/digital split | LOCAL CORE COMPLETE | Digital-only shipping contribution is zero; mixed Orders validate the physical branch. |
| Shipment lifecycle | LOCAL CORE COMPLETE | Unique Shipment and ordered `shipment_created → shipped → in_transit → delivered` events. |
| Customer tracking read | LOCAL CORE COMPLETE | Original customer authority, non-enumerating safe projection. |
| Carrier/tracking data | LOCAL SIMULATION ONLY | Allowlisted local carrier fixture and server-generated local tracking number. |
| Real carrier/rate integration | PRODUCTION INTEGRATION REQUIRED | No real quotation, label or carrier API exists. |
| 17TRACK | PRODUCTION INTEGRATION REQUIRED | No production account/key/webhook/polling integration exists. |

## Shipping price production work

- Define launch countries, exclusions and postal/region rules.
- Define methods, currencies, service levels, weight/quantity/product-type rules
  and free-shipping thresholds.
- Decide whether rates remain business-configured or use a rate provider.
- Version all rules used for Checkout and retain the accepted version/facts in
  immutable Order snapshots.
- Display estimated ranges as ranges, not guaranteed arrival dates.
- Keep tax separately unactivated until a tax contract is approved.

Classification: **BUSINESS CONFIGURATION REQUIRED** plus **PRODUCTION
INTEGRATION REQUIRED**.

## Tracking production work

- Provision provider account/key and approved endpoints.
- Define canonical carrier-code mapping.
- Choose polling, webhook or hybrid ingestion.
- Verify provider signatures/authentication where supported.
- Map provider statuses/events into the existing canonical Shipment/Tracking
  commands; never direct-write lifecycle rows.
- Define retry, rate-limit, duplicate, out-of-order and reconciliation behavior.
- Define exception/manual-contact policy and monitoring.
- Preserve local/manual tracking only as an explicitly approved bounded fallback.

## Gate preservation

Creating/dispatching a physical Shipment still requires canonical paid state,
applicable review/preview approval and quality check. Tracking-provider events
must not create an Order, mark payment, bypass production/QC, create duplicate
Shipments or alter digital delivery.

## Acceptance checklist

- [ ] Shipping rule fixtures match approved country/method/weight/threshold facts.
- [ ] Checkout and immutable Order allocation use the same server-owned rule version.
- [ ] Real provider test tracking ID maps to the correct carrier and Shipment.
- [ ] Duplicate/out-of-order events remain monotonic and idempotent.
- [ ] Cross-user, tracking-number-only and public-reference-only reads are denied.
- [ ] Provider outage leaves safe stale/unavailable status without invented events.
- [ ] Manual fallback, if approved, is audited and cannot bypass Shipment gates.
