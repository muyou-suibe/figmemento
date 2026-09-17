## Why

The accepted Local MVP audit identifies 59 provider-independent engineering gaps that prevent the local product from truthfully reaching its MVP engineering gate. The audit is now frozen, so implementation needs one dependency-ordered, independently testable plan that closes exactly those gaps without activating production providers, inventing owner business facts, or weakening the accepted commerce authority boundaries.

## What Changes

- Establish a ten-phase implementation program covering configuration, customization, photo guidance, provider-neutral payment reliability, promotions, shipping, customer ownership/privacy, Admin operations, messaging/analytics groundwork, and customer-facing SEO/completeness.
- Map every frozen Engineering audit ID to exactly one primary implementation task and focused acceptance evidence; preserve owner-input checkpoints when an Engineering task cannot proceed without a business decision.
- Extend the local persistent domain only through coherent, versioned, server-authoritative boundaries, with ordered migrations beginning at `0038` only when a later implementation task genuinely requires schema changes.
- Preserve current Catalog, Cart CAS, Checkout, immutable Order snapshot, ownership, upload, Payment, Fulfillment, Tracking, Digital Delivery, RLS/RPC, private Storage, idempotency, and audit contracts.
- Require phase gates and a final 59/59 evidence gate, including authorization, persistence/restart, concurrency, replay, rendered/browser, and fault-recovery evidence where applicable.
- Keep all provider adapters, production activation, explicit Phase 2 requirements, Owner Configuration/Policy completion, optional hardening, and non-software KPIs outside this change.

### Scope boundaries

This change implements only the 59 IDs classified as `ENGINEERING` in `docs/local-mvp-gap-audit.md`. An Engineering task may remain blocked by explicitly recorded owner input, but it cannot be removed, reclassified, or silently filled with invented policy. The frozen audit documents remain the traceability authority and are not rewritten by implementation.

## Capabilities

### New Capabilities

- `provider-independent-local-mvp-completion`: Defines the exact 59-gap completion contract, dependency phases, owner-decision gates, preserved authority boundaries, migration discipline, and acceptance evidence required for the Local Engineering Gate to pass.

### Modified Capabilities

None. Existing capability contracts remain authoritative and are composed by the new completion capability rather than rewritten.

## Impact

- Future implementation will affect storefront, account, Admin, domain/application services, local persistence, HTTP boundaries, tests, and documentation associated with the 59 frozen IDs.
- Schema-bearing work may add ordered local-commerce migrations starting at `0038`; migrations `0001`–`0037` remain immutable, and this planning change creates or executes no migration.
- No real Supabase Auth, Stripe, PayPal, Resend, analytics, carrier, hosting, DNS, or production Storage integration is activated.
- Major risks are owner-policy ambiguity, rule-version drift, cross-owner authorization regressions, browser-authored commercial facts, duplicate/replayed mutations, concurrency loss, private-media leakage, and oversized cross-domain changes. The design uses explicit decision gates, coherent authority slices, and independent acceptance to contain them.
