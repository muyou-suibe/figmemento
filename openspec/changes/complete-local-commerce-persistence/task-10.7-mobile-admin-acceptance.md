# Task 10.7 mobile and signed-Admin acceptance

Classification: LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE.

## Target

- Disposable run: `run-5576dfd8`
- Project: `figmemento-local-commerce-test-run-5576dfd8`
- Primary application Worker: PID 5170, `http://127.0.0.1:56726`
- Independent recovery Worker: PID 9102, `http://127.0.0.1:56727`
- Viewport: 375 x 812 CSS pixels, DPR 2
- Browser media: coarse pointer and reduced motion both active
- Migration baseline remained 37/37 with zero pending migrations; no migration was added.

## Customer customization journey

- The real persistent synthetic Product and authoritative `Small` Variant/SKU were used. Catalog facts were not replaced by browser data.
- Multi-file admission filled the remaining capacity and a three-file over-capacity selection produced the visible per-file limit rejection without exceeding four slots or corrupting existing slots.
- An emulated touch activation moved image 2 upward. Labeled move controls remained available as the keyboard/button alternative.
- A real private upload returned HTTP 201 and the durable Draft save returned HTTP 200. Private preview generation/read returned HTTP 201/200.
- Crop keyboard inputs changed width/height from 100/100 to 80/80. A coarse-pointer touch drag then changed left/top to `14.633349665196798` / `7.857362091576216`; Apply crop persisted the exact normalized values.
- Full refresh recovered the saved private preview and exact crop. The same browser authority then recovered the same Draft/private preview/crop from the independent PID 9102 Worker, proving application-process memory was not the authority.
- A transient browser transport failure entered the truthful server-confirmation-pending state. Recovery retained the same attempt instead of attaching a fabricated receipt.
- For late-response fencing, CDP paused the real second-slot `POST /api/uploads`, the customer removed that slot through the UI, and the response was then released. The UI remained at exactly one confirmed live slot; the late result did not resurrect a slot.
- Selecting the same bytes as an explicit replacement produced a new pending generation while retaining the previous confirmed preview until acceptance. Removing it through the real control cancelled the selection and returned to an empty slot without a ghost error.
- Every inspected customer state had zero horizontal overflow at 375px.

## Signed Admin journey

- An isolated unauthenticated browser request to `/admin/orders` redirected to `/admin/login`.
- The real `/admin/login` form issued the existing signed, HttpOnly, SameSite=Lax Admin cookie. No cookie value was printed.
- `/admin/orders` rendered 945 persistent Orders, including the fresh Task 10.6 Order, with a 15,540px long-content document and zero horizontal overflow at 375px.
- `/admin/products` rendered the existing 22-product process-memory Catalog and explicitly labeled it `LOCAL / TEST ONLY` and reset-on-restart. It had zero horizontal overflow at 375px.
- The Orders page separately labeled canonical local persistent commerce. This proves fake Catalog administration did not become persistent commerce authority.
- A long hostile invalid password produced only `Incorrect password.`, did not reflect the input, and caused zero horizontal overflow.
- Both Admin pages retained coarse-pointer and reduced-motion behavior.
- An authenticated Admin screenshot was intentionally not exported because it would contain broad customer/order content; DOM text, route, dimensions, media-query state, cookie metadata, and network results were recorded instead.

## Contract alignment

`tests/figmemento-fusion-admin-operator.test.mjs` previously treated the safe Orders warning `Supplier remains unsupported` as forbidden Supplier coupling. The negative assertion now remains scoped to Catalog editors, while the Orders test explicitly requires that fail-closed warning. No application or business implementation changed.

## Validation

- Focused mobile/customization/Admin contracts: 45/45 PASS.
- Lint: PASS, zero errors and one pre-existing `no-img-element` warning.
- Typecheck: PASS.
- Offline: 918/918 PASS.
- Fresh build: PASS.
- Rendered: 11/11 PASS.
- `npm run verify`: PASS with the same counts.
- OpenSpec strict: 23/23 PASS.
- `git diff --check`: PASS.

## Authority and exclusions

Catalog, Cart, Order, Payment, Fulfillment, Supplier, Shipment, Tracking, private-media, signed-Admin, and ownership authorities were not redesigned. No remote Supabase, production database, deployment, provider call, migration, stage, commit, or push occurred. Task 10.8 and Task 11 remain independently unaccepted.
