# Batch A Source Boundary Audit

Date: 2026-09-03
Change: `build-local-admin-acceptance-runtime`
Scope: Tasks 1.1–1.4 only

This is a read-only inventory of the Admin composition before local Catalog or
Orders adapters are implemented. It records current production behavior and
the Batch A policy boundary; it does not claim local Admin runtime support.

## Current route inventory

| Surface | Route | Current authorization | Current source/provider after authorization | Batch A status |
| --- | --- | --- | --- | --- |
| Admin login page | `/admin/login` | Login form is the entry point | Existing `/api/admin/login` issues the signed `photogift-admin-session` cookie | Existing auth retained |
| Admin login API | `/api/admin/login` `POST` | Configured Admin password check | No Catalog/Order provider is constructed | Existing auth retained |
| Admin Products page | `/admin/products` | `ExistingAdminSessionVerifier` inside `AdminCatalogQueryBoundary` | Deferred `createProductionCatalogRepository()` → `SupabaseCatalogRepository` | Covered by future shared policy; no route switch in Batch A |
| Catalog content API | `/api/admin/catalog/[resource]/[id]` `POST` | `createExistingAdminMutationVerifier` and protected command boundary | `createProductionAdminCatalogRepositories()` → Supabase client + Catalog repositories | Covered route family; no integration in Batch A |
| SKU graph API | `/api/admin/catalog/products/[id]/sku-graph` `POST` | Existing protected Admin verifier in HTTP/boundary layers | `createProductionAdminSkuGraphRepositories()` → Supabase client | Covered route family; no integration in Batch A |
| ProductAsset API | `/api/admin/catalog/products/[id]/assets` `POST` | Existing protected Admin verifier in HTTP/boundary layers | `createProductionAdminProductAssetRepositories()` → Supabase client | Covered route family; no integration in Batch A |
| ProductFulfillmentConfig API | `/api/admin/catalog/products/[id]/fulfillment` `POST` | Existing protected Admin verifier in HTTP/boundary layers | `createProductionAdminProductFulfillmentRepositories()` → Supabase client | Covered route family; no integration in Batch A |
| Catalog lifecycle API | `/api/admin/catalog/[resource]/[id]/lifecycle` `POST`, `DELETE` | Existing protected Admin verifier in lifecycle HTTP/boundary layers | `createProductionAdminCatalogLifecycleRepositories()` → Supabase client/RPC writer | Covered route family; no integration in Batch A |
| Admin CustomizationField API | `/api/admin/catalog/products/[id]/customization` `GET`, `POST` | Existing protected Admin verifier in customization HTTP/boundary layers | Production customization reader/writer factories → Supabase client | Covered only when surfaced by the real Products page; no integration in Batch A |
| Admin Orders page | `/admin/orders` | `isValidAdminSession` before the query | `getSupabaseServerClient()` → `orders`, `order_items`, `products`, optional `order_status_logs` queries | Covered by separate future Orders seam; no integration in Batch A |
| Admin Orders export | `/api/admin/orders/export` `GET` | `isValidAdminSession` before query | `getSupabaseServerClient()` → `orders` query and CSV projection | Covered by separate future Orders seam; no integration in Batch A |
| Admin Orders operation API | `/api/admin/orders` `PATCH` | `isValidAdminSession` before body/provider work | Supabase `orders`, `order_items`, `order_uploads`, and `order_status_logs` reads/writes | Adjacent production workflow; not implemented in Batch A |
| Draft-upload cleanup | `/api/admin/cleanup-uploads` `POST` | `isValidAdminSession` before Storage construction | Supabase tables plus Supabase Storage list/remove | Explicit Storage operation; not switched in Batch A |
| Digital delivery | `/api/admin/digital-delivery` `POST` | `isValidAdminSession` before multipart/provider work | Supabase Order/item reads and Storage upload/update | Explicit production workflow; not switched in Batch A |

The real `/admin/products` page currently exposes Product/Category content
editing, SKU graph, public Asset metadata, FulfillmentConfig, existing
CustomizationField editing, and lifecycle controls. The real `/admin/orders`
page currently exposes protected order reads, filters, export, photo review,
digital-delivery, Fulfillment, and Tracking controls. Batch A does not make
any of these routes local; the later route-integration tasks must select a
whole safe source family rather than only changing page reads.

## Authorization ordering

The required composition order for every covered route is:

```text
Admin session verification
  → source policy resolution
  → privileged local/production repository construction
  → read or bounded command
```

Observed current behavior:

- Products page: `AdminCatalogQueryBoundary` authorizes before invoking its
  deferred reader factory. The production factory is not called on an
  unauthorized result.
- Catalog content, SKU graph, assets, fulfillment, lifecycle, and
  CustomizationField handlers perform their existing Admin authorization and
  request checks before invoking deferred repository factories.
- Orders page and Orders export verify `photogift-admin-session` before
  `getSupabaseServerClient()`.
- Orders PATCH, cleanup, and digital delivery verify the same Admin session
  before parsing provider-bound work or constructing a provider.

Batch A adds a reusable policy contract that accepts an already-established
authorization classification and only then invokes a deferred source factory.
Parsing a configuration value is not privileged construction; parsing itself
does not load fixtures, create a client, access Storage, or query Orders.

## Source-policy states to implement

| Runtime/configuration | Required classification | Provider construction by the policy |
| --- | --- | --- |
| `ADMIN_ACCEPTANCE_SOURCE` absent | `production_default` | Deferred production factory only after authorization |
| Development + `local_fake` | `local_fake` | Deferred local factory only after authorization |
| Test + `local_fake` | `local_fake` | Deferred local factory only after authorization |
| Production + `local_fake` | `configuration_failure` | None; do not fall back to production |
| Unknown selector value | `configuration_failure` | None; do not auto-select either source |
| Local source factory failure | `source_failure` | No retry through production |
| Production source factory failure | `source_failure` | No retry through local |

The source selector is independent from `PHOTOGIFT_PRODUCT_SOURCE` and does not
change public storefront, Cart, Checkout, Local Order, Local Payment,
Fulfillment, or Tracking source semantics.

## Security and privacy boundaries

- The selector belongs to the server runtime configuration layer only.
- `NEXT_PUBLIC_*`, query strings, URL search parameters, request bodies,
  cookies, local storage, form fields, React props, and browser JavaScript are
  not configuration authorities.
- No selector value, complete environment object, Admin password, session
  secret, Supabase URL, or service-role key is logged or placed in a response.
- Batch A proves policy/parser behavior and deferred unauthorized construction
  ordering only. It does not claim zero-provider authorized Products/Orders
  runtime behavior; that belongs to later local adapter and route tasks.

## Scope freeze

Batch A intentionally does not implement local Catalog repositories, local
Orders fixtures, route integration, Admin password entry, browser acceptance,
Storage abstraction, migrations, remote access, or any production business
workflow. The high-fidelity change remains untouched at Task 10.2 OPEN and
39/45.
