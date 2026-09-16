# Task 6.6 — local persistent simulated Payment acceptance

Classification: LOCAL / DEVELOPMENT-TEST ONLY. No real money/provider.
Target: `run-5576dfd8`, project `figmemento-local-commerce-test-run-5576dfd8`.

## Migration

0018 `0018_local-commerce-payment-command.sql` permanently applied through the existing ledger wrapper after rollback-only preapply PASS.
SHA-256: `f053bb2e731f78325684840a1ecb1c27c54228b07fe7176c1e25763dea45ff1e`.
Ledger 18/18, pending 0; all file/ledger checksums and exact marker verified again by HTTP acceptance. 0001–0018 are immutable; no historical migration edited.

## Real database / actual Worker evidence

Commands: `node scripts/local-commerce-payment-migration.mjs --preapply`, `--apply-authorized-payment`, `--postapply-check` each exited 0. Preapply writes rolled back; permanent apply only through the authorized wrapper.

`node tests/database/local-commerce-payment-http-acceptance.mjs` exited 0, final replayed acceptance:

- Restart PIDs 18490 → 18536; simultaneous Worker PIDs 18536 / 18550.
- Success: one attempt/action/bounded audit, Order paid/succeeded; entire HTTP projection discarded then recovered with original cookie/key after restart, counts unchanged.
- Failed/cancelled → new success; old failed/cancelled replay retains original result without rolling canonical Order back.
- Paid new key and changed outcome reject; same-key concurrent success 200/200 with one effect; different-key success 200/409. Failed/success race 409/200, one succeeded record.
- Amount/currency from immutable snapshot only; fresh HTTP rejects extra browser amount/currency/owner/payment-state fields.
- Original guest and capability expiry tested by natural passage of time using server-issued short-lived authorization; after expiry peer returns 404 without replacement cookie. Member created through real signup/Cart/Order, durable logout rejects replay across processes.
- All six payment Cart identities/versions/lines/quantities unchanged before intentional synthetic Cart drift; later Catalog/Cart changes do not alter stored Payment.
- Immutable snapshot digests unchanged: `94578293edd5741a49378956c7950d3d`, `2f4629d613a9cb1a07ade06cf3bd7343`, `b1ec6e618724694fa10ebd573c54faed`, `e21b6bf8f285acb473a87487cd79b01f`, `6812f825fde22ece8924795185b4d218`, `29bbe2d47067e47c325e748f7de08246`.
- Orders: FM-LOCAL-A526530CFA004D1E, FM-LOCAL-788A815646BD49A2, FM-LOCAL-DEBD58DFB6E647AF, FM-LOCAL-53A74B3778754C1F, FM-LOCAL-10B1A2CD6AA640A8, FM-LOCAL-79601E1665754D61.
- PostgREST RPC ACL: anon 401, authenticated 403, service_role 200 with bounded unavailable for invalid authority; RLS and fixed search_path checked.
- SQL five fault points (attempt, before/after co-located binding/audit, before/after Order transition): zero partial attempt/action or lifecycle mutation; immutable digests unchanged. Cross-owner/project/key/version and member expiry/revoke covered.
- No new Fulfillment/Shipment/digital grant/version/manifest/review rows; no provider, Storage DELETE or reset.

## Validation

- Payment focused: 15/15; Payment + existing domain/application/HTTP/port suite: 44/44; final schema/ledger/port/Cart/Payment suite: 55/55.
- Independent lint exit 0 (one existing ProductCustomizationImageField image warning), typecheck exit 0.
- Independent offline 913/913, fresh build exit 0 → rendered 11/11 exit 0.
- Full `npm run verify` exit 0 (offline 913/913, rendered 11/11).
- OpenSpec strict 23/23; git diff --check exit 0.
- Initial stale manifest-version assertions were corrected from 17 to 18; no business assertion weakened.

Task 6.6 complete; progress 39/85. Task 6.7 remains independent and unchecked until full batch evidence. No Task 7, git stage/commit/push, remote access or production changes.
