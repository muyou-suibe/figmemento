# Production handoff package

Status: **PRODUCTION HANDOFF PREPARATION — NO DEPLOYMENT**

This package hands the accepted local commerce core to a future production
integration owner. It is an inventory and execution checklist, not permission
to deploy, connect remote services, migrate production data or redesign the
accepted commerce contracts.

## Frozen baseline

- OpenSpec change: `complete-local-commerce-persistence`
- Completion: **85/85**
- Local schema inventory: `0001`–`0037`, schema version 37
- Current quality evidence: lint/typecheck/offline/build/rendered/full verify
  passed in the accepted change; rendered is currently 11/11.
- Historical rendered baseline remains separately recorded as 7/11 with four
  recovered Server Components failures.
- Classification: local development/test persistence acceptance, not
  production-provider readiness.

## Required classification vocabulary

Every handoff item uses one of these labels:

- **LOCAL CORE COMPLETE** — accepted in the isolated local commerce system.
- **LOCAL SIMULATION ONLY** — behavior exists, but no real provider is used.
- **PRODUCTION INTEGRATION REQUIRED** — implementation and production-grade
  acceptance are still required.
- **BUSINESS CONFIGURATION REQUIRED** — the owner must supply or approve facts.
- **DEFERRED / NOT AUTHORIZED** — expressly outside current authority.
- **SECOND PHASE** — product scope intentionally deferred beyond MVP.

## Reading order

1. [Local core baseline](01-local-core-baseline.md)
2. [Production environment](02-production-environment.md)
3. [Authentication](03-auth-integration.md)
4. [Payments](04-payment-integration.md)
5. [Transactional email](05-email-integration.md)
6. [Shipping and tracking](06-shipping-tracking-integration.md)
7. [Private storage](07-storage-integration.md)
8. [Analytics](08-analytics-integration.md)
9. [Business configuration](09-business-configuration.md)
10. [Production E2E checklist](10-production-e2e-checklist.md)
11. [Responsibility and readiness matrix](handoff-status.md)

## Frozen authority boundaries

The integrator must adapt external services to the existing canonical command
and persistence boundaries. Provider payloads, browser redirects and browser
totals must never replace Catalog, Cart, Checkout, Order, Payment, media,
Fulfillment, Shipment, Tracking or digital-delivery authority.

This package does not authorize Supplier persistence, C1 historical backfill,
Customization Phase C, remote Supabase, production migrations, deployment,
real Auth/payment/email/carrier calls, production Storage selection or DNS
changes. Those require their own approval and evidence.

## Primary source material

- `独立站构建项目需求.md`
- `openspec/changes/complete-local-commerce-persistence/`
- Task 10 browser evidence, Task 11 recovery/concurrency/fault/security evidence
- Task 12 independent quality and final traceability evidence
- `local/commerce/README.md`
- `local/commerce/migrations/README.md`
- `local/commerce/image-helper/README.md`
- `openspec/changes/integrate-auth-payments-transactional-email/`
  (planning only; its unchecked tasks are not implemented capabilities)

## Known requirement mismatches

1. The product requirements request same-email historical guest Order
   association after login. The accepted local contract explicitly forbids
   email-only claim or merge. Production needs an independently reviewed
   verified-identity claim/migration contract; bulk `owner_id` updates are
   unsafe.
2. The requirements call for Supabase Auth OTP/Google, Stripe/PayPal, Resend,
   17TRACK and production analytics. The local core does not activate them.
3. The requirements mention blur/face/occlusion/people-count detection. The
   accepted media core validates bytes, decode, dimensions and pixels, but does
   not claim image-content recognition.
4. The requirements describe expiring download URLs. The accepted local core
   uses an owner-authorized same-origin ticket → claim → stream flow and never
   exposes permanent object locators. A production adapter must preserve the
   security outcome without assuming signed URLs are already selected.
5. Persistent Supplier workflows and production Catalog migration/backfill are
   not part of the accepted local core.
