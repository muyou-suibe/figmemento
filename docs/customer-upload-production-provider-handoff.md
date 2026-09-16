# Customer-upload production provider handoff

## Status — mandatory STOP gate

**PRODUCTION CUSTOMER-UPLOAD PROVIDER: UNRESOLVED**

Supported candidates under consideration:

- Supabase Storage — **CANDIDATE, NOT APPROVED**
- Cloudflare R2 — **CANDIDATE, NOT APPROVED**

| Item | Current status |
|---|---|
| Architecture approval | **NOT GRANTED** |
| Production adapter implementation | **STOPPED** |
| Production upload activation | **STOPPED** |
| Local/offline customer-upload development | Available through the process-local Final Batch runtime; see `docs/local-customer-upload-development.md` |

This is a provider-neutral decision handoff. It does not select a provider,
approve a bucket/container, create a provider binding, or authorize deployment.

## Required human decision

**DECISION:** Select the production private customer-media object-storage
provider.

The currently approved decision set is limited to:

A. Supabase Storage
B. Cloudflare R2

This task does not rank, compare, or recommend either candidate. A separate
approved architecture/deployment decision must record the selected candidate
before production customer-upload activation can start.

## Current implementation boundary

The provider-neutral application port is
`CustomerUploadObjectStore`. After a provider is approved, its production
adapter must implement all of the existing operations:

- `putPrivateObject`
- `readPrivateObject`
- `inspectPrivateObject`
- `deletePrivateObject`

The adapter must map opaque `receiptId` values to an internal private locator.
That locator is never browser or application authority and must not be returned
to the browser.

`CustomerUploadReceiptRepository` production persistence is separate from the
object-store choice. Its production implementation is **NOT YET ACTIVATED** and
remains subject to the approved persistence/schema stage. Selecting an object
storage provider alone does not create receipt metadata persistence.

Current private-media invariants remain unchanged:

- Customer-upload media must be private.
- No permanent public customer-media URL is allowed.
- Browser responses use an opaque `receiptId`, never a bucket, object key,
  provider path, or signed provider URL.
- Customer-input preview remains server-backed and owner-checked.
- JPEG, PNG, and WebP acceptance plus byte/dimension limits remain
  `CustomizationField` authority; a provider adapter preserves the actual
  inspected bytes and content type.

## Existing repository evidence and classification

| Finding | Classification | Meaning for the new customer-input architecture |
|---|---|---|
| `app/application/customer-upload-object-store.ts`, `customer-upload-repository.ts`, acceptance/lifecycle/server boundaries | A. New provider-neutral customer input | Defines ports and fail-closed behavior; contains no selected provider implementation. |
| `app/api/uploads/route.ts` | A. New customer-input route, production activation stopped | Resolves field constraints as `source_failure` and throws if acceptance dependencies were reached; it does not construct fake, Supabase Storage, R2, or S3 resources. |
| `app/api/customer-uploads/preview/route.ts` | A. New customer-input route, production activation stopped | Returns a safe `503`; it does not construct a preview provider, fake resources, Supabase Storage, R2, or S3 resources. |
| `app/testing/customer-upload-fakes.ts`, `customer-upload-failure-controls.ts`, `customer-upload-local-smoke-harness.ts` | C. Local/test fake | Deterministic offline resources only; never production fallback. |
| `app/api/orders/route.ts`, `app/admin/orders/page.tsx`, `app/api/admin/cleanup-uploads/route.ts`, `app/api/order-lookup/route.ts`, `app/api/admin/digital-delivery/route.ts`, `app/domain/upload.ts`, `app/application/legacy-order-upload-reference.ts` | B. Legacy / historical compatibility | Existing Supabase Storage, storage-key, signed-link, order/admin, digital-delivery, and prototype cleanup behavior. This is not approval evidence for the new customer-upload provider. |
| `SUPABASE_UPLOAD_BUCKET` and `readUploadConfig` | B. Legacy / prototype configuration | Existing prototype compatibility configuration only. It must not become the selected new customer-upload configuration by implication. |
| `.openai/hosting.json`, `vite.config.ts`, `supabase/config.toml` optional storage/R2/S3 examples | E. Unrelated runtime/template configuration | No approved customer-upload provider binding is present; these paths do not select a candidate. |

