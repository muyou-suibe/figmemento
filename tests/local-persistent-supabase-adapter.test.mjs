import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET,
  LocalPersistentSupabaseAdapter,
  createLocalPersistentSupabaseAdapter,
} from "../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";

const digest = "a".repeat(64);
const environment = {
  NODE_ENV: "test",
  LOCAL_COMMERCE_ENVIRONMENT: "test",
  LOCAL_COMMERCE_PROJECT_KIND: "disposable_test",
  LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce-test-run-ab12cd34",
  LOCAL_COMMERCE_RUN_ID: "run-ab12cd34",
  LOCAL_COMMERCE_DB_MAJOR_VERSION: "17",
  LOCAL_COMMERCE_SHADOW_DB_PORT: "55420",
  LOCAL_COMMERCE_API_PORT: "55421",
  LOCAL_COMMERCE_DB_PORT: "55422",
  LOCAL_COMMERCE_STUDIO_PORT: "55423",
  LOCAL_COMMERCE_SMTP_PORT: "55424",
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55425",
  LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_RPC_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_STORAGE_URL: "http://127.0.0.1:55421/storage/v1",
  LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55425",
  LOCAL_COMMERCE_MARKER_DIGEST: digest,
  CUSTOMER_AUTH_SOURCE: "local_persistent",
};

function fakeClient({ identity = true } = {}) {
  const calls = { schemas: [], tables: [], rpcs: [], storage: [] };
  const schema = {
    from(table) {
      calls.tables.push(table);
      return {
        async select(columns) {
          return { data: [{ id: "row-1", project_id: environment.LOCAL_COMMERCE_PROJECT_ID, columns }], error: null };
        },
      };
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: identity, error: null };
    },
  };
  const client = {
    calls,
    schema(name) {
      calls.schemas.push(name);
      return schema;
    },
    storage: {
      from(bucket) {
        calls.storage.push({ bucket });
        return {
          async download(path) {
            calls.storage.push({ operation: "download", path });
            return { data: new Blob(["local-bytes"]), error: null };
          },
          async upload(path, body, options) {
            calls.storage.push({ operation: "upload", path, body, options });
            return { data: { path }, error: null };
          },
          async remove(paths) {
            calls.storage.push({ operation: "remove", paths });
            return { data: paths.map(name => ({ name })), error: null };
          },
        };
      },
    },
  };
  return client;
}

test("adapter is scoped to local_commerce HTTP schema and an allowlisted relation", async () => {
  const config = readFileSync("local/commerce/supabase/config.toml", "utf8");
  assert.match(config, /schemas\s*=\s*\[[^\]]*"local_commerce"/);
  assert.match(config, /extra_search_path\s*=\s*\[[^\]]*"local_commerce"/);
  const client = fakeClient();
  const adapter = new LocalPersistentSupabaseAdapter(client);
  const result = await adapter.readRows("orders", "id, project_id");
  assert.equal(result.status, "found");
  assert.deepEqual(client.calls.schemas, ["local_commerce"]);
  assert.deepEqual(client.calls.tables, ["orders"]);

  assert.equal((await adapter.readRows("orders;drop table orders", "id")).status, "unavailable");
  assert.equal((await adapter.readRows("orders", "*")).status, "unavailable");
});

test("restricted RPC uses explicit project identity arguments and rejects non-allowlisted functions", async () => {
  const client = fakeClient();
  const adapter = new LocalPersistentSupabaseAdapter(client);
  assert.deepEqual(await adapter.verifyProjectIdentity(environment.LOCAL_COMMERCE_PROJECT_ID, digest), { status: "found", value: true });
  assert.deepEqual(client.calls.rpcs, [{
    name: "verify_project_identity",
    args: { p_project_id: environment.LOCAL_COMMERCE_PROJECT_ID, p_marker_digest: digest },
  }]);
  assert.equal((await adapter.callRestrictedRpc("future_unapproved_rpc", {})).status, "unavailable");
});

test("private Storage adapter never exposes signed URL or arbitrary bucket access", async () => {
  const client = fakeClient();
  const adapter = new LocalPersistentSupabaseAdapter(client);
  assert.equal((await adapter.downloadPrivateObject("receipts/receipt-1")).status, "found");
  assert.equal((await adapter.uploadPrivateObject("receipts/receipt-1", new Uint8Array([1]), "image/png")).status, "found");
  assert.equal((await adapter.removePrivateObjects(["receipts/receipt-1"])).status, "found");
  assert.equal(client.calls.storage[0].bucket, LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET);
  assert.equal((await adapter.downloadPrivateObject("../outside")).status, "unavailable");
  assert.equal((await adapter.downloadPrivateObject("https://example.test/object")).status, "unavailable");
  assert.doesNotMatch(readFileSync("app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts", "utf8"), /createSignedUrl|signedURL|signed_url|pg\.Pool|postgres(?:ql)?:\/\//i);
});

test("empty DELETE is not completion; exact absence permits response-loss retry", async () => {
  for (const [metadata, expected] of [
    [{ data: { name: "receipts/receipt-1" }, error: null }, "unavailable"],
    [{ data: null, error: { code: "AccessDenied" } }, "unavailable"],
    [{ data: null, error: { code: "InternalError" } }, "unavailable"],
    [{ data: null, error: { code: "NoSuchKey" } }, "found"],
  ]) {
    const client = fakeClient();
    client.storage.from = () => ({
      async remove() { return { data: [], error: null }; },
      async info(path) { assert.equal(path, "receipts/receipt-1"); return metadata; },
    });
    assert.equal((await new LocalPersistentSupabaseAdapter(client).removePrivateObjects(["receipts/receipt-1"])).status, expected);
  }
});

test("factory requires explicit persistent selection, service credential, and successful identity RPC", async () => {
  const noSelection = await createLocalPersistentSupabaseAdapter({ ...environment, CUSTOMER_AUTH_SOURCE: undefined });
  assert.equal(noSelection.status, "unavailable");

  const noCredential = await createLocalPersistentSupabaseAdapter(environment);
  assert.equal(noCredential.status, "unavailable");
  assert.ok(noCredential.issues.some((issue) => issue.code === "local_service_credential_required"));

  let factoryArguments;
  const client = fakeClient();
  const ready = await createLocalPersistentSupabaseAdapter(
    { ...environment, LOCAL_COMMERCE_SERVICE_ROLE_KEY: "local-test-service-role-key" },
    { clientFactory: { create(url, key) { factoryArguments = { url, key }; return client; } } },
  );
  assert.equal(ready.status, "ready");
  assert.deepEqual(factoryArguments, { url: environment.LOCAL_COMMERCE_API_URL, key: "local-test-service-role-key" });
  assert.doesNotMatch(JSON.stringify(ready), /local-test-service-role-key/);

  const rejected = await createLocalPersistentSupabaseAdapter(
    { ...environment, LOCAL_COMMERCE_SERVICE_ROLE_KEY: "local-test-service-role-key" },
    { clientFactory: { create() { return fakeClient({ identity: false }); } } },
  );
  assert.equal(rejected.status, "unavailable");
  assert.ok(rejected.issues.some((issue) => issue.code === "project_identity_rejected"));
});
