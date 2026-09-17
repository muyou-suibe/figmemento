# Phase 0 configuration inventory (K08)

Status: implemented for Task 0.1. This document inventories configuration; it does not approve or implement the H19 Admin-settings allowlist.

## Method and composition boundary

The inventory was built from `.env.example`, `local/commerce/example.env`, all `process.env`/runtime-environment reads under `app`, `local`, and `scripts`, the fixed identity module, and the persisted local Catalog/checkout rule authorities. There are **73 canonical entries**: 59 declared environment values, 3 fixed public identity facts, 8 explicitly inactive provider placeholders not yet declared in `.env.example`, and 3 persisted business-setting groups.

`app/config/server-runtime-composition.server.ts` is the K08 server-only composition boundary. `composeServerRuntimeConfiguration` normalizes the runtime, deployment, all source selectors, local project identity/endpoints, persistent dependencies, required server credentials, provider deferral, and forbidden browser/provider activation selectors. `resolveCanonicalLocalCommerceCapability` is the single tri-state (`selected` / `not_selected` / `unavailable`) source-selection seam used by real application/HTTP consumers; provider-specific readers remain adapter validation only. `projectPublicRuntimeConfiguration` is the only projection added by K08 and deliberately contains only brand, deployment class, canonical origin, and an already validated optional support email.

The primary classifications below are mutually exclusive. “H19” means only whether the value could ever be considered for a future owner-approved Admin settings allowlist.

## Public identity and owner-facing values

