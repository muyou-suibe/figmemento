import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AdminCatalogLifecycleBoundary } from "../app/application/admin-catalog-lifecycle.ts";
import {
  SupabaseCatalogLifecycleRepository,
  SupabaseCatalogLifecycleRpcWriter,
} from "../app/infrastructure/catalog/supabase-catalog-lifecycle-repository.ts";
import { handleAdminCatalogLifecycleMutation } from "../app/server/admin-catalog-lifecycle-http.server.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function lifecycleValue(overrides = {}) {
  return {
    targetType: "product",
    targetId: "product-1",
    action: "publish",
    previousLifecycle: "draft",
    currentLifecycle: "published",
    changed: true,
    ...overrides,
  };
}

function repositories(result, calls = []) {
  return {
    writer: {
      async applyLifecycleIntent(intent) {
        calls.push(intent);
        return result;
      },
    },
  };
}

function request(method = "POST", body = { action: "publish" }, origin = "https://photogift.test") {
  return new Request("https://photogift.test/api/admin/catalog/products/product-1/lifecycle", {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      origin,
      "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

test("1: unauthorized lifecycle requests fail before privileged repository creation", async () => {
  let factories = 0;
  const result = await new AdminCatalogLifecycleBoundary(unauthorized, () => {
    factories += 1;
    throw new Error("must not construct privileged lifecycle repository");
  }).execute("product", "product-1", { action: "publish" });
  assert.deepEqual(result, { status: "unauthorized" });
  assert.equal(factories, 0);

  const response = await handleAdminCatalogLifecycleMutation(
    request("POST", { action: "publish" }, "https://attacker.test"),
    "products",
    "product-1",
    {
      verifier: unauthorized,
      createRepositories() {
        factories += 1;
        throw new Error("must not construct service-role client");
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(factories, 0);
});

test("2: malformed lifecycle commands are rejected before persistence", async () => {
  let factories = 0;
  const boundary = new AdminCatalogLifecycleBoundary(authorized, () => {
    factories += 1;
    throw new Error("must not construct repository");
  });
  for (const [targetType, targetId, body] of [
    ["supplier", "product-1", { action: "publish" }],
    ["product", "invalid id", { action: "publish" }],
    ["product", "product-1", { action: "archive" }],
    ["product", "product-1", { action: "publish", secret: "must-not-pass" }],
  ]) {
    const result = await boundary.execute(targetType, targetId, body);
    assert.equal(result.status, "invalid_request");
  }
  assert.equal(factories, 0);
});

test("3: authorized lifecycle action reaches one repository call with the fixed actor boundary", async () => {
  const calls = [];
  const value = lifecycleValue();
  const result = await new AdminCatalogLifecycleBoundary(
    authorized,
    () => repositories({ status: "applied", value }, calls),
  ).execute("product", "product-1", { action: "publish" });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.value, value);
  assert.deepEqual(calls, [{
    targetType: "product",
    targetId: "product-1",
    action: "publish",
    actorBoundary: "configured_admin_session",
    actorIdentifier: "configured-admin",
  }]);
});

test("4: publication rejection maps to actionable safe validation without database details", async () => {
  const result = await new AdminCatalogLifecycleBoundary(
    authorized,
    () => repositories({ status: "rejected", reason: "no_eligible_variant" }),
  ).execute("product", "product-1", { action: "publish" });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.issues[0].path, "$.variants");
  assert.match(result.issues[0].message, /active and available valid SKU/i);
  assert.doesNotMatch(JSON.stringify(result), /constraint|detail|hint|sql|secret|token|cookie/i);
});

test("5: authorized destructive request is normalized to rejected audit intent and never a delete operation", async () => {
  const calls = [];
  const response = await handleAdminCatalogLifecycleMutation(
    request("DELETE"),
    "products",
    "product-1",
    {
      verifier: authorized,
      createRepositories: () => repositories(
        { status: "rejected", reason: "destructive_mutation_forbidden" },
        calls,
      ),
    },
    { action: "delete" },
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, "destructive_state_mutation_attempt");
  assert.equal("delete" in calls[0], false);
});

test("6: same-origin and safe-error handling protect the lifecycle HTTP boundary", async () => {
  let factories = 0;
  const crossOrigin = await handleAdminCatalogLifecycleMutation(
    request("POST", { action: "publish" }, "https://attacker.test"),
    "products",
    "product-1",
    {
      verifier: authorized,
      createRepositories() {
        factories += 1;
        throw new Error("must not construct cross-origin repository");
      },
    },
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal(factories, 0);

  const sourceFailure = await handleAdminCatalogLifecycleMutation(
    request(),
    "products",
    "product-1",
    {
      verifier: authorized,
      createRepositories: () => repositories({
        status: "source_failure",
        operation: "catalog.admin.lifecycle",
      }),
    },
  );
  assert.equal(sourceFailure.status, 503);
  const body = await sourceFailure.text();
  assert.match(body, /temporarily unavailable/i);
  assert.doesNotMatch(body, /constraint|detail|hint|sql|credential|secret|token|cookie/i);
});

test("7: Supabase lifecycle repository strictly maps applied, rejected, missing, and malformed RPC rows", async () => {
  const intent = {
    targetType: "product",
    targetId: "product-1",
    action: "publish",
    actorBoundary: "configured_admin_session",
    actorIdentifier: "configured-admin",
  };
  const writerFor = (data, error = null) => ({ async applyLifecycleIntent() { return { data, error }; } });
  const applied = await new SupabaseCatalogLifecycleRepository(writerFor({
    result_status: "applied",
    target_type: "product",
    target_id: "product-1",
    action: "publish",
    previous_lifecycle: "draft",
    current_lifecycle: "published",
    changed: true,
    reason_code: null,
  })).applyLifecycleIntent(intent);
  assert.deepEqual(applied, { status: "applied", value: lifecycleValue() });

  assert.deepEqual(
    await new SupabaseCatalogLifecycleRepository(writerFor({
      result_status: "rejected",
      reason_code: "category_not_published",
    })).applyLifecycleIntent(intent),
    { status: "rejected", reason: "category_not_published" },
  );
  assert.deepEqual(
    await new SupabaseCatalogLifecycleRepository(writerFor({ result_status: "not_found" })).applyLifecycleIntent(intent),
    { status: "not_found" },
  );
  for (const writer of [writerFor({ result_status: "rejected", reason_code: "raw_sql_detail" }), writerFor(null), writerFor({}, { message: "private database detail" })]) {
    assert.deepEqual(
      await new SupabaseCatalogLifecycleRepository(writer).applyLifecycleIntent(intent),
      { status: "source_failure", operation: "catalog.admin.lifecycle" },
    );
  }
});

test("8: production adapter performs exactly one server-only lifecycle RPC invocation", async () => {
  const calls = [];
  const client = {
    rpc(name, parameters) {
      calls.push({ name, parameters });
      return {
        async maybeSingle() {
          return {
            data: {
              result_status: "applied",
              target_type: "product",
              target_id: "product-1",
              action: "publish",
              previous_lifecycle: "draft",
              current_lifecycle: "published",
              changed: true,
              reason_code: null,
            },
            error: null,
          };
        },
      };
    },
  };
  const intent = {
    targetType: "product",
    targetId: "product-1",
    action: "publish",
    actorBoundary: "configured_admin_session",
    actorIdentifier: "configured-admin",
  };
  const result = await new SupabaseCatalogLifecycleRepository(
    new SupabaseCatalogLifecycleRpcWriter(client),
  ).applyLifecycleIntent(intent);
  assert.equal(result.status, "applied");
  assert.deepEqual(calls, [{
    name: "transition_catalog_lifecycle",
    parameters: {
      p_target_type: "product",
      p_target_id: "product-1",
      p_action: "publish",
      p_actor_boundary: "configured_admin_session",
      p_actor_identifier: "configured-admin",
    },
  }]);
});

test("9: lifecycle migration is additive, atomic, service-role-only, and never hard-deletes catalog history", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260810120000_add_atomic_catalog_lifecycle_rpc.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create function public\.transition_catalog_lifecycle/i);
  assert.match(sql, /language plpgsql\s+security invoker/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /update public\.products[\s\S]*is_published = \(v_target_lifecycle = 'published'\)/i);
  assert.match(sql, /update public\.categories[\s\S]*set lifecycle = v_target_lifecycle/i);
  assert.match(sql, /insert into public\.catalog_audit_events/i);
  assert.match(sql, /'succeeded'/i);
  assert.match(sql, /'rejected'/i);
  assert.match(sql, /'failed'/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
  assert.match(sql, /revoke all privileges[\s\S]*from anon/i);
  assert.match(sql, /revoke all privileges[\s\S]*from authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
});

test("10: Product publish SQL mirrors existing Category, FulfillmentConfig, and SKU eligibility gates", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260810120000_add_atomic_catalog_lifecycle_rpc.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /category\.lifecycle = 'published'/i);
  assert.match(sql, /public\.product_fulfillment_configs/i);
  assert.match(sql, /fulfillment_type = 'digital' and config\.requires_shipping/i);
  assert.match(sql, /public\.product_options/i);
  assert.match(sql, /public\.product_variant_values/i);
  assert.match(sql, /required_option\.is_required/i);
  assert.match(sql, /combination_signature[\s\S]*string_agg/i);
  assert.match(sql, /variant\.is_active[\s\S]*variant\.is_available/i);
  assert.match(sql, /v_previous_lifecycle = v_target_lifecycle[\s\S]*false, null::text/i);
});

test("11: lifecycle UI exposes only publication actions and no hard-delete control", async () => {
  const source = await readFile(
    new URL("../app/admin/products/AdminCatalogLifecycleEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Publish/);
  assert.match(source, /Unpublish/);
  assert.match(source, /Retire/);
  assert.doesNotMatch(source, /Delete|method:\s*["']DELETE["']/);
});
