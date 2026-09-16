# 08 — Production analytics integration

Overall status: **PRODUCTION INTEGRATION REQUIRED**.

Targets from the product requirements:

- Google Analytics 4;
- Meta Pixel;
- TikTok Pixel.

The current local analytics behavior is not production analytics acceptance.

## Required funnel events

| Event | Classification | Authoritative source |
| --- | --- | --- |
| `view_item` | PRODUCTION INTEGRATION REQUIRED | Public Catalog Product/SKU projection. |
| `customization_start` | PRODUCTION INTEGRATION REQUIRED | UI interaction with safe Product/configuration identifiers only. |
| `photo_upload` | PRODUCTION INTEGRATION REQUIRED | Server-confirmed accepted receipt, not file-selection intent. |
| `add_to_cart` | PRODUCTION INTEGRATION REQUIRED | Server-accepted Cart line and canonical item facts. |
| `begin_checkout` | PRODUCTION INTEGRATION REQUIRED | Fresh server Checkout evaluation. |
| `purchase` | PRODUCTION INTEGRATION REQUIRED | Canonical server-confirmed paid Order, never browser success redirect/totals. |
| `preview_revision_requested` | PRODUCTION INTEGRATION REQUIRED | Committed current-manifest customer revision decision. |
| `upload_error` | PRODUCTION INTEGRATION REQUIRED | Bounded server/client failure category without private media or raw errors. |
| `payment_error` | PRODUCTION INTEGRATION REQUIRED | Safe canonical/provider reconciliation category, no secrets or raw provider payload. |

## Data governance

- Consent mode/banner, jurisdiction policy and tag firing rules:
  **NEEDS PROVIDER DECISION**.
- Advertising identifiers, cross-border transfer, retention and deletion:
  **NEEDS PROVIDER DECISION**.
- Never send customer photos, crop data, private URLs, Order capability, session
  values, full address/email or free-text customization to analytics.
- Use stable safe event IDs to deduplicate browser/server purchase events.
- Currency and amount must use canonical server Order/Payment facts.
- Define development/staging filters so synthetic acceptance traffic does not
  pollute production metrics.

## Configuration inventory

Classification: **BUSINESS CONFIGURATION REQUIRED**.

- GA4 property/measurement ID and server-side strategy if used.
- Meta Business/Pixels dataset ID and domain verification.
- TikTok Pixel ID/events API decision.
- Consent-management platform and policy owner.
- Event naming/versioning, attribution windows and reporting ownership.
- Error monitoring/alert destination distinct from marketing analytics.

## Acceptance checklist

- [ ] Consent state gates every applicable tag/provider call.
- [ ] Test traffic is isolated from production reporting.
- [ ] One canonical purchase event per paid Order despite retries/webhooks.
- [ ] Amount/currency match server-confirmed Payment/Order facts.
- [ ] No private media, credentials, PII or unrestricted free text leaves the app.
- [ ] Browser blocker/provider outage cannot alter commerce success.
- [ ] GA4/Meta/TikTok debug tools show expected safe event payloads.