| Key/name | Current source | Consumers | Visibility | Primary classification | Required / applicability | Existing fallback / old validation | K08 validation | H19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BRAND_NAME` | `app/config/identity.ts` (`FigMemento`) | metadata/storefront | public | PUBLIC_SAFE | Always | fixed literal | allowlisted public projection | read-only |
| `PRODUCTION_ORIGIN` | `app/config/identity.ts` | canonical/SEO | public | PUBLIC_SAFE | Production | fixed HTTPS origin | production must match exactly | read-only |
| `STAGING_HOSTNAME` | `app/config/identity.ts` | staging canonical policy | public | PUBLIC_SAFE | Staging | fixed hostname | composed only as staging identity | read-only |
| `APP_DEPLOYMENT_ENV` | environment | public config/SEO/composition | public-safe projection | SERVER_NON_SECRET | Required logically; inferred from `NODE_ENV` if absent | accepted production/staging/preview/development/test | unknown and runtime mismatch reject | no |
| `NEXT_PUBLIC_DEPLOYMENT_ORIGIN` | environment | public config/SEO | public | PUBLIC_SAFE | Required for preview; optional otherwise | production/fixed or local default | absolute origin; production exact; local authority requires loopback | read-only |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | environment | current support-copy fallback | public | OWNER_BUSINESS_SETTING | Optional until owner supplies | absent gives generic support wording | validated email; placeholder rejected | future fallback only |

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
| `LOCAL_COMMERCE_SERVICE_ROLE_KEY` | ignored local env | durable adapters | server secret | SERVER_SECRET | Persistent only | none | REQUIRED_AT_COMPOSITION whenever persistent authority is selected; never projected | never |
| `LOCAL_COMMERCE_IMAGE_HELPER_SECRET` | ignored local env | helper request signing | server secret | SERVER_SECRET | Persistent upload | none | REQUIRED_AT_COMPOSITION for persistent upload; existing bounded helper-secret validation; never projected | never |
| `LOCAL_ORDER_CAPABILITY_SECRET` | ignored local env | Order capability signing | server secret | SERVER_SECRET | Persistent Order | none | REQUIRED_AT_COMPOSITION for persistent Order; existing capability codec bounds; never projected | never |
| `LOCAL_ORDER_CAPABILITY_TTL_SECONDS` | ignored local env | Order capability service | server | SERVER_NON_SECRET | Persistent Order | none | REQUIRED_AT_COMPOSITION for persistent Order; existing positive safe-integer/maximum bounds | no |
| `PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET` | ignored local env | guest owner signing | server secret | SERVER_SECRET | Guest-scoped durable flows | none | REQUIRED_AT_COMPOSITION for guest-scoped persistent capabilities; existing owner-context validation; never projected | never |
| `PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS` | ignored local env | guest owner service | server | SERVER_NON_SECRET | Guest-scoped durable flows | none | REQUIRED_AT_COMPOSITION with existing integer 300–604800 validation | no |

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
| `ADMIN_PASSWORD` | ignored local env | signed local Admin auth | server secret | SERVER_SECRET | Local Admin operation only | absent means unavailable | INTENTIONALLY_OPERATION_SCOPED: existing signed Admin verifier fails closed at the operation boundary; not required for customer/Catalog-only composition; never projected | never |
| `SHIPPING_RULES` | versioned local Catalog/checkout authority | Checkout/Order/PDP | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted rules; production pending | bounded local rule authority | retained as server authority, not env/browser input | not mutable by H19 |
| `PROMOTION_COUPON_RULES` | versioned local Catalog/checkout authority | Checkout/Order | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted rules; production pending | invalid/expired/not-applicable = zero discount | retained as server authority, not env/browser input | not mutable by H19 |
| `DIGITAL_DELIVERY_POLICY` | persisted local delivery authority | digital grants/tickets | server + safe projection | OWNER_BUSINESS_SETTING | Local accepted policy; production pending | durable 30-day/5-download local policy | retained as server authority, not env/browser input | read-only only |

## Test/tool-only values discovered outside `.env.example`

These are not application configuration and cannot become browser or H19 authority: `PREVIEW_BASE_PATH`, `LOCAL_COMMERCE_ALLOW_DISPOSABLE_RESET`, `LOCAL_COMMERCE_ACCEPTANCE_RUN`, `LOCAL_COMMERCE_ACCEPTANCE_JWT_SECRET`, `TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED`, `TASK_11_4_VERIFIED_DB_CONTAINER_ID`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `WRANGLER_SEND_METRICS`, `WRANGLER_WRITE_LOGS`, `SUPABASE_TELEMETRY_DISABLED`, `HOME`, and `TMPDIR`. Their primary classification is **TEST_ONLY** (or host tooling for `HOME`/`TMPDIR`); they are intentionally excluded from the 73 canonical application entries.

## Fail-closed matrix

- Unknown runtime/deployment: unavailable.
- Production/staging/preview with any fixture/local authority: unavailable.
- Runtime/deployment mismatch: unavailable.
- Local public origin that is not HTTP loopback: unavailable.
- Wrong project/run/kind/PostgreSQL version, malformed/remote endpoint, duplicate/mismatched port, or malformed marker digest: unavailable through the existing exact local-commerce parser/composition.
- Persistent capability with a non-persistent required dependency: unavailable; no memory/fixture fallback.
- Missing or malformed service-role, image-helper, Order capability, or guest owner configuration when the corresponding persistent capability is selected: unavailable; these are REQUIRED_AT_COMPOSITION dependencies. `ADMIN_PASSWORD` remains INTENTIONALLY_OPERATION_SCOPED because only the signed Admin operation reads it and fails closed when absent.
- A selected provider-backed Catalog source (`supabase`), including one with credentials present, is deferred/unavailable until a separately authorized provider activation exists; credentials never make it ready.
- Unsupported provider activation selector: unavailable; configured credentials alone remain inactive.
- Browser-visible authority selector: unavailable.

## Composition-required configuration matrix

The canonical boundary has a bounded dependency rule: it requires only values needed by the selected persistent capabilities. `LOCAL_COMMERCE_SERVICE_ROLE_KEY` is required for every persistent selection; the image-helper secret is required for `upload`; Order capability secret and TTL are required for `order`; the guest owner secret and TTL are required for guest-scoped `cart`, `upload`, `checkout`, `order`, `payment`, `fulfillment`, and `tracking`. `ADMIN_PASSWORD` is intentionally operation-scoped and is re-verified by the existing signed Admin boundary. This prevents unrelated customer-only or Catalog-only composition from acquiring an unnecessary Admin-password dependency while still failing closed at Admin use.

## H19 candidate inventory (not approved)

### RECOMMENDED_ALLOWLIST

- `supportEmail` only: optional and nullable/unset is valid, with no fake default. Future implementation requires explicit version/CAS/audit semantics.

### RECOMMENDED_READ_ONLY

- Brand name.
- Canonical/site origin.
- Deployment environment identity.
- Coarse provider status only; never credentials or environment-variable names.

### SERVER_ONLY_NEVER_ADMIN

- Every password, signing/capability secret, marker digest, service-role key, provider credential, webhook secret, database endpoint/port, project/run identity, source selector, runtime mode, workdir, and test control.

### OWNER_DECISION_REQUIRED

- Future persisted `supportEmail` version/CAS/audit and its authority cutover.

Shipping/promotion/coupon settings (H18/H11), brand/domain, and digital policy are not mutable H19 settings under this decision. R2/production Storage, provider identifiers, and all provider configuration remain server-only/deferred.

### Support-email authority transition

Until a later H19 implementation is separately accepted, `NEXT_PUBLIC_SUPPORT_EMAIL` remains the existing presentation fallback. A future persisted H19 `supportEmail`, when set and active, must become the sole local-persistent authority for that fact; the environment projection must not independently control the same value. This Task 0.1 correction records the precedence/cutover requirement only and adds no schema or Admin settings route.

## Schema and provider safety

Task 0.1 needs no schema change. Migrations `0001`–`0037` remain immutable and no `0038` exists. No provider client is created, no provider call is made, and no owner business fact is invented by this composition boundary.
