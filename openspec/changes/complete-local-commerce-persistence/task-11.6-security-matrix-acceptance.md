# Task 11.6 security field and permission matrix

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

## Exact target

- Run/project: `run-93f6c1a2` / `figmemento-local-commerce-test-run-93f6c1a2`
- PostgreSQL: 17
- Migration ledger: 37/37; pending: 0; migration 0038 absent
- Full 43-character business project identity was verified through the accepted
  projected-label bootstrap before transient credentials were obtained.
- No transient credential, token, cookie or private locator is recorded here.

## Actor and resource matrix

| Surface | Actor/credential | Expected | Actual external result | Durable result | Status |
| --- | --- | --- | --- | --- | --- |
| Cart/Draft/media/Order/history | Foreign guest owner | Bounded rejection | Empty/not-found/404 projections in the accepted real HTTP and restart matrices | No foreign binding or mutation | PASS |
| Cart/Draft/media/Order/history | Foreign member session | Bounded rejection | Protected reads and writes rejected | No claim/merge/transfer | PASS |
| Guest resources | Customer session with selectors | No authority crossing | Existing guest-first purchase-owner and member-order tests rejected crossing | Original guest owner retained | PASS |
| Customer resources | Guest context with selectors | No authority crossing | Existing owner verification returned bounded rejection | Original customer owner retained | PASS |
| Order/item/media/manifest | Item or receipt selector from another Order | Reject exact-pair mismatch | Canonical item/history/media/manifest contracts rejected cross-Order pairing | No snapshot, review, manifest or action binding changed | PASS |
| Admin reads/mutations | Missing, expired or forged signed Admin cookie; browser `admin=true`/source selectors | Deny | Redirect/401/403 and server-selected source | No Admin commerce mutation | PASS |
| Fulfillment operator | Customer/Admin-like or missing operator context | Deny | Existing operator verifier and same-origin contracts rejected | No review/preview lifecycle mutation | PASS |
| Tracking operator | Customer/Fulfillment-like or missing tracking context | Deny | Existing tracking authority contracts rejected | No Shipment event mutation | PASS |
| Supplier | Browser/customer/supplier-like values | Unsupported | Persistent supplier entry returned bounded unavailable | Zero supplier tables/functions and zero supplier effects | PASS |

## Credential and replay matrix

| Credential | Cases | Actual | Durable result | Status |
| --- | --- | --- | --- | --- |
| Signed guest context | valid, forged, expired, wrong owner/project | Only exact valid owner recovered resources | No foreign owner/resource binding | PASS |
| Customer session | valid, unknown, forged, expired, revoked, foreign | Invalid cases unauthenticated/not-found; logout remained revoked after another Worker | Session hash remained server-only; no replay disclosure | PASS |
| Order capability | valid, forged, expired, another Order, reference/email/UUID only | Invalid selectors rejected; exact authorized replay remained stable | No new grant or Order | PASS |
| Download ticket/grant | unknown, forged, expired, spent, revoked, replaced, foreign owner/Order/item/version, losing final-quota ticket | No protected bytes; spent/losing tickets remained unusable | No revival, refund or new grant | PASS |
| Idempotency/action selector | valid caller vs revoked/foreign caller | Fresh authorization preceded protected replay | Unauthorized callers received no committed result | PASS |

## Origin, source and legacy entry points

- The complete route inventory classifies every current persistent mutation as
  canonical, explicitly deferred, unsupported or legacy-isolated.
- Missing/foreign/malformed Origin cases are rejected by each established
  browser mutation boundary before privileged construction. Same-origin success
  remains subject to owner/session/Admin/operator authority.
- Browser `source`, `projectId`, `ownerId`, `customerId`, actor/role/provider,
  fulfillment, shipping, preview, service-role, locator, amount, discount and
  shipping claims do not alter server composition or commercial authority.
- Normalized `/api/orders` remains 503; email/order lookup, old download,
  legacy Admin mutation and persistent supplier entry cannot reach this
  commerce authority.
