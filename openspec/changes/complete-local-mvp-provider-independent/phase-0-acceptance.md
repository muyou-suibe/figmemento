# Phase 0 final acceptance evidence

Status: PASS — local Phase 0 gate accepted.

This artifact records acceptance evidence for K08 and H19 only. It does not
claim any Phase 1, Provider, Owner Configuration/Policy, or Phase 2 work.

## K08 configuration boundary

Focused K08/H19 contracts passed 24/24. The matrix covered:

- valid retained local-development composition and fixture/test composition;
- unknown runtime, production/local authority, mixed project, wrong project,
  wrong marker, malformed and non-loopback endpoints;
- missing selected-capability secrets and invalid guest, image-helper, and
  Order-capability configuration;
- provider-backed authority deferral and provider-credential presence not
  activating a provider;
- browser authority-selector rejection;
- one canonical tri-state authority seam and public/client secret boundary;
- Catalog, Cart, Checkout, Order, Payment, Fulfillment, Tracking, Upload,
  Auth, and Admin consumer composition checks.

The relevant public/client source scan passed: 45 client-marked modules were
checked, with zero forbidden secret-name findings in client or public
projection surfaces. `.env.local`, runtime/build directories, customer data,
and database dumps are not tracked.

## H19 Admin settings boundary

The approved mutable allowlist is exactly nullable `supportEmail`. Brand,
site, deployment, provider activation, and digital-delivery policy are
read-only projections. No generic settings bag or provider/secret controls
are exposed.

Focused H19 contracts passed 10/10, including authorization-before-repository
construction, input validation, CAS/idempotency semantics, safe projection,
canonical digital policy, adapter RPC allowlist, and migration security.
The settings-page rendered contract passed 1/1.

## Real retained local database evidence

The exact retained development database was positively identified by project
label, local-commerce workdir, database container name, running state, and
the retained PostgreSQL data volume. The retained database acceptance passed
2/2:

- PostgreSQL 17, exact project identity/marker, schema and security boundary;
- durable support-email authority across null, set, clear, and a separate
  child-process read-back.

The local runtime acceptance passed on loopback port 3012:

- signed-out Admin API: 401; signed-out page: 307 to `/admin/login`;
- signed Admin login: 200 with an HttpOnly cookie;
- authorized settings GET: 200 with `supportEmail: null` and read-only data;
- authorized update rendered the temporary value and the read-only state;
- final authorized clear returned 200 and durable `supportEmail: null`.

The real two-process H19 race passed using the retained DB. At one shared
expected version, one writer committed version 15 and the other returned
`version_mismatch`; exact same-key/context replay returned the original result
with `replayed: true`; changed same-key context returned
`idempotency_mismatch`; final cleanup committed version 16 with
`supportEmail: null`. No credentials or raw secrets were printed.

An invalid local-persistent runtime endpoint is rejected as unavailable by
the K08 fail-closed matrix; no fallback repository is selected. The SQL
function performs the settings update and accepted action/audit insert in one
database statement transaction, so an unsuccessful statement cannot publish a
partial settings mutation.

## Support-email authority

The null-versus-conflicting-environment and persisted-value-versus-conflicting
environment cases passed in the real local-persistent support acceptance.
The persisted value remained authoritative across a child process. FAQ,
Privacy, Shipping/Returns, and Terms were mechanically checked to consume
`getSupportContactTextFromAuthority`; they do not directly read
`NEXT_PUBLIC_SUPPORT_EMAIL`.

Final retained support email: `null`.

## Read-only projections and provider deferral

Digital Delivery policy is read through
`app/application/local-persistent-digital-delivery-policy.server.ts` by both
the Admin projection and active grant/revocation implementations. K08
provider activation remains sourced from the canonical runtime composition;
placeholder credential presence does not change the coarse activation state.
No provider credential names or values render.

## Migration integrity

The read-only source/manifest/ledger/marker verification passed:

- PostgreSQL major: 17
- schemaVersion: 38
- SQL migration files: 38
- manifest entries: 38
- ledger rows/max version: 38/38
- pending migrations: 0
- source checksum mismatches: 0
- ledger checksum mismatches: 0
- project marker match: true
- migration 0038 checksum:
  `9596207bfc8c8cdaf8fa3e767f95e9cf6f336b9ee42409bd866a64fdd25bc25c`
- migration 0039: absent

No migration was executed or modified during this gate. Migrations 0001–0038
remain immutable.

## Rendered and regression evidence

The authorized validation sequence passed from the final Phase 0 tree:

- focused K08/H19 contracts: 24/24
- real retained DB acceptance: 2/2
- Admin settings rendered contract: 1/1
- `npm run lint`: PASS (one pre-existing Next image warning)
- `npm run typecheck`: PASS
- `npm run test:offline`: 937/937 PASS
- fresh `npm run build`: PASS
- `npm run test:rendered`: 12/12 PASS
- `npm run verify`: PASS
- `npx openspec validate --all --strict`: 24/24 PASS
- `git diff --check`: PASS
- evidence artifact trailing-whitespace scan: PASS

The current rendered 12/12 result is present-day regression evidence and is
separate from the historical rendered 7/11 record.

## Scope and remote status

Phase 1: not started. Provider activation: none. Phase 2: none. Frozen audit
documents: unchanged. Remote Supabase, production databases, deployment,
real Auth, payment, email, carrier, Storage/provider, and Supplier services
were not accessed.

At evidence authoring time the local implementation branch remained ahead of
the remote implementation branch; normal remote synchronization is a later
authorized publication step. The remote `main` branch remains unchanged.
