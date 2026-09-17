# Phase 0 configuration inventory (K08)

Status: implemented for Task 0.1. This document inventories configuration; it does not approve or implement the H19 Admin-settings allowlist.

## Method and composition boundary

The inventory was built from `.env.example`, `local/commerce/example.env`, all `process.env`/runtime-environment reads under `app`, `local`, and `scripts`, the fixed identity module, and the persisted local Catalog/checkout rule authorities. There are **73 canonical entries**: 59 declared environment values, 3 fixed public identity facts, 8 explicitly inactive provider placeholders not yet declared in `.env.example`, and 3 persisted business-setting groups.

`app/config/server-runtime-composition.server.ts` is the K08 server-only composition boundary. `composeServerRuntimeConfiguration` normalizes the runtime, deployment, all source selectors, local project identity/endpoints, persistent dependencies, required server credentials, inactive provider placeholders, and forbidden browser/provider activation selectors. `projectPublicRuntimeConfiguration` is the only projection added by K08 and deliberately contains only brand, deployment class, canonical origin, and an already validated optional support email.

The primary classifications below are mutually exclusive. “H19” means only whether the value could ever be considered for a future owner-approved Admin settings allowlist.

## Public identity and owner-facing values

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BRAND_NAME` | `app/config/identity.ts` (`FigMemento`) | metadata/storefront | public | PUBLIC_SAFE | Always | fixed literal | allowlisted public projection | read-only |
| `PRODUCTION_ORIGIN` | `app/config/identity.ts` | canonical/SEO | public | PUBLIC_SAFE | Production | fixed HTTPS origin | production must match exactly | read-only |
| `STAGING_HOSTNAME` | `app/config/identity.ts` | staging canonical policy | public | PUBLIC_SAFE | Staging | fixed hostname | composed only as staging identity | read-only |
| `APP_DEPLOYMENT_ENV` | environment | public config/SEO/composition | public-safe projection | SERVER_NON_SECRET | Required logically; inferred from `NODE_ENV` if absent | accepted production/staging/preview/development/test | unknown and runtime mismatch reject | no |
| `NEXT_PUBLIC_DEPLOYMENT_ORIGIN` | environment | public config/SEO | public | PUBLIC_SAFE | Required for preview; optional otherwise | production/fixed or local default | absolute origin; production exact; local authority requires loopback | read-only |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | environment | support copy | public | OWNER_BUSINESS_SETTING | Optional until owner supplies | absent gives generic support wording | validated email; placeholder rejected | candidate |

## Runtime and authority source selection

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | runtime | every source reader | server | SERVER_NON_SECRET | Always | framework supplied | only development/test/production; unknown rejects | no |
| `PHOTOGIFT_PRODUCT_SOURCE` | environment | Catalog composition | server | SERVER_NON_SECRET | Optional | `supabase`; fixture/persistent local-only | typed; local source blocked outside dev/test | no |
| `CUSTOMER_AUTH_SOURCE` | environment | customer Auth | server | SERVER_NON_SECRET | Optional | disabled | typed; local source blocked outside dev/test | no |
| `CART_SOURCE` | environment | Cart | server | SERVER_NON_SECRET | Optional | disabled | typed; dependency coherence for persistent mode | no |
| `LOCAL_CHECKOUT_SOURCE` | environment | Checkout | server | SERVER_NON_SECRET | Optional | disabled | typed; dependency coherence for persistent mode | no |
| `CUSTOMER_UPLOAD_SOURCE` | environment | upload/media | server | SERVER_NON_SECRET | Optional | disabled | typed; persistent helper secret required | no |
| `LOCAL_ORDER_SOURCE` | environment | Order | server | SERVER_NON_SECRET | Optional | disabled | typed; capability config required in persistent mode | no |
| `LOCAL_PAYMENT_SOURCE` | environment | Payment simulation | server | SERVER_NON_SECRET | Optional | disabled | typed; persistent dependency coherence | no |
| `LOCAL_FULFILLMENT_SOURCE` | environment | Fulfillment | server | SERVER_NON_SECRET | Optional | disabled | typed; persistent dependency coherence | no |
| `LOCAL_TRACKING_SOURCE` | environment | Tracking | server | SERVER_NON_SECRET | Optional | disabled | typed; persistent dependency coherence | no |
| `ADMIN_ACCEPTANCE_SOURCE` | environment | Admin composition | server | SERVER_NON_SECRET | Optional | production boundary | typed; local Admin source is dev/test only | no |
| `LOCAL_SUPPLIER_SOURCE` | environment | unsupported local supplier fixture | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled | only disabled/local_fake; no provider activation | no |
| `LOCAL_NEWSLETTER_SOURCE` | environment | local newsletter sink | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled | only disabled/local_fake | no |
| `LOCAL_ANALYTICS_SOURCE` | environment | local analytics sink | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled | only disabled/local_fake | no |
| `LOCAL_CONTACT_SOURCE` | environment | local contact sink | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled | only disabled/local_fake | no |
| `LOCAL_FULFILLMENT_OPERATOR` | environment | dev operator verifier | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled/empty | any enabled local operator makes composition local-only | no |
| `LOCAL_TRACKING_OPERATOR` | environment | dev operator verifier | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled/empty | any enabled local operator makes composition local-only | no |
| `LOCAL_SUPPLIER_OPERATOR` | environment | dev supplier verifier | server | LOCAL_DEVELOPMENT_ONLY | Optional dev/test | disabled/empty | any enabled local operator makes composition local-only | no |

## Local-commerce identity, endpoints, and credentials

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LOCAL_COMMERCE_ENVIRONMENT` | ignored local env | local composition/stack | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | development/test exact and matches runtime/project kind | no |
| `LOCAL_COMMERCE_PROJECT_KIND` | ignored local env | marker/reset/composition | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | retained-development/disposable-test compatibility | no |
| `LOCAL_COMMERCE_PROJECT_ID` | ignored local env | every durable adapter | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | exact derived project identity | no |
| `LOCAL_COMMERCE_RUN_ID` | ignored local env | marker/stack | server | TEST_ONLY | Persistent only | none | retained literal or bounded `run-*` | no |
| `LOCAL_COMMERCE_DB_MAJOR_VERSION` | ignored local env | stack/marker | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | exact PostgreSQL 17 | no |
| `LOCAL_COMMERCE_SHADOW_DB_PORT` | ignored local env | stack | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | integer 1024–65535; unique | no |
| `LOCAL_COMMERCE_API_PORT` | ignored local env | stack/endpoints | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | bounded unique port; endpoint match | no |
| `LOCAL_COMMERCE_DB_PORT` | ignored local env | database stack | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | bounded unique port | no |
| `LOCAL_COMMERCE_STUDIO_PORT` | ignored local env | local Studio | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | bounded unique port | no |
| `LOCAL_COMMERCE_SMTP_PORT` | ignored local env | local mail placeholder | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | bounded unique port | no |
| `LOCAL_COMMERCE_IMAGE_HELPER_PORT` | ignored local env | image helper | server | LOCAL_DEVELOPMENT_ONLY | Persistent upload | none | bounded unique port; helper URL match | no |
| `LOCAL_COMMERCE_API_URL` | ignored local env | REST/adapters | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | HTTP loopback, no credentials, root path, exact port | no |
| `LOCAL_COMMERCE_RPC_URL` | ignored local env | RPC/adapters | server | LOCAL_DEVELOPMENT_ONLY | Persistent only | none | HTTP loopback, no credentials, root path, exact port | no |
| `LOCAL_COMMERCE_STORAGE_URL` | ignored local env | private Storage | server | LOCAL_DEVELOPMENT_ONLY | Persistent media/delivery | none | HTTP loopback, exact `/storage/v1`, exact port | no |
| `LOCAL_COMMERCE_IMAGE_HELPER_URL` | ignored local env | trusted image helper | server | LOCAL_DEVELOPMENT_ONLY | Persistent upload | none | HTTP loopback root, exact helper port | no |
| `LOCAL_COMMERCE_WORKDIR` | ignored local env | stack wrapper | server | TEST_ONLY | Disposable tooling | default under `local/commerce` | stack wrapper path restrictions remain authoritative | no |
| `LOCAL_COMMERCE_MARKER_PATH` | ignored local env | marker wrapper | server | TEST_ONLY | Disposable tooling | workdir marker | wrapper-owned path; never public | no |
| `LOCAL_COMMERCE_MARKER_DIGEST` | ignored local env | composition/RPC identity | server secret | SERVER_SECRET | Persistent only | none | required 64 lowercase hex and same authority set | never |
| `LOCAL_COMMERCE_SERVICE_ROLE_KEY` | ignored local env | durable adapters | server secret | SERVER_SECRET | Persistent only | none | required whenever persistent authority selected; never projected | never |
| `LOCAL_COMMERCE_IMAGE_HELPER_SECRET` | ignored local env | helper request signing | server secret | SERVER_SECRET | Persistent upload | none | required for persistent upload; never projected | never |
| `LOCAL_ORDER_CAPABILITY_SECRET` | ignored local env | Order capability signing | server secret | SERVER_SECRET | Persistent Order | none | required for persistent Order; never projected | never |
| `LOCAL_ORDER_CAPABILITY_TTL_SECONDS` | ignored local env | Order capability service | server | SERVER_NON_SECRET | Persistent Order | none | required and subsequently bounded by capability service | no |
| `PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET` | ignored local env | guest owner signing | server secret | SERVER_SECRET | Guest durable flows | none | existing length/entropy validation; never projected | never |
| `PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS` | ignored local env | guest owner service | server | SERVER_NON_SECRET | Guest durable flows | none | existing integer 300–604800 validation | no |

