# Task 7.3 historical implementation checkpoint

This file preserves the earlier unaccepted candidate checkpoint below. Current
applied state and acceptance are recorded in `task-7.3-acceptance.md` and
`task-7.3-http-evidence.json`; do not use the historical candidate hash/ledger below
as the current migration state. 0022 is now applied and immutable at ledger 22/22.

## Historical checkpoint (superseded, retained verbatim)

Task 7.3 remains unchecked; progress 42/85. No Task 7.4 or Task 8 acceptance.

## Implemented candidate, not active durable runtime

- Persistent input wrapper reuses the existing customer action parser and
  `LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH=500`, with required non-empty
  trimmed revision text. Existing local_fake optional-note semantics unchanged.
- Focused 3/3 proves 500 accepted / 501 rejected, UTF-16 supplementary-character
  counts, existing trim behavior, and rejection of owner/operator/version authority.
- Unregistered migration 0022 adds a restricted customer command over existing
  `fulfillment_decisions` and aggregate; authorization uses existing
  `read_order_history` before replay/disclosure. No additional identity store.
- The candidate replaces only the operator RPC definition for server-derived
  v2/v3 reservation/readiness/publication. No modification to old SQL files.
- Typed RPC allowlist entry exists; customer HTTP and operator TypeScript
  integration remain pending. Existing production-preview TypeScript is left
  on the accepted 7.2 behavior until the candidate is ready for integration.

## Actual evidence this continuation

Exact run-5576dfd8/container/workdir, project, PG17 and marker verified.
Actual ledger 21/21, pending 0; file/manifest/ledger checksums 0001–0021 match.
Existing security HTTP probe passed (anon401/authenticated403/service_role200).

Candidate compiled and executed ONLY inside BEGIN/ROLLBACK on that exact DB.
Existing expanded 7.2 SQL regression passed. New SQL cases passed: 500/501,
empty/whitespace, missing version, revision1→v2, revision2→v3, replay unchanged,
changed note conflict, revision-pending approval denial, old manifest digest
preservation, stale approval denial, third revision denial and v3 approval/replay.
Post-rollback ledger remains 21. No permanent migration or fixture write.

Candidate checksum at this checkpoint:
`01b33562c55e9ad69c31f7e8143904b12995f72376d45b5c20ec588a493ed15b`.
This is NOT an applied/final checksum. Candidate may still change before
registration. Manifest remains version21. 0001–0021 remain immutable.

Typecheck exit0; focused3/3; OpenSpec strict23/23; diff check PASS.
Full final verify/build/rendered and Task7.3 real HTTP acceptance NOT executed.

## Required remaining gates

Complete customer HTTP integration behind existing route, unified command port
CAS context, operator target-version TypeScript handling; full pre-apply ACL,
member/capability negatives, all fault points and full upstream digest checks.
Only after that register/checksum and apply with ledger wrapper. Then real
Worker/helper/Storage v1 approval, v2/v3, member/guest negatives, lost-response
restart PIDs and simultaneous-Worker races; final validation. No checkbox until
all independent evidence passes. Current SQL fixtures are not real HTTP evidence.

No stage/commit/push, remote/provider/deployment, reset or Storage deletion.
