# Local image processor foundation

Development/test only. This Node process is separate from the vinext/Worker
application. Native sharp is imported only here, never by an application module.
The isolated package declares sharp 0.34.5; the current workspace already has
that exact installed version. No dependency installation was performed.

Start with `node --experimental-strip-types local/commerce/image-helper/server.mjs`
under the selected local commerce environment. In addition to the existing exact
project/run/loopback/port configuration, supply `LOCAL_COMMERCE_MARKER_DIGEST` and
a dedicated `LOCAL_COMMERCE_IMAGE_HELPER_SECRET` (43–128 base64url characters)
through the process environment. Do not reuse a browser credential or print it.
Startup never starts, resets, seeds or modifies a database. Port conflicts fail.

The single internal POST `/process` takes bounded original bytes and a bounded
server policy header, requires exact Host/project/marker and service credential,
rejects browser Origin/Fetch Metadata, and has no URL/path fetching interface.
The Worker-compatible client freshly verifies the local database marker before
sending any bytes and uses `redirect: error` with a timeout. Input ceilings are
20 MiB and 16 million decoded pixels; the authoritative field may be stricter.
Animated/multi-page input is rejected. One decode runs at a time.

Full decode applies EXIF orientation before the normalized crop. The pixel
rectangle uses floor(left/top), ceil(right/bottom), bounded to the decoded image.
Output is metadata plus PNG, **not a saved receipt, slot, crop revision or ready
publication**. The helper does not own authentication, Catalog, DB, Storage,
original retrieval, revision allocation, operation reconciliation or drafts.

The helper is integrated only for explicitly selected `local_persistent`
development/test media flows. A successful helper response is still not a
receipt, slot, crop revision or ready publication: the Worker must complete the
existing durable database/private-Storage operation and read-back checks. The
`local_fake` path retains its existing process-memory behavior, and no
production renderer/provider is selected.

Focused validation: `node --test tests/local-commerce-image-processing.test.mjs`.
The HTTP cases listen on 127.0.0.1:55595 and :55597, including a standalone Node
child process, and close only their own servers/processes afterward.
These are focused real loopback HTTP tests. Full Worker/DB/private-Storage and
restart acceptance is recorded separately in the active OpenSpec Task 5, 10
and 11 evidence; this README alone is not feature-acceptance evidence. No
production renderer/provider selection is made.