## Provider configuration and inactive placeholders

All provider entries remain inactive in Task 0.1. Presence is reported to server code only as a key name, never as a credential value. Explicit activation selectors are rejected.

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | environment | deferred Supabase boundary | potentially public | PROVIDER_CONFIGURATION | Not active | required only by direct reader | not included in K08 public projection | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | environment | deferred Supabase browser boundary | potentially public | PROVIDER_CONFIGURATION | Not active | required only by direct reader | not included in K08 public projection | no |
| `SUPABASE_SECRET_KEY` | environment | deferred Supabase server boundary | server secret | PROVIDER_CONFIGURATION | Not active | required only by direct reader | placeholder remains inactive and server-only | never |
| `SUPABASE_UPLOAD_BUCKET` | environment | legacy upload config reader | server | DEPRECATED / UNUSED | Not active | `photogift-uploads` | no activation; local persistent uses fixed private bucket | no |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | environment | deferred Stripe UI | potentially public | PROVIDER_CONFIGURATION | Not active | none | omitted from K08 public projection | no |
| `STRIPE_SECRET_KEY` | environment | deferred Stripe adapter | server secret | PROVIDER_CONFIGURATION | Not active | none | presence cannot activate Stripe | never |
| `STRIPE_WEBHOOK_SECRET` | environment | deferred webhook verifier | server secret | PROVIDER_CONFIGURATION | Not active | none | presence cannot activate Stripe | never |
| `R2_ACCOUNT_ID` | environment | reserved object storage | server | PROVIDER_CONFIGURATION | Not active | none | inactive placeholder | no |
| `R2_ACCESS_KEY_ID` | environment | reserved object storage | server secret | PROVIDER_CONFIGURATION | Not active | none | inactive placeholder; never projected | never |
| `R2_SECRET_ACCESS_KEY` | environment | reserved object storage | server secret | PROVIDER_CONFIGURATION | Not active | none | inactive placeholder; never projected | never |
| `R2_BUCKET_NAME` | environment | reserved object storage | server | PROVIDER_CONFIGURATION | Not active | none | inactive placeholder | owner decision |
| `RESEND_API_KEY` | environment | future email adapter | server secret | PROVIDER_CONFIGURATION | Not active | none | presence cannot activate Resend | never |
| `TRACKING_API_KEY` | environment | future 17TRACK adapter | server secret | PROVIDER_CONFIGURATION | Not active | none | presence cannot activate tracking provider | never |
| `GOOGLE_OAUTH_CLIENT_ID` | absent/reserved | future Google OAuth | server/provider | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected | no |
| `GOOGLE_OAUTH_CLIENT_SECRET` | absent/reserved | future Google OAuth | server secret | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected; never projected | never |
| `PAYPAL_CLIENT_ID` | absent/reserved | future PayPal | server/provider | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected | no |
| `PAYPAL_CLIENT_SECRET` | absent/reserved | future PayPal | server secret | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected; never projected | never |
| `GA4_MEASUREMENT_ID` | absent/reserved | future analytics | potentially public | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected | owner decision |
| `META_PIXEL_ID` | absent/reserved | future analytics | potentially public | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected | owner decision |
| `TIKTOK_PIXEL_ID` | absent/reserved | future analytics | potentially public | PROVIDER_CONFIGURATION | Not implemented | none | explicit activation rejected | owner decision |
| `CLOUDFLARE_DEPLOYMENT_CONFIGURATION` | Wrangler/provider settings, not app env | deployment | provider | PROVIDER_CONFIGURATION | Not active in this task | external tooling | no deployment or provider composition | never |

