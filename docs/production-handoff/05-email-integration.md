# 05 — Transactional email integration

Overall status: **PRODUCTION INTEGRATION REQUIRED**.

Provider target: Resend or a separately approved transactional provider.
No production email was sent or configured by the local commerce change.

## Delivery architecture

- Canonical commerce transaction commits first with a durable event/outbox or
  approved cross-store publish-intent contract.
- A separate dispatcher sends an immutable, versioned message payload.
- Provider acceptance, provider delivery and observed inbox receipt are three
  distinct facts.
- Email failure must not roll back an already committed Order, Payment,
  Fulfillment, Shipment or digital-delivery transaction unless a future
  explicitly approved contract requires it.
- Provider timeout/unknown must reuse the original send key inside the approved
  retention window; it must not blindly send with a new key.

## Required message map

| Message | Classification | Canonical trigger |
| --- | --- | --- |
| Authentication OTP | PRODUCTION INTEGRATION REQUIRED | Supabase Auth SMTP only; never application commerce outbox. |
| Order created | PRODUCTION INTEGRATION REQUIRED | Canonical committed Order event. |
| Payment success | PRODUCTION INTEGRATION REQUIRED | Canonical paid transition after provider verification. |
| Photo/action required | PRODUCTION INTEGRATION REQUIRED | Committed review/information-required decision. |
| Photo re-upload required | PRODUCTION INTEGRATION REQUIRED | Committed review rejection/re-upload request. |
| Preview ready | PRODUCTION INTEGRATION REQUIRED | Complete current immutable preview manifest published. |
| Preview revision fulfilled/unfulfilled | PRODUCTION INTEGRATION REQUIRED | Committed operator outcome for the customer request. |
| Production started | PRODUCTION INTEGRATION REQUIRED | Canonical independent start-production transition. |
| Shipment created/shipped | PRODUCTION INTEGRATION REQUIRED | Canonical Shipment/event transition. |
| Tracking update | PRODUCTION INTEGRATION REQUIRED | New normalized canonical tracking event version. |
| Digital delivery ready | PRODUCTION INTEGRATION REQUIRED | Paid eligible item with immutable ready version and grant policy. |
| Exception/manual contact | PRODUCTION INTEGRATION REQUIRED | Explicit committed exception/manual-contact event. |

Marketing automation, abandoned-cart recovery and review invitations are
**SECOND PHASE** unless separately promoted into MVP scope.

## Content and security requirements

- HTML and plain-text equivalents for every message.
- Escape all customer and business content; prevent CRLF/header injection.
- Never include raw session tokens, Order capability, guest secrets, OTP values
  in logs, Storage locators, private object URLs or direct download tickets.
- Customer links must target approved protected HTTPS pages; a click must not
  mutate lifecycle or consume a download quota.
- Freeze recipient, template version, safe payload/hash and send key at intent
  creation so retries do not drift with later email/template changes.
- Bounce/complaint suppression must be durable and rechecked before retry.

## Provider configuration

Classification: **BUSINESS CONFIGURATION REQUIRED** and **PRODUCTION
INTEGRATION REQUIRED**.

- Approved sending domain and DNS records.
- Approved From/Reply-To identities.
- Provider API key and webhook/Svix secret.
- Callback URL, event allowlist and retry policy.
- Test-recipient allowlist and explicit send authorization.
- Legal footer, support contact and localization policy.
- Retention, suppression and operator-review policy.

## Acceptance checklist

- [ ] Every required trigger maps to exactly one durable message intent.
- [ ] Duplicate producer/provider events do not duplicate messages.
- [ ] Two dispatch workers honor leases/fencing.
- [ ] Timeout and crash preserve original payload/key and truthful unknown state.
- [ ] Signed provider callbacks correlate accepted/delivered/bounced/complained.
- [ ] Hard bounce and complaint suppress later sends until audited resolution.
- [ ] Real authorized mailbox test distinguishes accepted, delivered and observed.
- [ ] No committed commerce state is rolled back because email delivery failed.
