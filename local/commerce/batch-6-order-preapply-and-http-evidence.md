# Batch 6 Order foundation — executed evidence

Dates: 2026-09-12–13. Exact disposable target: `run-5576dfd8`.
This is incremental evidence, **not full Batch 6 acceptance**. Tasks 6.1/6.2
were reconciled and checked after the executed transaction/HTTP evidence and
passing verify; progress is 35/85. Tasks 6.3–6.7 remain unchecked. No Task 7 work.

## Migration gate

- Exact PostgreSQL container ID:
  `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Workdir label matched `local/commerce/runtime/disposable/run-5576dfd8`.
- Before registration, raw 0014 was executed inside BEGIN/ROLLBACK. Structural,
  privilege, canonical allocation, two-item commit, rejected tampering and replay
  checks passed. After rollback: ledger 13, new table/functions absent, original
  access-grant uniqueness restored.
- Then 0014 was registered and applied **once**, using the existing ledger
  wrapper with exact project/marker and all thirteen historical checksums.
- Applied source checksum:
  `3eaad88245a297889c7683a16556594896490a626403b73377f89b0f7cdd8a43`.
- Actual HTTP read-back: exact marker true, ledger/checksums 14/14, pending 0.
- Actual `POST /rest/v1/rpc/order_commit`: HTTP 200, bounded `unavailable` for
  nonexistent authority, proving PostgREST signature discovery (not successful
  purchase by itself).
- **0014 is now immutable. Corrections require 0015 or later.**

## Executed Worker HTTP evidence

Entry: `tests/database/local-commerce-order-http-acceptance.mjs`, using the
existing actual vinext test Worker launch seam and production route handlers.
No handler replacement or fake repository was used for these requests.

- Two real Cart additions created two lines.
- First Order POST: 204, HttpOnly cookie, empty body, purchase row delta zero.
- First establishment cookie deliberately discarded; repeat establishment
  likewise created no purchase rows.
- Valid cookie: real Order commit, no capability rotation; response discarded.
- Process A 92213 terminated; independent process B 92269, same DB/cookie/input,
  returned `FM-LOCAL-E6FFCEE1145C4053`. Order/item/grant/binding counts unchanged.
- Forged token: establishment only. Its replacement could not replay the Order.
- Separately verified guest, real Node/sharp helper and private Storage receipt,
  explicit durable Draft confirmation, real Cart and Order HTTP:
  `FM-LOCAL-C9D5AD341FDB4E40`, HTTP 200, exactly one receipt binding.
- Only acceptance-created application/helper children were stopped. No stack
  restart, reset, data cleanup or deletion was performed.

## Applied-function transaction evidence

`node scripts/local-commerce-order-preapply.mjs --applied-contract`
and the same command with `--digital` both exited 0.

- Real applied RPC, with synthetic fixtures rolled back afterward.
- Physical two-item and digital-only email-only purchases succeeded.
- SQL allocation matched TypeScript integer allocation vectors, including large
  intermediates, stable remainder ties and zero-weight physical splitting.
- Forged option labels, configuration definition and extra media rejected.
- Noncanonical per-item shipping shares rejected despite conserved totals.
- Exact-owner injected failure on the final binding write returned unavailable;
  no Order/header/item/receipt/grant/binding partial write survived.
- Original Cart version and quantity unchanged. Original capability replay
  succeeded; replacement capability failed. All fixture DDL/data rolled back.

## Executed validation

- Capability/HTTP/facts/allocation/context/security focused: 49/49.
- Purchase owner/source/adapter/receipt boundary: 23/23.
- Updated manifest/schema/security focused: 23/23.
- `npm run verify`: exit 0; offline 913/913, typecheck PASS, build PASS,
  subsequent rendered 11/11. Lint 0 errors, one existing image warning.
- OpenSpec strict: 23/23. `git diff --check`: PASS. Index empty.
- The verify run preceded the final acceptance-harness additions and manifest
  accounting edits; a final full run is still required before batch closure.

## Not yet proven / not claimed

Full member/session expiry matrix; real mixed-order/rule races; exhaustive media
tampering and attach/cleanup concurrency; explicit same-owner copy; full history
read adapters; atomic simulated payment; complete two-instance Batch 6 suite.
No task completion or whole-batch PASS is inferred from the subset above.

## Subsequent evidence and current blocker

- Physical, digital-only and mixed applied-function transaction runs passed,
  including injected final-write rollback and exact integer allocation.
- A real member-create HTTP test initially failed with 503. Root cause: the
  Order grant helper wrongly required integer seconds for the existing durable
  session's millisecond-precision expiry. It now accepts finite fractional
  seconds without rounding upward; session implementation/SQL is unchanged.
- After the fix, real Worker A 92811 → B 92874 recovered
  `FM-LOCAL-FEFCBF0025B645D2` after response loss and Catalog price/name changes.
  Guest Cart plus member session remained guest-owned; member Cart created a
  member Order; durable logout rejected replay. Real image Order
  `FM-LOCAL-29CECF55DC334EBD` attached exactly one receipt.
- One verify attempt found the old manifest-version assertion 13 in the session
  test. Updating only manifest accounting to 14 restored a subsequent full
  verify PASS. The historical migration checksum assertion remains intact.
- Task 6.3 has a new **unregistered/unapplied 0015 draft** and internal copy
  command. Rollback-only pending operation/replay/version-conflict checks passed,
  as did focused copy tests 4/4 and typecheck/lint. Real completed Storage copy is
  **not proven**.
- Permission review rejected permanent 0015 application twice, including after
  the current attachment's explicit 6.3 authorization was presented. Neither
  rejected command executed. No alternate path was attempted. The temporary
  manifest entry was removed: registered manifest remains 14, DB ledger remains
  freshly verified 14/14, marker true, copy RPC absent. Direct message authorization is required by the reviewer
  before retrying this permanent database change.

## Final validation at the permission stop

- Final `npm run verify`: exit 0, including lint/typecheck/offline/fresh build
  followed by rendered 11/11; the existing image warning remains the only lint
  warning. No tests skipped to obtain this result.
- Combined focused boundary/schema/session/Cart/copy suite: 106/106 PASS.
- OpenSpec strict: 23/23 PASS. `git diff --check`: PASS.
- Git index: 0 staged files; no commit/push/reset/clean/stash performed.
- Registered schema remains 14. Draft 0015 cannot be treated as acceptance or
  applied evidence. Task 6.3 remains blocked; 6.4–6.7 remain unchecked.
