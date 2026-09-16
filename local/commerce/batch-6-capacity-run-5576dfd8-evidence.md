# Batch 6 capacity recovery and implementation boundary — 2026-09-12

## Scope and result

Current-turn owner authorization: attachment `3a9ce0cc-f134-4caf-9b7f-7c5a8adc21d4`.
Only historical `run-cef496a3` was parked. Exactly one new disposable run,
`run-5576dfd8`, was created. Infrastructure acceptance passed. Business Batch 6
has NOT passed; 6.1–6.7 remain unchecked and progress remains 33/85.
These measurements were observed during this turn; they do not rewrite previous
failed infrastructure gates or establish Order/payment acceptance.

## Historical stack eligibility

Exact workdir: `local/commerce/runtime/disposable/run-cef496a3` in this repository.
Preparation/marker identify `figmemento-local-commerce-test-run-cef496a3`,
`disposable_test`, PostgreSQL 17. Docker's shortened project label was
`figmemento-local-commerce-test-run-cef49`; membership was checked using the exact
workdir, not that truncated name. No active startup/acceptance/helper or observed
application connection depended on its ports. Historical evidence remained in
`media-authority-evidence.json` and the change's
`media-authority-completion-acceptance.md`. Later retained Task 5.7 evidence on
`run-24f7c009` superseded the need to keep this older stack running.

## Exact parking inventory

| Service | Full container ID | Method/result |
| --- | --- | --- |
| edge runtime | `302a71de0867136ca49437696a106fb948a49ae69ce2fa3e4e1848c76c2765a1` | Already exited; untouched |
| studio | `80f54b4f01a2c88a8dd6d20af5be84265bc71ec68fb20b829a23d6cf991e9ffe` | Graceful stop, 237 ms, exit 0 |
| pg_meta | `e065f1320442afe9bb887898762ea30892eb1277299a80723761f74802758343` | Graceful stop, 10160 ms, exit 0 |
| storage | `545dd96008f3ee803ce140955a9727d4618803d6c1d7413d9eb4e8fd378373fc` | Graceful stop, 171 ms, exit 0 |
| rest | `d8ba42a203141b0b1c7c19f73db45dc17cd4d2d2f44a7c9cd6c224396105ee18` | Graceful stop, 151 ms, exit 0 |
| realtime | `6682dfe09b338a106944e725dbaf5d25aa81ed53521448b8350d4178b00f6195` | Graceful stop, 1218 ms, exit 0 |
| mailpit | `d4543a07d46a34f892983c6214b85326923078a76ef6b6669561a14e88070866` | Graceful stop, 526 ms, exit 0 |
| auth | `1fad1630cbf6b1d86167ac7f235dcf3c56fdef7c4d6f741ccff80947a41bf6c8` | Graceful stop, 121 ms, exit 0 |
| kong | `53d482bc1ac42e4e4fc8322565b03d0adc3b599062e1961447584ad94a265d46` | Graceful client timeout 15017 ms; inspected running/no mounts; restart=no verified; one actual KILL; exited |
| PostgreSQL | `5bd802ff81e323942aa0746605b5ee97306c4e804b6197121b26458dd39ece20` | Graceful client timeout 15012 ms; conditional direct SIGINT below; exited |

PostgreSQL diagnostic: PID 1 shell, unique postmaster PID 10, PGDATA
`/var/lib/postgresql/data`, postmaster start `2026-09-12 07:14:25.172023+00`.
SELECT 1 succeeded; no shutdown or observed checkpoint/I/O stall. After verifying
restart=no and rechecking PID/start time, exactly one direct SIGINT was sent.
Logs at 10:29:00 UTC: `.740 received fast shutdown request`, `.760 checkpoint
complete`, `.769 database system is shut down`. No PostgreSQL KILL or second signal.

Final exact inventory: total 10, exited 10, running 0. DB and Storage volumes,
network, containers, workdir, marker/preparation and evidence retained. No reset,
reseed, removal or prune. Protected runs were not mutated.

## Post-park capacity gate

Read-only settle: 60.0382 seconds.

