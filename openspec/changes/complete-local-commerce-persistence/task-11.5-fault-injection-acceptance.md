# Task 11.5 locatable fault-injection acceptance

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

## Exact target

- Run/project: `run-93f6c1a2` /
  `figmemento-local-commerce-test-run-93f6c1a2`
- PostgreSQL: 17
- Ledger: 37/37; pending migrations: 0; no 0038
- Exact project marker, workdir, service identities and private Storage were
  verified by `local-commerce-task-11.4-authority-launcher.mjs` before each
  focused real-stack probe.
- No reset, reseed, migration, remote service or production provider was used.

## Fault matrix

| Failure location | External/durable evidence | Result |
| --- | --- | --- |
| Application before Order replay probe | HTTP 503, zero purchase rows; retry on the normal Worker committed one Order | PASS |
| Order probe response loss | HTTP 503 after the exact probe transport loss; retry resolved durable state without duplicate Order | PASS |
| Application before Order commit | HTTP 503, zero Order/item/grant/receipt effects; retry committed once | PASS |
| Order commit response loss | First response unavailable after one commit; exact retry returned the original Order; a third replay remained stable | PASS |
| Database endpoint outage | A Worker configured to an unbound loopback endpoint returned 503 for sign-up and Cart; exact DB snapshot remained unchanged; no fake fallback | PASS |
| Database transaction failure | A real FK failure after tentative owner/Order/Payment inserts rolled back the complete transaction; owner/session/Cart/Order/Payment snapshot remained exact | PASS |
| Preview helper failure | Real preview publication returned unavailable and created no ready preview or manifest | PASS |
| Preview Storage write failure | No false ready state; the same durable operation remained retryable | PASS |
| Preview Storage read failure/mismatch | Readback failure or digest mismatch produced no publication and no ready projection | PASS |
| Preview DB ready failure | No partial ready/publication state; retry remained bound to the durable action | PASS |
| Digital publication Storage failure | Durable version remained pending and the same action retry completed it; no duplicate version | PASS |
| Digital publication readback mismatch | Version became failed/non-current; no false ready version or customer grant | PASS |
| Metadata/orphan reconciliation | Cleanup-first made exact read/reconcile/copy unavailable and left Draft/Order attachment facts unchanged; late publish could not resurrect bytes | PASS |
| Cleanup DELETE failure and retry | Exact new synthetic operation: injected invalid Storage credential yielded unavailable, lease `failed`, bytes retained; retry completed with attempts=2 and `NoSuchKey` readback | PASS |
| Download object-open/storage failure | Zero bytes, unchanged quota and unconsumed ticket before claim | PASS |
| Download content/size mismatch | Zero bytes and zero claim/quota mutation | PASS |
| Database failure at claim | Ticket, grant quota and delivery-attempt transaction retained the pre-claim state | PASS |
| Claim versus revoke/replacement | Zero stale bytes, zero quota consumption and no ticket mutation when revoke won | PASS |
| Stream failure after claim | Durable outcome recorded `failed`; ticket stayed consumed and quota stayed charged | PASS |
| Stream-result persistence failure | Durable outcome remained truthfully `unknown`; no refund or ticket resurrection | PASS |
| Client disconnect / process crash after claim | Result remained `unknown` (or positively observed `failed`), never fabricated `streamed`; spent ticket could not replay | PASS |

## Exact focused process evidence

- DB outage Worker PID 58334 used an unbound loopback endpoint. Sign-up and
  Cart both returned HTTP 503; the persistent snapshot was unchanged.
- Cleanup retry operation `acb2c01a-8da5-4267-91b4-3b7e99354e59` was created
  during the exact invocation. Both DELETE attempts passed project/owner,
  locator-digest, active-lease, zero-attachment and zero-foreign-reference
  guards. Only its derivative object was eligible.
- Order fault/retry acceptance used distinct injected and recovery Worker PIDs
  and observed one new Order for each logical command, including commit-loss.
- Preview helper/Storage/readback and publication-versus-customer matrices used
  two live Workers (recorded pair 53294/53167).
- Digital download/revocation/quota and stream-failure acceptance used
  independently started Workers and explicit post-claim crash/restart
  boundaries, beginning with recorded restart 56219 → 56290.

## Safety outcomes

- Every pre-commit failure produced zero partial purchase, lifecycle, Shipment,
  ticket or quota state.
- Every post-commit response loss recovered by durable action/operation identity
  and never by process memory, payload guessing or fake fallback.
- Unavailable dependencies never returned a fake ready publication or media
  projection.
- Raw credentials, cookies, tickets, private locators, SQL/provider errors and
  service secrets were absent from public responses and recorded evidence.
- No Supplier persistence or provider action occurred.

## Acceptance entry points

- `tests/database/local-commerce-task-11.5-db-outage.mjs`
- `tests/database/local-commerce-order-http-acceptance.mjs`
- `tests/database/local-commerce-copy-cleanup-acceptance.mjs`
- `tests/database/local-commerce-customer-preview-http-acceptance.mjs`
- `tests/database/local-commerce-digital-grant-http.mjs`
- `tests/database/local-commerce-task-11.4-authority-launcher.mjs`
- Acceptance-only transforms in
  `tests/database/local-commerce-test-worker.mjs`

Focused static failure contracts: 91/91 PASS after aligning the stale preview
fixture with the already-established server-owned `targetManifestVersion` and
reservation `manifestVersion` contract. Production preview code was unchanged.

## Final repository validation

- Focused Task 11.5/static fault contracts: 91/91 PASS
- Lint: PASS (0 errors; one pre-existing `no-img-element` warning)
- Typecheck: PASS
- Offline tests: 918/918 PASS
- Fresh build: PASS
- Rendered tests after the fresh build: 11/11 PASS
- `npm run verify`: PASS
- OpenSpec strict: 23/23 PASS
- `git diff --check`: PASS
- Staged paths: 0
