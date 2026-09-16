import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const commands = [
  ["static", ["--test", "tests/local-commerce-entrypoint-inventory.test.mjs", "tests/local-persistent-admin-orders.test.mjs", "tests/local-persistent-admin-catalog-isolation.test.mjs", "tests/local-persistent-shipment-create.test.mjs", "tests/local-persistent-shipment-lifecycle.test.mjs", "tests/local-persistent-tracking-customer.test.mjs", "tests/local-tracking-customer.test.mjs", "tests/local-tracking-operator-http.test.mjs"]],
  ["admin", ["tests/database/local-commerce-admin-orders-http.mjs"]],
  ["adminCatalogIsolation", ["tests/database/local-commerce-admin-catalog-isolation-http.mjs"]],
  ["shipmentCreate", ["tests/database/local-commerce-shipment-create-http.mjs"]],
  ["shipmentLifecycle", ["tests/database/local-commerce-shipment-lifecycle-http.mjs"]],
  ["customerTracking", ["tests/database/local-commerce-customer-tracking-http.mjs"]],
  ["legacy", ["tests/database/local-commerce-task8-legacy-http.mjs"]],
  ["security", ["tests/database/local-commerce-task8-security.mjs"]],
];
const evidence = [];
for (const [name, args] of commands) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `${name}: ${result.error?.code ?? result.stderr}\n${result.stdout}`);
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  evidence.push({ name, last: lines.at(-1) ?? "PASS" });
}
console.info(JSON.stringify({ status: "PASS", task: "8.7", run: "run-5576dfd8", project: "figmemento-local-commerce-test-run-5576dfd8", ledger: 30, indexedGates: evidence.map((item) => item.name), evidence, classification: "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE" }));
