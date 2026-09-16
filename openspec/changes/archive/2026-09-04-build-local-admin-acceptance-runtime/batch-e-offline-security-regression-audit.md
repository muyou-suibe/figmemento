# Batch E — Offline Security and Regression Audit

## Scope

This audit closes only Tasks 5.1–5.6 of
`build-local-admin-acceptance-runtime`. It covers the existing Admin Catalog
and synthetic Admin Orders seams in offline, deterministic tests. It does not
claim authorized browser acceptance, production Admin persistence, or a new
Admin workflow.

The repository contains Batch A, Batch C, and Batch D audit artifacts. A
separate Batch B audit artifact was not present during this review; no Batch B
evidence was invented or substituted. Existing Batch A/C/D evidence and the
focused Batch E test are the recorded basis for this batch.

## 5.1 — Source selection

The server-only `ADMIN_ACCEPTANCE_SOURCE` selector has the following tested
matrix:

| Runtime/configuration | Result |
| --- | --- |
| selector absent | production default |
| `local_fake` in development | local fake |
| `local_fake` in test | local fake |
| `local_fake` in production | configuration failure, fail closed |
| `local_fake` with unknown runtime | configuration failure, fail closed |
| unknown selector | configuration failure, fail closed |
| local source failure | bounded source failure; no production fallback |
| production source failure | bounded source failure; no local fallback |
| browser/request-shaped input | cannot select the source |

The original `readProductSource` contract remains independent: absent product
source is Supabase, fixture source is accepted only in development/test, and
Supabase failure is never converted into fixture success.

## 5.2 — Authorization ordering

The focused test exercises every privileged Catalog boundary (graph query,
content command, lifecycle, SKU graph, ProductAsset, FulfillmentConfig, and
CustomizationField query/command). Unauthorized and authentication-failure
verifiers return before their injected source factory is called. Construction
count is zero for both outcomes.

The existing route integration also verifies the real signed Admin session
boundary and that an authorized local request uses the selected local source.
The Admin Orders page and export path retain authentication before source
resolution/provider access.

## 5.3 — Local Catalog regression

The shared process-memory Catalog graph was exercised through the actual
authorized route handlers and direct typed boundaries. Evidence covers:

- complete fixture graph reads and shared reader identity;
- Product content, SKU graph, ProductAsset, FulfillmentConfig,
  CustomizationField, and lifecycle paths;
- same-Product graph validation and invalid command rollback;
- repeat-safe lifecycle behavior and hard-delete rejection;
- honest `applied` responses for local state changes;
- reset to the deterministic seed after the test seam is reset;
- public fixture repository isolation after local Admin mutation.

No filesystem, SQLite, D1, Drizzle, Supabase, Storage, or network persistence
is used by the local Catalog runtime.

## 5.4 — Local Orders regression

The local Orders read model was checked for 24 deterministic synthetic orders,
including:

- `LOCAL / TEST ONLY` notice and 20-item pagination;
- long order references, long display copy, physical and digital line items;
- paid, unpaid, failed, fulfillment, tracking, and attention states;
- reference/email query behavior, bounded filters, empty results, and
  out-of-range pages;
- unavailable/source-failure results that do not masquerade as success;
- export projection and spreadsheet-formula-safe text;
- `@example.test` synthetic emails only;
- absence of private photo locators, Storage keys, signed URLs, provider
  identifiers, credentials, cookies, and payment secrets;
- non-mutating local control dispositions;
- unchanged Order read results after a Catalog-only local edit.

No local Orders repository has a write, Storage, signed-URL, production Order,
or Catalog dependency.

## 5.5 — Route/provider sentinels and safe failure

The focused route test invokes the authorized local Product, SKU graph,
ProductAsset, FulfillmentConfig, CustomizationField, and lifecycle routes.
`globalThis.fetch` is replaced with a throwing provider sentinel for the
duration of the test; observed calls: **0**.

The real `/admin/orders` page and export route now call the shared
server-only `loadAdminOrdersPageAfterAuthorization` and
`loadAdminOrdersExportAfterAuthorization` composition seams after the
existing Admin session check. The local Orders page composition sentinel and
local Orders export composition sentinel both return the synthetic local
result. Injected production Orders loader, Supabase factory, upload-config,
Storage, signed-URL, Catalog, and `fetch` sentinels each observed **0** calls.
Export filter parity and the local safe export projection were verified through the
same composition path. Direct local repository tests remain 5.4 contract
evidence; they are not used as route-level provider proof.

The test additionally verifies:

- local source failure is returned as bounded failure and never retried through
  production;
- invalid configuration is represented by a bounded configuration message;
- raw exception text, SQL detail, filesystem paths, stack, hints, or secrets do
  not appear in the HTTP response;
- local mode cannot enter the production Supabase or Storage branch;
- the Products page retains separate invalid-configuration and production-C1
  unavailable messages without exposing configuration values.

## 5.6 — Cross-system isolation

The Admin selector is independent of the public Product source and all other
local runtime selectors. With no explicit downstream selector, Cart, customer
auth, customer upload, Local Order, Local Payment, Local Fulfillment, and
Local Tracking remain disabled by their existing defaults. The public Product
source remains Supabase by default, while explicit Admin local mode selects
only the local Admin Catalog/Orders seams.

The Admin source module contains no Local Order, Payment, Fulfillment,
Tracking, customer-upload, Storage, or network runtime composition. The
selector is server-only and is not read from browser APIs or public client
configuration.

## Evidence status

Focused Batch E test: **8/8 PASS**.

Tasks 5.1–5.6 are eligible to be marked complete only after the complete
offline, rendered, typecheck, lint, build, verify, strict OpenSpec, and diff
checks required by the apply request pass. Tasks 6.x and 7.x remain unchecked;
Batch F is not started.

## Scope exclusions

- No authorized browser acceptance or Admin password was used.
- No remote Supabase access, migration, deployment, DNS, or Cloudflare change.
- No production persistence or production Admin readiness claim.
- No Catalog, Customization, high-fidelity, or other active change planning
  artifacts were modified.
