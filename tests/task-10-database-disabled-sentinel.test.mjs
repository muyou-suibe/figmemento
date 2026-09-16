import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import test from "node:test";

test("Task 10.8 DB-disabled sentinel is active and fails fast before network-backed DB, Storage, RPC, or provider I/O", async () => {
  assert.deepEqual(globalThis.__TASK10_DATABASE_DISABLED_SENTINEL__?.active, true);
  assert.throws(() => net.connect({ host: "127.0.0.1", port: 5432 }), /TASK10_DATABASE_DISABLED_SENTINEL/);
  assert.throws(() => http.request("http://127.0.0.1:54321/rest/v1/"), /TASK10_DATABASE_DISABLED_SENTINEL/);
  await assert.rejects(async () => globalThis.fetch("http://127.0.0.1:54321/storage/v1/"), /TASK10_DATABASE_DISABLED_SENTINEL/);
});
