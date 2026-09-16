# Task 5.2 — isolated local image helper

2026-09-11. Task 5.2 PASS; progress 24/85. Task-specific evidence; not Task
5.1/5.3/5.4/5.5 or 5.7 acceptance. Task 1.1 remains unchecked.

## Implemented boundary

The pre-existing partial implementation is reused, not rewritten:
`local/commerce/image-helper/processor.mjs`, `server.mjs`, isolated package and
`app/server/local-commerce-image-processing.server.ts`. Sharp remains outside the
application import graph. The helper accepts original bytes and bounded policy,
not URLs/paths, and exposes no commerce database or Storage operation.
The application client checks local composition and project marker before helper
access. Helper protocol requires loopback, exact Host/project/marker, a dedicated
server credential, recognized development/test mode and bounded image input.

Full decoding validates MIME, dimensions, byte/pixel limits and corruption;
EXIF orientation precedes canonical normalized crop. Originals are not mutated.
Output is decoded metadata/PNG only: no accepted receipt, crop revision or draft
publication is implied. These latter properties still require durable media work.

## Executed evidence

`node --test tests/local-commerce-image-processing.test.mjs`: **11/11 PASS**.

- Real JPEG/PNG/WebP, corruption/truncation, SVG/HTML and pixel bomb rejection.
- Bounded multipart single-file and dishonest length rejection.
- All eight EXIF orientations with pixel comparisons and unchanged source digest.
- Invalid crop and URL/path/canvas/dimension policy rejection.
- Valid credentials with production/staging/unknown/remote/wrong-project config
  rejection: missing credentials do not mask these tests.
- Actual HTTP rejection for project, marker, credential, Origin, Fetch Metadata,
  Host, method, path, content type and malformed/oversized policy.
- A separately spawned Node CLI helper on 127.0.0.1:55597 processed real bytes;
  its PID differed from the test process. The test closed only that child.
- No database or Storage acceptance is claimed by these tests.

The first added Host test used fetch, which replaced the supplied Host and
therefore exercised a valid request (200). It was corrected to node:http to send
the actual invalid Host; 403 was then observed. No server security check was
weakened and the failed run is not counted as a pass.

Task 5.7 still owns the final actual vinext/Worker → helper group smoke. Its
deferred execution is not a reason to keep the standalone helper task partial.

## Validation

Independent lint/typecheck/offline/fresh build/rendered and the full verify chain
passed (exit 0). After the separate-process case was added, full verify was run
again against the final test source: exit 0, offline 913/913, rendered 11/11,
typecheck/build PASS. Lint retains one existing img warning, zero errors.
The helper focused suite is separate from the package's explicit offline list;
its 11/11 is not included in the 913 count. OpenSpec strict passed 23/23 and
git diff check passed before the task-only checkbox update.

Logs: `/private/tmp/draft-media-final-*.log` and
`/private/tmp/draft-media-helper-final-verify.log`. No staging/commit/push.

## Remaining batch work

The sole persistent upload route is not yet wired. Durable operation,
Storage read-back/compensation, receipt/private read and confirmed crop publication
are not implemented or accepted by this report. Tasks 5.1/5.3/5.4/5.5 remain open.
No new media migration has been applied. Task 4.4's 0010 remains unchanged.
