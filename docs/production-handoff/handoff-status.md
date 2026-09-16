# Production handoff status matrix

Status date: 2026-09-16

`Ready for integrator?` means the boundary is sufficiently defined to begin the
listed integration work. It does not mean ready for production activation.

| Area | Local core status | Production integration status | Owner | Required credentials/config | Blocking decision | Acceptance evidence | Ready for integrator? yes/no |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Infrastructure | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Platform owner | Cloudflare account/project, environments, access | Project/environment/rollback choice | Local isolated-stack runbook only | no |
| Database | LOCAL CORE COMPLETE | DEFERRED / NOT AUTHORIZED | Data/platform owner | Production Supabase project, DB operator channel | Canonical schema, C1/Phase C migration approval | Local schema 37/37; no production migration | no |
| Auth | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Identity owner | Supabase Auth, SMTP, Google OAuth, redirects | Session/BFF and guest-claim policy | Local session/ownership recovery/security | no |
| Catalog | LOCAL CORE COMPLETE | DEFERRED / NOT AUTHORIZED | Catalog/data owner | Production Catalog data and admin workflow | C1/Phase C/canonical persistence approval | Synthetic persistent read authority | no |
| Cart | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Commerce integration owner | Canonical DB/runtime composition | Production persistence binding | CAS/restart/two-instance evidence | yes |
| Uploads/Media | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Media/platform owner | Storage and renderer credentials/config | Production provider/retention/residency choice | Private Storage/helper/race/fault evidence | no |
| Checkout | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Commerce/business owner | Shipping/coupon/tax configuration | Production shipping/tax/zero-total policies | Fresh local validation and immutable allocation | no |
| Orders | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Commerce/data owner | Canonical Order schema/runtime | Production migration and legacy cutover | Atomic snapshots/replay/recovery | no |
| Payments | LOCAL SIMULATION ONLY | PRODUCTION INTEGRATION REQUIRED | Payments owner | Stripe/PayPal accounts, keys, webhooks | Refund, zero-total and reconciliation policy | Simulated atomic Payment evidence only | yes |
| Email | LOCAL SIMULATION ONLY | PRODUCTION INTEGRATION REQUIRED | Messaging owner | Sender domain, provider key, webhook, allowlist | Provider/send authorization and producer wiring | No real delivery evidence | yes |
| Fulfillment | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Operations owner | Production operator/Admin identities | Supplier/manual production operating model | Review/manifest/revision/timeout/QC evidence | yes |
| Shipping rates | LOCAL CORE COMPLETE | BUSINESS CONFIGURATION REQUIRED | Business/logistics owner | Countries, methods, weights, prices, thresholds | Rate source and approved launch rules | Bounded local rule evidence | no |
| Tracking | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Logistics integration owner | 17TRACK account/key, carrier map, callback | Polling/webhook/manual fallback policy | Local Shipment/event/replay evidence | yes |
| Digital delivery | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Commerce/media owner | Production Storage and download policy | Provider and retention/residency choice | Grant/ticket/quota/restart/fault evidence | no |
| Storage | LOCAL CORE COMPLETE | NEEDS PROVIDER DECISION | Platform/security owner | Supabase Storage or R2 account/config | Provider, region, backup, retention, access strategy | Local private Storage security evidence | no |
| Analytics | LOCAL SIMULATION ONLY | PRODUCTION INTEGRATION REQUIRED | Growth/privacy owner | GA4/Meta/TikTok IDs, consent config | Consent/privacy/attribution policy | No production analytics evidence | no |
| Domain/DNS | BUSINESS CONFIGURATION REQUIRED | PRODUCTION INTEGRATION REQUIRED | Brand/platform owner | Domain registrar, Cloudflare zone, TLS | Final brand/domain and redirect policy | Current FigMemento identity code only | no |
| Admin | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Security/operations owner | Production Admin identity/role/session | Provider/role/audit/abuse policy | Signed local Admin acceptance only | no |
| Business configuration | BUSINESS CONFIGURATION REQUIRED | BUSINESS CONFIGURATION REQUIRED | Project owner | Brand, catalog, suppliers, rates, policies, support | All launch facts in `09-business-configuration.md` | Requirements baseline only | no |
| Production E2E | LOCAL CORE COMPLETE | PRODUCTION INTEGRATION REQUIRED | Release owner | All above plus test accounts and monitoring | Every dependency and explicit execution approval | Local desktop/mobile/restart/concurrency/fault evidence | no |

## Responsibility summary

- Project/business owner: brand, assortment, supplier, price, shipping, policy,
  support and launch-country decisions.
- Platform/data owner: Cloudflare, Supabase, migration, Storage, backup,
  observability and rollback.
- Identity owner: Supabase Auth, OAuth/OTP, session and claim/migration policy.
- Payments owner: Stripe/PayPal, webhooks, reconciliation and refunds.
- Messaging owner: templates, outbox/provider integration, sender reputation and
  delivery callbacks.
- Logistics owner: shipping rules, carrier mappings, 17TRACK and exception
  handling.
- Release owner: production-like E2E, security sign-off, launch/rollback and
  evidence package.

## Current conclusion

The local core is complete and frozen. Production integration is not complete,
and no row in this matrix authorizes remote mutation, provider calls,
deployment, DNS changes or production activation.
