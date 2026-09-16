# Batch 1 local commerce baseline

Recorded: 2026-09-10

## Safety boundary

- Repository: `/Users/youmu/Documents/个性化礼品定制独立站`
- Independent workdir: `local/commerce/`
- Root Supabase project was not read, reset, seeded, or reconfigured. Its
  project ID is `supabase`; its existing API/DB ports are `54321/54322` and
  remain outside this project.
- No environment file was overwritten and no pre-existing service was stopped.
- No remote Supabase project, business provider, migration, reset, seed, or
  deployment was accessed or executed; only the new local Docker stack was
  started and stopped for this batch's preflight.
- Reserved ports for this project are `55420–55425`; they are not taken from
  the root project's `5432x` range.

## Initial observed state

- Existing process/port audit observed listeners on `3000`, `54321`, `54322`,
  `54324`, and `54342`.
- Docker Desktop reported version `29.7.2` and the daemon was available.
- The repository contains a locked local `supabase` dev dependency. A global
  `supabase` command is not on PATH; the Batch 1 doctor uses only the locked
  repository binary (`supabase@2.114.0`) and reports it without printing
  credentials.
- Before this Batch 1 change, the working tree was already dirty with
  pre-existing application/spec work. No existing file was cleaned or
  overwritten by this batch.

## Independent stack preflight evidence

- Dedicated `figmemento-local-commerce` start: PASS.
- Dedicated health/status check: PASS.
- Dedicated stop: PASS; volumes were retained and existing root services were
  not stopped.
- No migration or seed execution occurred. The config keeps both disabled.
- Docker image set observed for the locked PostgreSQL 17 stack:
  `public.ecr.aws/supabase/postgres:17.6.1.158`,
  `public.ecr.aws/supabase/postgres-meta:v0.97.0`,
  `public.ecr.aws/supabase/gotrue:v2.195.0`,
  `public.ecr.aws/supabase/postgrest:v16.1`,
  `public.ecr.aws/supabase/storage-api:v1.69.0`,
  `public.ecr.aws/supabase/realtime:v2.124.4`,
  `public.ecr.aws/supabase/edge-runtime:v1.74.3`,
  `public.ecr.aws/supabase/kong:2.8.1`,
  `public.ecr.aws/supabase/studio:2026.08.10-sha-5b68af1`,
  `public.ecr.aws/supabase/mailpit:v1.30.2`,
  `public.ecr.aws/supabase/logflare:1.50.2`, and
  `public.ecr.aws/supabase/vector:0.53.0-alpine`.
- The new development marker is an ignored local runtime artifact at
  `local/commerce/runtime/project-marker.json`; it binds the exact project,
  schema, environment, run ID, and PostgreSQL version.
- Retained-development reset refusal: PASS; the wrapper returned
  `retained_project` before any CLI reset operation.
- Environment safety matrix: PASS, `9/9`; it covers missing/remote/port-drift
  configuration, occupied ports, marker initialization, exact disposable
  identity, old-run/missing-marker/label-only/remote reset rejection, and
  credential-free diagnostics.

## Disposable test stack acceptance evidence

- Unique run ID: `run-20260910cafe5678`.
- Derived project ID: `figmemento-local-commerce-test-run-20260910cafe5678`.
- The per-run CLI workdir was prepared at
  `local/commerce/runtime/disposable/run-20260910cafe5678/`; its generated
  `supabase/config.toml` contains the derived project ID rather than the
  retained-development project ID.
- Start: PASS. Health before reset: PASS. Marker initialization with explicit
  new-project confirmation: PASS.
- Retained-development reset: refused with `retained_project` before the CLI
  reset operation. Disposable reset with a missing marker: refused with
  `marker_required`; label/execute without the disposable allow and
  confirmation flags: refused with `disposable_confirmation_required`.
- Disposable reset: PASS with the exact marker, run ID, disposable project
  identity, explicit confirmation, allow flag, and execute flag. Health after
  reset: PASS. Stop: PASS, with the disposable volumes retained.
- A read-only query against the derived disposable database reported
  `local_commerce_schema=0`, `local_commerce_tables=0`, and `public_tables=0`.
  The checked-in disposable config disables migrations and seed, and the
  workdir contains no migration or seed SQL; no business schema was created.
- The unique marker and per-run workdir are ignored runtime artifacts. No
  remote Supabase project, provider, root project, or existing service was
  accessed or stopped.

## Historical and current validation evidence

The change contract preserves the previously recorded historical baseline:

- lint: PASS
- typecheck: PASS
- offline: `892/892` PASS
- build: PASS
- rendered: `7/11` historical result with four pre-existing RSC failures.

The exact four failure names were not present in the checked-in baseline
documents available during this read-only audit; they remain historical
evidence and are not reclassified or hidden by Batch 1.

Task 1.1 remains open until those four historical names, causes, and statuses
are recovered from an authoritative baseline record. Task 1.3 is complete from
the disposable-stack evidence above; no task beyond Batch 1 is implied.

Before implementing this batch, the current repository validation was also
observed as lint PASS (0 errors and one pre-existing warning at
`app/storefront/ProductCustomizationImageField.tsx:496`), typecheck PASS,
offline `892/892` PASS, build PASS, and rendered `11/11` PASS.