## Admin and business configuration

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ADMIN_PASSWORD` | ignored local env | signed local Admin auth | server secret | SERVER_SECRET | Local Admin only | absent means unavailable | never projected; not an Admin setting | never |
| `SHIPPING_RULES` | versioned local Catalog/checkout authority | Checkout/Order/PDP | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted rules; production pending | bounded local rule authority | retained as server authority, not env/browser input | candidate |
| `PROMOTION_COUPON_RULES` | versioned local Catalog/checkout authority | Checkout/Order | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted rules; production pending | invalid/expired/not-applicable = zero discount | retained as server authority, not env/browser input | candidate |
| `DIGITAL_DELIVERY_POLICY` | persisted local delivery authority | digital grants/tickets | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted policy; production pending | durable 30-day/5-download local policy | retained as server authority, not env/browser input | read-only pending decision |

## Test/tool-only values discovered outside `.env.example`

These are not application configuration and cannot become browser or H19 authority: `PREVIEW_BASE_PATH`, `LOCAL_COMMERCE_ALLOW_DISPOSABLE_RESET`, `LOCAL_COMMERCE_ACCEPTANCE_RUN`, `LOCAL_COMMERCE_ACCEPTANCE_JWT_SECRET`, `TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED`, `TASK_11_4_VERIFIED_DB_CONTAINER_ID`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `WRANGLER_SEND_METRICS`, `WRANGLER_WRITE_LOGS`, `SUPABASE_TELEMETRY_DISABLED`, `HOME`, and `TMPDIR`. Their primary classification is **TEST_ONLY** (or host tooling for `HOME`/`TMPDIR`); they are intentionally excluded from the 73 canonical application entries.

## Fail-closed matrix

- Unknown runtime/deployment: unavailable.
- Production/staging/preview with any fixture/local authority: unavailable.
- Runtime/deployment mismatch: unavailable.
- Local public origin that is not HTTP loopback: unavailable.
- Wrong project/run/kind/PostgreSQL version, malformed/remote endpoint, duplicate/mismatched port, or malformed marker digest: unavailable through the existing exact local-commerce parser/composition.
- Persistent capability with a non-persistent required dependency: unavailable; no memory/fixture fallback.
- Missing service-role, image-helper, or Order capability configuration when applicable: unavailable.
- Unsupported provider activation selector: unavailable; configured credentials alone remain inactive.
- Browser-visible authority selector: unavailable.

## H19 candidate inventory (not approved)

### RECOMMENDED_ALLOWLIST

- Optional support email, only after owner approval.
- Versioned shipping and promotion business settings, only after their later task-specific semantics and authorization are approved.

### RECOMMENDED_READ_ONLY

- Brand name and canonical production origin.
- Deployment environment identity.
- Safe provider activation status (inactive/configured), never credential values.
- Current digital-delivery policy projection, pending owner scope decision.

### SERVER_ONLY_NEVER_ADMIN

- Every password, signing/capability secret, marker digest, service-role key, provider credential, webhook secret, database endpoint/port, project/run identity, source selector, runtime mode, workdir, and test control.

### OWNER_DECISION_REQUIRED

- Support email publication.
- R2/production Storage bucket choice.
- GA4/Meta/TikTok identifiers and consent policy.
- Shipping/promotion/digital policy mutability and exact H19 allowlist membership.

## Schema and provider safety

Task 0.1 needs no schema change. Migrations `0001`–`0037` remain immutable and no `0038` exists. No provider client is created, no provider call is made, and no owner business fact is invented by this composition boundary.
