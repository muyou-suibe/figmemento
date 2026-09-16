# Task 5.7 — single-container recovery evidence

Date: 2026-09-12. Business progress remains 32/85; Task 5.7 unchecked.

## Authorized load shedding

Stopped only container `9efc79decef81682be563534deb70ff398fdf95f1af0e173a970623ac97b688a`
(`supabase_analytics_figmemento-local-commerce-test-run-20260`).
One stop invocation: graceful timeout 20 seconds, host timeout 35 seconds;
exit 0, elapsed 20274 ms. Subsequent inspect confirmed exited/not running.
No other container stop, volume removal, reset, prune, or historical data change.

After a 10-second settling period, five rounds each used a 5000 ms timeout:

| Round | docker version ms | docker info ms | docker ps ms |
| --- | ---: | ---: | ---: |
| 1 | 32 | 462 | 89 |
| 2 | 16 | 96 | 89 |
| 3 | 17 | 84 | 82 |
| 4 | 16 | 80 | 86 |
| 5 | 16 | 80 | 84 |

All exited 0, without timeout or stderr. Prior measurements included a 5009 ms
docker ps timeout. Stats completed in 2295 ms; maximum sampled CPU was 0.63%.
Host load was 5.02/3.74/7.28; memory_pressure reported 39% free.
This is evidence of improved responsiveness, not proof of exclusive causation.

## New disposable stack

- Run: `run-24f7c009`.
- Project: `figmemento-local-commerce-test-run-24f7c009`.
- Workdir: `local/commerce/runtime/disposable/run-24f7c009`.
- Ports: shadow 55910, API 55911, DB 55912, Studio 55913, SMTP 55914,
  helper 55915; temporary app 55916.
- PostgreSQL: 17.6; DB container prefix `bd1b2ee3f03b` with exact workdir label.
- Ledger-aware startup: exit 0, 29899 ms; no seed.
- Actual ledger: versions 0001–0012, source/manifest checksums matched;
  migration planner skip 12, pending 0. Existing migration files unchanged.

Five consecutive stability rounds passed (5000 ms bound per operation):

| Round | PG readiness ms | SELECT 1 ms | Marker ms | API ms | Storage ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 64 | 50 | 49 | 58 | 8 |
| 2 | 64 | 55 | 47 | 4 | 2 |
| 3 | 57 | 56 | 58 | 3 | 2 |
| 4 | 47 | 106 | 127 | 15 | 10 |
| 5 | 126 | 59 | 49 | 4 | 2 |

PG accepted connections; SELECT returned 1; marker returned true;
API and Storage status returned HTTP 200, with no timeouts.

## Actual Worker acceptance: blocked, not passed

Temporary harness: `/private/tmp/figmemento-24f7c009-worker-smoke.mjs`.
Synthetic Catalog/configuration and draft setup was confined to the new run.
Launched actual `npm run dev` and a separate Node/sharp helper.

Initial IPv4 readiness attempt failed because the server listened on localhost.
After using localhost, session endpoint returned 200 but upload returned 404.
After explicitly including process environment in Worker bindings, the session
endpoint returned 200 and real multipart upload returned **503**.
No upload/crop/preview success is claimed.

Installed vinext dev resolves NODE_ENV to development unless Vite mode is test
(`node_modules/vinext/dist/index.js`, config hook). The disposable project is
test. The existing composition rejects unequal runtime/project environments
(`app/application/local-persistent-commerce-composition.server.ts`).
An offline reproduction returned ready for test/test and unavailable with
`persistent_runtime_required: LOCAL_COMMERCE_ENVIRONMENT` for development/test.
This explains a configuration rejection path consistent with the observed 503;
no private HTTP diagnostic payload or credential was printed.

Do not weaken this check or rewrite the marker to obtain a passing result.
Next required decision: an explicit test-mode actual vinext/Worker launch seam
that preserves the test project identity and existing authority checks.

SSRF/redirect, full failure matrix, response-loss/restart recovery, stale
generation, independent uploads, and configured-item/Cart/readiness acceptance
were not completed in this run. Task 5.7 must remain unchecked.

Temporary helper and Worker process groups were terminated; read-only lsof
confirmed no listeners on 55915/55916. The new Docker stack and data remain.
Frozen runs run-75224a5b and run-f1abf734 were not restarted or modified.

## Validation and scope

OpenSpec strict: 23/23 PASS. git diff --check: PASS. No staged files.
Full application regression/verify was not run for this infrastructure-only
blocked attempt. No business implementation, migration, environment file,
checkbox, Catalog authority, or Supplier semantics change. No remote Supabase,
deployment, real provider, git stage/commit/push. Task 6 not started.
