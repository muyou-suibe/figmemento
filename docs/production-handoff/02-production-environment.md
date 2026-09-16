# 02 — Production environment inventory

Status: **PRODUCTION INTEGRATION REQUIRED**.

No value in this document is a secret. Populate secrets only through approved
Cloudflare/Supabase/provider secret channels, never Git, logs, URLs, screenshots
or browser bundles.

## Platform and identity

| Requirement | Classification | Placeholder/configuration | Handoff action |
| --- | --- | --- | --- |
| Cloudflare account | NEEDS PRODUCTION VALUE | `<CLOUDFLARE_ACCOUNT>` | Owner grants least-privilege access. |
| Cloudflare Pages/Workers project | NEEDS PRODUCTION VALUE | `<CLOUDFLARE_PROJECT>` | Decide production/staging projects and rollback strategy. |
| Deployment environment | AVAILABLE IN LOCAL CORE | `APP_DEPLOYMENT_ENV=production` | Production build must reject local/fake sources. |
| Public application origin | NEEDS PRODUCTION VALUE | `NEXT_PUBLIC_DEPLOYMENT_ORIGIN` | Repository currently recognizes `https://figmemento.com`; brand/domain decision must confirm it. |
| Support address | BUSINESS CONFIGURATION REQUIRED | `NEXT_PUBLIC_SUPPORT_EMAIL` | Supply monitored customer-support mailbox. |
| Final brand/domain | BUSINESS CONFIGURATION REQUIRED | `<BRAND_NAME>`, `<CANONICAL_DOMAIN>` | Reconcile current FigMemento identity with final owner decision before deploy. |
| DNS/CDN | NEEDS PRODUCTION VALUE | `<DNS_ZONE>`, `<DNS_RECORDS>` | Approve apex/www/staging behavior, TLS and rollback. |

## Supabase/database

| Requirement | Classification | Placeholder/configuration | Handoff action |
| --- | --- | --- | --- |
| Production Supabase project | NEEDS PRODUCTION VALUE | `<SUPABASE_PROJECT_REF>` | Create/select an explicitly production-owned project. |
| Public API URL | NEEDS PRODUCTION VALUE | `NEXT_PUBLIC_SUPABASE_URL` | Must match the approved project and environment. |
| Browser publishable key | NEEDS PRODUCTION VALUE | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key only; validate RLS assumptions. |
| Server secret key | NEEDS PRODUCTION VALUE | `SUPABASE_SECRET_KEY` | Server-only secret binding; never expose to client. |
| Database URL/credentials | NEEDS PRODUCTION VALUE | `<SUPABASE_DATABASE_URL>` | Define migration/operator channel separately from runtime. |
| Production schema/migration | DEFERRED / NOT AUTHORIZED | `<CANONICAL_MIGRATION_PLAN>` | Local `0001–0037` cannot be pushed or treated as a production migration. C1/Phase C and canonical mapping require review. |
| Production RLS/RPC audit | PRODUCTION INTEGRATION REQUIRED | `<PRODUCTION_SECURITY_EVIDENCE>` | Re-run against exact production-like schema before activation. |

## Runtime source configuration

The local selectors below are development/test boundaries. Do not set
`local_fake`, `fixture` or `local_persistent` in production:

- `PHOTOGIFT_PRODUCT_SOURCE`
- `CUSTOMER_AUTH_SOURCE`
- `CART_SOURCE`
- `CUSTOMER_UPLOAD_SOURCE`
- `LOCAL_CHECKOUT_SOURCE`
- `LOCAL_ORDER_SOURCE`
- `LOCAL_PAYMENT_SOURCE`
- `LOCAL_FULFILLMENT_SOURCE`
- `LOCAL_TRACKING_SOURCE`
- `ADMIN_ACCEPTANCE_SOURCE`
- `LOCAL_NEWSLETTER_SOURCE`
- `LOCAL_CONTACT_SOURCE`
- `LOCAL_ANALYTICS_SOURCE`
- `LOCAL_SUPPLIER_SOURCE`

Production composition requires explicit provider/canonical adapters. Unknown,
mixed-project or local-only source combinations must fail closed.

## Secrets and service configuration

| Area | Classification | Existing/future placeholders |
| --- | --- | --- |
| Admin production identity | NEEDS PROVIDER DECISION | Replace local `ADMIN_PASSWORD` with an approved production Admin identity/session/role design. |
| Guest/customer signing | NEEDS INTEGRATION IMPLEMENTATION | Production session/capability secrets and rotation policy; do not reuse local acceptance secrets. |
| Stripe | NEEDS PRODUCTION VALUE | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, expected account ID. |
| PayPal | NEEDS INTEGRATION IMPLEMENTATION | Future server-only client ID/secret, webhook ID and environment variables must be defined by the approved adapter. |
| Email | NEEDS PRODUCTION VALUE | `RESEND_API_KEY` or approved alternative, sending domain, webhook secret and allowlist. |
| Tracking | NEEDS PRODUCTION VALUE | `TRACKING_API_KEY` plus provider account/carrier mapping. |
| Storage | NEEDS PROVIDER DECISION | Supabase Storage versus R2/approved alternative; current reserved R2 names are `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. |
| Analytics | NEEDS INTEGRATION IMPLEMENTATION | GA4, Meta Pixel and TikTok Pixel identifiers/consent configuration are not currently defined as production contracts. |

## Production operational requirements

- Environment ownership and least-privilege access matrix.
- Secret creation, rotation, incident revocation and break-glass procedure.
- Staging/production isolation and callback allowlists.
- Database backup, point-in-time recovery and migration rollback policy.
- Observability, error reporting, audit retention and alert ownership.
- Cloudflare/Supabase/provider quotas, rate limits and cost alerts.
- Deployment approval, canary/rollback and post-deploy verification.

All items in this section are **PRODUCTION INTEGRATION REQUIRED** unless an
owner must first supply a value, in which case they are **BUSINESS
CONFIGURATION REQUIRED**.
