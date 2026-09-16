# Media processing foundation — partial evidence

Date: 2026-09-11. This records actual execution, not completion of 5.1–5.3.
Progress remains **22/85**. No task checkbox was changed.

## Owner count decision

The former 5.1 count ambiguity is resolved by the owner's current instruction.
Each explicit POST `/api/uploads` is one independent upload of exactly one actual
file. Identical owner/Product/field/bytes do not imply one selection, a quota or
deduplication. The configured-item field's `images[]` retains its authoritative
min/max count validation. A receipt proves one candidate image, not a complete
selection. No configured-copy/draft/selection aggregate is added for admission.
The previous blocked report remains historical evidence, not the current count
policy. No browser image count, MIME, size, dimensions or crop policy is trusted.

## Implemented and executed

- `app/server/local-commerce-image-processing.server.ts`: bounded multipart
  single-file reader and Worker-compatible HTTP processing client. Source and
  same-project composition fail closed; the client verifies the database marker
  before forwarding bytes and forbids redirects. Native sharp is not imported.
- `local/commerce/image-helper/processor.mjs`: full JPEG/PNG/WebP decode, enforced
  20 MiB/16 million pixel technical limits, current field MIME/minimum dimensions,
  EXIF orientation normalization and normalized crop via the existing parser.
  Original bytes are copied, not modified. Output is processed PNG, not a receipt.
- `local/commerce/image-helper/server.mjs`: isolated authenticated loopback Node
  HTTP service, exact Host/project/marker, bounded headers/body and single decode
  concurrency; no fetch/path/DB/Storage business interface.
- Isolated helper dependency declaration and operating/boundary README.
- `tests/local-commerce-image-processing.test.mjs`: **10/10 PASS**. Nine cases
  exercise actual compressed bytes, finite/bounds/crop policy, 8 EXIF orientations,
  bad input, request limits and unsafe configuration. The tenth case runs real
  loopback HTTP on port 55595 with valid and wrong credentials/project/marker,
  browser Origin rejection and path injection rejection. The listener is closed
  afterward. Initial sandbox listen returned EPERM; the permitted local rerun
  passed. This was not an application failure and no test was skipped.

## Incomplete work (must not be counted as acceptance)

| Task | Actual status | Missing evidence/implementation |
| --- | --- | --- |
| 5.1 | PARTIAL | New bounded reader and decoder are not yet wired into the sole browser route's persistent branch; no new persistent accepted receipt was issued. Existing local_fake route remains unchanged. |
| 5.2 | PARTIAL | Real standalone helper HTTP passed; actual vinext/Worker → verified local DB marker → helper smoke has not run. No claim that Node HTTP replaces that evidence. |
| 5.3 | PARTIAL | Oriented pixel crops and source digest preservation passed, but durable server-allocated crop revision, original/derivative association and confirmed-state preservation have not been implemented or DB/Storage tested. |
| 5.4 | BLOCKED by durable slot/draft authority | Read-only dependency decision below; no operation model or migration added. |
| 5.5 | NOT STARTED | Authorized persistent media read/publication remains deferred. |

## Read-only dependency decision

**TASK 5.4 BLOCKED BY TASK 4.4 DURABLE SLOT/DRAFT AUTHORITY**

Evidence inspected:

- Task 4.4 remains unchecked and explicitly owns stable draft slots, ordered
  media, crop, confirmed revision and CAS.
- `app/domain/product-customization-draft.ts`, `ProductCustomizationActiveUpload`,
  explicitly identifies operation/slot identity as client-local, not receipt or
  object authority.
- Migration 0002 contains `configuration_drafts.confirmed_revision`,
  `media_receipts.source_generation`, `media_derivatives.crop_revision`, and
  `draft_media_links` keyed by draft/position. Columns and positive-number checks
  are not a runtime allocator/ownership/CAS contract for current durable slots.
- Current local-commerce adapters implement accounts, sessions, Catalog/rules
  and Cart. There is no implemented persistent media/draft slot command adapter.
- Existing `/api/uploads` currently admits only local_fake; persistent operation
  publication is not implemented. The count clarification does not itself
  supply the missing server-owned stable slot/generation model.

An independently generated processing ID could label a stateless computation,
but cannot prove that its generation is the latest live selection or that a
durable confirmed crop may be replaced. This implementation deliberately does
not invent that substitute. The durable part of 5.3 also reaches this missing
publication boundary; therefore this is **not** a report of completed 5.1–5.3
followed by a 5.4 gate. The processing-only subset is retained for continuation.
OpenSpec apply's design-issue stop gate was followed rather than silently
implementing 4.4 or checking tasks without evidence.

## Validation

- Focused: 10/10 PASS (exit 0 after permitted loopback listener execution).
- Independent lint: exit 0; 0 errors, 1 pre-existing image warning at
  `app/storefront/ProductCustomizationImageField.tsx:496`.
- Independent typecheck: exit 0.
- Independent offline: 913/913 PASS, exit 0; no DB suite represented as offline.
- Independent fresh build: exit 0, followed by rendered 11/11 PASS, exit 0.
- Full verify: exit 0; lint/typecheck/offline 913/913/fresh build/rendered 11/11
  all passed. The same pre-existing image warning remains.
- OpenSpec strict: 23/23 PASS, exit 0.
- `git diff --check`: exit 0. New untracked files additionally checked directly.

Local execution logs: `/private/tmp/figmemento-media-{focused,lint,typecheck,offline,build,rendered,verify,openspec}.log`.
Full worktree status captured at `/private/tmp/figmemento-media-git-status.log`;
the worktree already contains extensive unrelated changes, which were preserved.

## Safety / unverified integration

No DB or Storage access was performed in this batch. No stack was started or
reset, including earlier evidence runs. No migration was created or executed;
0001–0009 and manifest are unchanged. No schema checksum was newly generated.
No receipt, crop revision, confirmed draft or storage object was fabricated.
No frontend, Catalog data/authority, Supplier semantics, application route,
existing fake behavior or business command was changed. No remote provider,
deployment, stage, commit or push was performed. Index remains empty.

Next decision: authorize Task 4.4's durable slot/draft implementation before
durable crop/operation publication, or explicitly amend the upstream authority
contract. Do not silently substitute an independent slot model. No 5.6 or Task 6.
