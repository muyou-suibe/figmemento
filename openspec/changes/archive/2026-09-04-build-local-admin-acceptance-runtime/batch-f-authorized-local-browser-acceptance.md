# Batch F — Authorized Local Browser Acceptance

## Scope and safety

This artifact records local/test-only browser acceptance for
`build-local-admin-acceptance-runtime`. It uses the real Admin login and
signed HttpOnly session boundary against process-memory Catalog and synthetic
Orders data. It is not production Admin acceptance, persistence evidence, or
provider availability evidence.

Remote Supabase, Storage, production databases, migrations, deployment, DNS,
Cloudflare, and production credentials are out of scope. No credential value,
cookie value, token, provider URL, or complete environment object is recorded.

## SETUP

- Backend classification: `LOCAL_TEST`
- Runtime selector: `ADMIN_ACCEPTANCE_SOURCE=local_fake`
- Runtime mode: development Worker, supplied by the runtime; `NODE_ENV` is not
  manually configured.
- Admin password: a temporary local-only value was supplied by the human for
  this acceptance run; value is never recorded or printed.
- Password history correction: the initial password-presence assumption was
  not reliable and was superseded by human verification. No claim is made
  that a usable password was preconfigured before the acceptance run.
- Local environment check: `.env.local` exists and is Git-ignored. The
  selector was supplied only for this Worker process and the temporary local
  password was supplied outside committed source.
- Admin session: the existing real `/admin/login` route issues the signed
  HttpOnly `photogift-admin-session` cookie.
- Local Catalog: deterministic process-memory graph; mutations are not durable
  and reset after process restart.
- Local Orders: deterministic synthetic read-only projection.
- Provider isolation: Batch E deterministic server-side sentinels are the
  authoritative server-provider evidence; this Batch F records browser
  observation separately.

### Required local configuration

The Admin password may be supplied through a local ignored environment file or
a temporary Worker process environment. The acceptance run used a temporary
local-only value. No password value is committed or recorded. The non-secret
selector below was supplied for this acceptance run without printing or
copying any secret:

```dotenv
ADMIN_ACCEPTANCE_SOURCE=local_fake
```

No Supabase, Storage, production Order, carrier, payment, or other provider
credential is required for this local acceptance path. Existing `.env.local`
provider keys, if present for unrelated local work, remain unprinted and are
not used by the local Admin source.

### Start and observation procedure

1. From the repository root, start the real development Worker with the local
   selector supplied in the process environment, without changing `.env.local`:
   `ADMIN_ACCEPTANCE_SOURCE=local_fake npm run dev`.
2. Read the actual URL printed by the Worker; do not assume a port if the
   default is occupied.
3. Confirm the local backend classification is `LOCAL_TEST` and the Admin
   password is present without printing its value.
4. Use the real `/admin/login` form and `/api/admin/login`; do not inject a
   cookie or session token.
5. Record browser-side local acceptance and whether any production-data
   fallback is observed. This is browser observation, not a replacement for
   Batch E server sentinels; do not claim DevTools alone proves server-side
   provider isolation.
6. Use only synthetic local data and bounded local controls. Do not claim
   persistence after restart or production readiness.
7. Restore the local selector after any safe invalid-selector check and clean
   up temporary processes/configuration after acceptance.

## REAL AUTHORIZATION

Evidence type: `HUMAN_BROWSER_ACCEPTANCE`

Status: PASS.

- `/admin/login` used: PASS
- `/api/admin/login` used: PASS
- Real signed session established: PASS
- Unauthorized `/admin/products` redirect: PASS — redirected to `/admin/login`
- Unauthorized `/admin/orders` redirect: PASS — redirected to `/admin/login`
- Password value recorded: NO
- Cookie/token value recorded: NO

## PRODUCTS DESKTOP

Status: PASS — target viewport 1280px.

- Local/test-only notice: PASS
- Catalog administration and navigation: PASS
- Category, Product, Option/OptionValue, Variant/SKU editors: PASS
- ProductAsset, FulfillmentConfig, and existing CustomizationField controls:
  PASS
- Lifecycle controls present without destructive action: PASS
- Safe invalid-selector state: PASS
- No production-data claim: PASS
- No horizontal overflow: PASS
- Data authority: local process-memory Catalog only.

## PRODUCTS 375

Status: PASS — target viewport 375px.

- Header and local notice readable: PASS
- Editor groups wrap and controls usable: PASS
- Long SKU/reference content wraps: PASS
- No horizontal overflow: PASS

## ORDERS DESKTOP

Status: PASS — target viewport 1280px.

- Local/test-only notice and synthetic data: PASS
- 20 + 4 pagination: PASS
- Filters and export: PASS
- Long order reference/product/customization wrapping: PASS
- Bounded unavailable controls visible: PASS
- No production-data claim: PASS
- No horizontal overflow: PASS

## ORDERS 375

Status: PASS — target viewport 375px.

- Cards, filters, pagination, and disabled controls usable: PASS
- Long content wraps: PASS
- No horizontal overflow: PASS

## KEYBOARD

Status: PASS — human browser acceptance.

Tab order, visible focus, labels, links, filters, editors, details, and
pagination must be usable without a focus trap.

## REDUCED MOTION

Status: PASS — human browser acceptance; `prefers-reduced-motion: reduce` was
`true`.

Content, editors, controls, and focus must remain visible and usable without
stuck opacity/transform or continuous nonessential motion.

- Products: PASS
- Orders: PASS

## COARSE POINTER

Status: PASS — human browser acceptance; `pointer: coarse` and `hover: none`
were both `true`.

Navigation, editors, filters, pagination, export, and bounded controls must be
directly tappable without hover-only essential actions.

- Products: PASS
- Orders: PASS
- No hover-only dependency: PASS

## SAFE ERROR

Status: PASS — human browser acceptance.

With a clearly invalid development selector and the same local Admin password,
the Products and Orders pages must show bounded configuration errors without
fallback to production, provider details, stacks, secrets, or environment
values. Restore `local_fake` afterward.

- Products bounded error: PASS
- Orders bounded error: PASS
- No production fallback: PASS
- No provider detail, stack, path, environment, or secret leakage: PASS
- Restored `ADMIN_ACCEPTANCE_SOURCE=local_fake`: YES

## BROWSER NETWORK OBSERVATION

Status: PASS — human browser observation.

- Local-only acceptance output observed; production-data fallback: NOT
  observed.
- Exact browser request counts are not asserted by this artifact.

These observations do not claim that DevTools proves server-side isolation;
Batch E deterministic provider sentinels remain the server-side evidence.

## SERVER PROVIDER EVIDENCE REFERENCE

Batch E recorded deterministic authorized local composition sentinels with zero
Supabase, remote fetch, Storage, signed-URL, production Orders loader, upload
configuration, and Catalog provider calls. Batch F does not replace or inflate
that evidence.

## HUMAN_REQUIRED

Record any browser capability that cannot be authoritatively verified by the
available automation. Do not replace manual browser evidence with CSS/source
inference.

- Authorized Admin password entry: completed by the human directly in the
  local browser; the value was not sent in chat, printed, or recorded.
- Unresolved capability: NONE.

## Restart and privacy boundary

Local Catalog commands are process-memory only and reset after Worker restart.
Local Orders are read-only synthetic fixtures. No Admin password, signed
cookie, customer PII, private upload locator, provider secret, or production
data is recorded here.