| Round | docker version ms | docker info ms | docker ps ms |
| --- | ---: | ---: | ---: |
| 1 | 27 | 453 | 137 |
| 2 | 45 | 134 | 128 |
| 3 | 20 | 109 | 72 |
| 4 | 16 | 82 | 75 |
| 5 | 15 | 79 | 72 |

All 15 exit 0; timeout limit 5000 ms; zero timeout; stderr empty.
Stats: exit 0 in 1735 ms, running 62 (before parking 71).
System df: exit 0 in 251 ms; 12 images/8.113 GB, 99 containers/62 active,
45 volumes/21 active/1.406 GB, no build cache.
Host load 5.48/4.47/3.99; reported memory free percentage 37%.
Sample top CPU: Kong run-904ee92e 7%, run-f65d52d2 3.75%, tmp-runtime 2.63%.
Top memory: realtime run-904ee92e 263.4 MiB, run-7852b08b 256.2 MiB,
run-f65d52d2 253.7 MiB. These samples are diagnostic, not stop authorization.

## One fresh Batch 6 stack

- Workdir: `local/commerce/runtime/disposable/run-5576dfd8`.
- Project: `figmemento-local-commerce-test-run-5576dfd8`.
- Kind: disposable_test; PostgreSQL 17; Supabase CLI 2.114.0.
- Ports: shadow 56720, API 56721, DB 56722, studio 56723, SMTP 56724, helper 56725.
- Marker: `a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c`.
- DB container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Ledger-aware prepare and start exited 0; 10 exact members running.
- Source checksum verification and actual ledger: 0001–0013, 13/13 matches,
  pending 0. No source migration changed; no 0014 created/applied.
- Credentials obtained through local CLI status and kept private. Initial
  credential discovery in Kong's environment did not find the expected variable;
  no HTTP acceptance was claimed from that attempt. Local CLI status then worked.

| Round | PG readiness ms | SELECT 1 ms | Marker ms | REST HTTP/ms | Storage HTTP/ms |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 86 | 67 | 151 | 200/116 | 200/8 |
| 2 | 62 | 50 | 64 | 200/4 | 200/2 |
| 3 | 55 | 50 | 52 | 200/3 | 200/2 |
| 4 | 54 | 41 | 48 | 200/4 | 200/2 |
| 5 | 55 | 57 | 53 | 200/4 | 200/2 |

Each readiness accepted connections, each SELECT returned 1, each marker check
returned true. Zero timeout. Docker version/info/ps before: 30/522/276 ms;
after: 17/440/107 ms, all exit 0. Stack retained, not reset or stopped.

## Business boundary requiring clarification before implementation

Existing `readPersistentPurchaseCart` preserves a guest-owned Cart even if a
member session is also present: it probes member ownership only when the guest
Cart lookup returns not_found. `createMemberOrderBinding` binds an Order to the
session's customer owner. Existing order-item receipt foreign keys require the
item and receipt to share one project/owner. Customer-auth spec prohibits
sign-in transferring guest Cart/draft/upload ownership and describes new Orders
created under verified membership as member-owned.

The mixed case (valid member session + existing guest Cart/receipts) has no
explicit selection rule in the inspected planning artifacts/tests. A decision is
needed between preserving guest checkout ownership for that Cart, or rejecting
member checkout until a separately owned member Cart is used. Do not silently
transfer receipts, infer a new cross-owner grant, or weaken the foreign keys.
This is a design-boundary clarification, not an observed database failure.
OpenSpec apply pauses on design ambiguity. No business implementation was changed.

## Fresh regression baseline

`npm run verify` exit 0: lint 0 errors/1 existing ProductCustomizationImageField
warning; typecheck PASS; offline 913/913; fresh build PASS followed by rendered
11/11. These are baseline regressions, NOT Batch 6 real Order/payment evidence.
`openspec validate --all --strict`: 23/23 PASS, exit 0.
`git diff --check`: PASS, exit 0 before this report; recheck after report required.
Index empty; 526 existing short-status entries before adding this report.
No stage/commit/push or prohibited Git operation. No remote Supabase/provider,
production database, deployment, Catalog/Supplier/visual mutation or Task 7 work.