- Task 11.5 DB-outage evidence indexes fail-closed behavior with no memory,
  fixture or `local_fake` fallback across persistent domains.

## Complete database permission inventory

The exact-run dynamic inventory discovered rather than hand-selected:

- 46 `local_commerce` tables/partitions: RLS enabled on all 46.
- 44 policies: every discovered policy is service-role-only.
- PUBLIC, anon and authenticated have no direct CRUD privilege on any table.
- 368 direct anon/authenticated PostgREST table method probes returned denial or
  the intentionally non-enumerating empty RLS read projection; no write landed.
- 49 functions: PUBLIC, anon and authenticated have no EXECUTE privilege on any
  function.
- Every SECURITY DEFINER function has a fixed `pg_catalog`,
  `pg_catalog,local_commerce` or `local_commerce,pg_catalog` search path.
- Representative live PostgREST invocation of the restricted identity RPC was
  rejected for anon and authenticated roles.
- Service-role access remained server-only and was used only after exact
  run/project/marker verification.

## Private Storage matrix

- `local-commerce-private` remained private.
- A new unique synthetic probe object was created only for this audit.
- Unauthenticated, anon and authenticated actors were tested for list, read of
  existing/missing paths, overwrite and delete: 15 operations total.
- List/delete 200 responses were accepted only when the exact response was the
  empty RLS result. Existing and missing read statuses matched for each actor.
- After every browser-role attempt, service-role readback matched the original
  SHA-256. The exact synthetic probe was then removed and absence verified.
- No retained customer object was targeted by overwrite/delete testing.
- Customer bytes continue to flow only through authorized input-preview,
  production-preview or ticketed digital-delivery application boundaries.

## Field, log and client-delivery audit

- Existing success/failure HTTP contracts cover bodies, headers, redirects,
  Set-Cookie behavior, safe errors and download headers. They reject raw
  password/session/capability hashes, tokens, service credentials, SQL/provider
  errors, Storage locators and unnecessary owner/action digests.
- Durable account/session, action, media, fulfillment, Shipment and digital
  audit tests retain bounded actor/action/version IDs without raw bearer values.
- Task 11.4/11.5 logs and responses were checked against their transient
  credentials and private selectors; no value was reported or persisted as
  evidence.
- After a fresh production build, 68 actual `dist/client` files were scanned
  byte-for-byte for the exact transient service credential, JWT signing secret,
  generated anon/authenticated JWTs and private probe locator: zero matches.
- Server-only adapter/authority tests keep database, Storage, Docker, operator
  and service-role composition outside browser imports.

## Remote-provider sentinel

Only the exact loopback Supabase API/Storage and local PostgreSQL container were
used. No hosted Supabase, production database, Auth provider, payment provider,
email provider, carrier, Supplier provider or deployment was invoked.

## Evidence index

- `tests/database/local-commerce-task-11.6-security-matrix.mjs`
- `tests/database/local-commerce-task-11.4-authority-launcher.mjs`
- `task-11.1-full-recovery-evidence.json`
- `task-11.4-concurrency-acceptance.md`
- `task-11.5-fault-injection-acceptance.md`
- `task-10.8-browser-experience-evidence-index.md`
- Task 7.7 fulfillment security evidence and accepted Task 8/9 HTTP matrices
- Focused security contracts: 125/125 PASS

No application implementation or schema was changed by this audit.

## Final validation

- Focused security contracts: 125/125 PASS
- Exact-run DB/RLS/RPC/Storage/client-build matrix: PASS
- Lint: PASS (0 errors; one pre-existing `no-img-element` warning)
- Typecheck: PASS
- Offline tests: 918/918 PASS
- Fresh build: PASS
- Client build secret scan: 68 files, zero transient-secret matches
- Rendered tests after fresh build: 11/11 PASS
- `npm run verify`: PASS
- OpenSpec strict: recorded after checkbox update
- `git diff --check`: recorded after checkbox update
- Staged paths: 0