The local Final Batch composition is **local/offline evidence only**. It proves
explicit fixture field authority, provider-neutral application logic, the
verified guest-owner boundary, and in-memory receipt sharing across upload,
preview, Cart Add, and Checkout Readiness. It does **not** prove provider
choice, bucket configuration, deployment readiness, retention, scaling, cost,
durability, or regional policy.

## Unresolved deployment handoff values

| Required deployment value | Status | Responsible approval/input |
|---|---|---|
| Production provider | **UNRESOLVED** | Human architecture approval |
| Private storage binding/bucket/container identifier | **UNRESOLVED** | Deployment approval |
| Storage credential or binding mechanism | **REQUIRES APPROVAL** | Deployment/security owner |
| Receipt/media retention for unattached temporary drafts | **UNRESOLVED** | Business/operations approval |
| Retention for order-attached content | **UNRESOLVED** | Business/operations approval |
| Temporary preview-access TTL | **UNRESOLVED** | Security/architecture approval |
| Cleanup scheduler/runtime | **UNRESOLVED** | Deployment/operations approval |
| Environment-specific binding values | **REQUIRES APPROVAL** | Deployment owner |
| Secret/config owner | **REQUIRES APPROVAL** | Security/deployment owner |
| Deployment owner | **REQUIRES APPROVAL** | Project owner |
| Activation approval | **REQUIRES APPROVAL** | Authorized release owner |

No credentials, account IDs, service-role keys, API keys, tokens, or secret
access keys belong in Git. Any approved secret or binding value is supplied
outside the repository at deployment time. This handoff deliberately does not
invent production environment-variable names.

The production bucket/container/binding identity is **UNRESOLVED**. The only
logical requirement is one approved private customer-media storage
location/binding. No placeholder name is authorized.

Production receipt/media retention is **UNRESOLVED**. The test-only timestamps
used by Tasks 6.1–6.4 do not establish a production duration. Temporary draft
retention and order-attached preservation have different semantics and require
separate approved values.

Preview authorization TTL is **UNRESOLVED**. It is distinct from receipt
retention expiry and from any provider signed-link lifetime. The current
provider-neutral capability remains `receiptId` plus `expiresAt` with mandatory
server-side owner verification.

The production cleanup scheduler/runtime is **UNRESOLVED**. Approved
application semantics are:

```text
eligible lifecycle → atomic cleanup claim → cleanup_pending
→ provider delete → cleanup_completed / cleanup_failed → retry
```

This task adds no cron, worker, queue, or schedule.

## Known operational boundary

An object-provider write can succeed while its connection/result fails before
receipt metadata exists. A private orphan object is therefore a known Task
5.5/6.2 boundary. Automatic provider-side orphan reconciliation is **NOT
IMPLEMENTED**. The future approved provider/deployment design must address its
operational reconciliation/cleanup approach without exposing private locators.

## What can continue; what remains stopped

Provider-neutral/local customization work that does not require production
persistence or provider activation may continue under separately approved task
scope, including local draft/UI work and offline tests with explicit fixtures.

The following remain **STOPPED** until a separate provider architecture and
deployment decision is approved:

- production customer-upload activation;
- production preview adapter;
- production object storage deployment;
- provider adapter implementation;
- provider bucket/container/binding configuration.

## Related boundaries retained

- C1 remains **41/61**.
- C1 Task 3.5 remains **BLOCKED**.
- **BACKFILL AUTHORIZED: NO**.
- This handoff does not modify C1 Tasks 3.5 → 3.6 → 3.7 → 3.8 → 7.4 or
  C1 immutable order snapshot ownership.
