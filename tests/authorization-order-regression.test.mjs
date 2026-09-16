import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST as unavailableUploadRoute } from "../app/api/uploads/route.ts";
import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
} from "../app/application/admin-customization-field-boundary.ts";
import {
  handleAdminCatalogContentMutation,
} from "../app/server/admin-catalog-http.server.ts";
import {
  handleAdminCatalogLifecycleMutation,
} from "../app/server/admin-catalog-lifecycle-http.server.ts";
import {
  handleAdminCustomizationFieldMutation,
  handleAdminCustomizationFieldQuery,
} from "../app/server/admin-customization-field-http.server.ts";
import {
  createCustomerUploadPreviewHttpHandler,
} from "../app/server/customer-upload-preview-handler.server.ts";
import {
  createCustomerUploadHttpHandler,
} from "../app/server/customer-upload-http-handler.server.ts";
import {
  customerUploadProtectedBoundaryResponse,
  executeCustomerUploadProtectedReceiptOperation,
} from "../app/server/customer-upload-ownership.server.ts";
import { getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";

const origin = "https://photogift.test";
const receiptTarget = { receiptId: "receipt-owned" };
const adminPrincipal = { role: "admin", identity: "configured-admin" };

function requestFor(operation, context = null) {
  const method = operation === "preview" ? "GET" : "POST";
  return new Request(`${origin}/api/customer-uploads/${operation}`, {
    method,
    headers: {
      ...(method === "POST" ? { origin, "sec-fetch-site": "same-origin" } : {}),
      ...(context ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` } : {}),
    },
  });
}

function ownerService(status) {
  return {
    async verifyGuestDraftOwnerContext() {
      return status;
    },
  };
}

function protectedDependencies({ ownerStatus = { status: "missing" }, lookup = { status: "not_found" } } = {}) {
  const calls = {
    receiptFactories: 0,
    receiptLookups: 0,
    previewFactories: 0,
    objectFactories: 0,
    previewAuthorizations: 0,
    objectReads: 0,
  };
  return {
    calls,
    dependencies: {
      ownerService: ownerService(ownerStatus),
      createReceiptRepository() {
        calls.receiptFactories += 1;
        return {
          async findOwnedReceipt() {
            calls.receiptLookups += 1;
            return typeof lookup === "function" ? lookup() : lookup;
          },
        };
      },
      createPreviewAccess() {
        calls.previewFactories += 1;
        return {
          async authorizeCustomerInputPreview() {
            calls.previewAuthorizations += 1;
            return { status: "not_found" };
          },
        };
      },
      createObjectStore() {
        calls.objectFactories += 1;
        return {
          async readPrivateObject() {
            calls.objectReads += 1;
            return { status: "not_found" };
          },
        };
      },
    },
  };
}

function uploadRequest() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "private.png", { type: "image/png" }));
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { origin, "sec-fetch-site": "same-origin" },
  });
}

function observeMultipartParsing(request) {
  let calls = 0;
  return {
    request: new Proxy(request, {
      get(target, property) {
        if (property === "formData") {
          return async () => {
            calls += 1;
            return target.formData();
          };
        }
        return Reflect.get(target, property, target);
      },
    }),
    calls: () => calls,
  };
}

function adminMutationRequest(body = {}) {
  return new Request(`${origin}/api/admin/catalog/products/known`, {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminVerifier(status = "unauthorized") {
  return {
    async verifyAdminSession() {
      return status === "throw"
        ? (() => { throw new Error("verifier unavailable"); })()
        : status === "authorized"
          ? { status, principal: adminPrincipal }
          : { status };
    },
  };
}

test("9.2-1: missing, invalid, and expired guest owners stop before every protected privileged factory", async () => {
  for (const status of [{ status: "missing" }, { status: "invalid" }, { status: "expired" }]) {
    for (const operation of ["preview", "replace", "remove", "attach"]) {
      const setup = protectedDependencies({ ownerStatus: status });
      const result = await executeCustomerUploadProtectedReceiptOperation(
        requestFor(operation),
        operation,
        receiptTarget,
        setup.dependencies,
        async () => { throw new Error("unauthorized continuation"); },
      );
      assert.deepEqual(result, { status: "not_found" }, `${status.status}/${operation}`);
      assert.deepEqual(setup.calls, {
        receiptFactories: 0,
        receiptLookups: 0,
        previewFactories: 0,
        objectFactories: 0,
        previewAuthorizations: 0,
        objectReads: 0,
      }, `${status.status}/${operation}`);
    }
  }
});

test("9.2-2: upload missing/tampered/expired owner context fails before body parsing or acceptance-provider construction", async () => {
  for (const ownerResult of [{ status: "invalid" }, { status: "expired" }]) {
    const calls = { resolution: 0, acceptanceFactories: 0, accepts: 0 };
    const handler = createCustomerUploadHttpHandler({
      ownerService: {
        async ensureGuestDraftOwnerContext() {
          return ownerResult;
        },
        getSetCookieHeader() {
          throw new Error("must not issue a replacement context");
        },
      },
      async resolveFieldConstraints() {
        calls.resolution += 1;
        throw new Error("owner gate must run first");
      },
      createAcceptanceDependencies() {
        calls.acceptanceFactories += 1;
        throw new Error("must not construct upload provider");
      },
      async acceptImageUpload() {
        calls.accepts += 1;
        throw new Error("must not accept upload");
      },
    });
    const observed = observeMultipartParsing(uploadRequest());
    const response = await handler(observed.request);
    assert.equal(response.status, 404, ownerResult.status);
    assert.deepEqual(calls, { resolution: 0, acceptanceFactories: 0, accepts: 0 }, ownerResult.status);
    assert.equal(observed.calls(), 0, ownerResult.status);
    assert.equal(response.headers.get("set-cookie"), null, ownerResult.status);
  }
});

test("9.2-3: owner verifier failure fails closed without reinterpreting it as anonymous ownership", async () => {
  const setup = protectedDependencies({
    ownerStatus: { status: "source_failure" },
  });
  const result = await executeCustomerUploadProtectedReceiptOperation(
    requestFor("preview"),
    "preview",
    receiptTarget,
    setup.dependencies,
    async () => { throw new Error("must not continue"); },
  );
  assert.deepEqual(result, { status: "source_failure" });
  assert.equal(setup.calls.receiptFactories, 0);
  assert.equal(setup.calls.previewFactories, 0);
  assert.equal(setup.calls.objectFactories, 0);

  const calls = { acceptanceFactories: 0, bodyReads: 0 };
  const handler = createCustomerUploadHttpHandler({
    ownerService: {
      async ensureGuestDraftOwnerContext() {
        throw new Error("owner verifier unavailable");
      },
      getSetCookieHeader() {
        throw new Error("must not issue a replacement context");
      },
    },
    async resolveFieldConstraints() {
      throw new Error("must not resolve field policy");
    },
    createAcceptanceDependencies() {
      calls.acceptanceFactories += 1;
      throw new Error("must not construct upload provider");
    },
  });
  const observed = observeMultipartParsing(uploadRequest());
  const response = await handler(observed.request);
  calls.bodyReads = observed.calls();
  assert.equal(response.status, 503);
  assert.deepEqual(calls, { acceptanceFactories: 0, bodyReads: 0 });
});

test("9.2-4: unauthorized preview stops before receipt lookup, capability construction, and private object access", async () => {
  for (const ownerResult of [{ status: "missing" }, { status: "invalid" }, { status: "expired" }]) {
    const setup = protectedDependencies({ ownerStatus: ownerResult });
    const handler = createCustomerUploadPreviewHttpHandler({
      ...setup.dependencies,
      now: () => "2026-08-13T12:00:00.000Z",
    });
    const response = await handler(new Request(`${origin}/api/customer-uploads/preview?receiptId=${receiptTarget.receiptId}`));
    assert.equal(response.status, 404, ownerResult.status);
    assert.deepEqual(await response.json(), { error: "Customer input preview is unavailable." });
    assert.equal(setup.calls.receiptFactories, 0, ownerResult.status);
    assert.equal(setup.calls.previewFactories, 0, ownerResult.status);
    assert.equal(setup.calls.objectFactories, 0, ownerResult.status);
  }
});

test("9.2-5: replace, remove, and attach authorization shells do not reach lifecycle mutation", async () => {
  for (const operation of ["replace", "remove", "attach"]) {
    const setup = protectedDependencies({ ownerStatus: { status: "invalid" } });
    let continuationCalls = 0;
    const result = await executeCustomerUploadProtectedReceiptOperation(
      requestFor(operation),
      operation,
      receiptTarget,
      setup.dependencies,
      async () => {
        continuationCalls += 1;
        return "unexpected";
      },
    );
    assert.deepEqual(result, { status: "not_found" }, operation);
    assert.equal(continuationCalls, 0, operation);
    assert.equal(setup.calls.receiptFactories, 0, operation);
    assert.equal(setup.calls.objectFactories, 0, operation);
  }
});

test("9.2-6: cross-owner known receipt and unknown receipt have the same coarse response and no provider oracle", async () => {
  const cases = [
    { target: { receiptId: "receipt-known-to-another-owner" }, label: "cross-owner" },
    { target: { receiptId: "receipt-never-created" }, label: "unknown" },
  ];
  const results = [];
  for (const candidate of cases) {
    const setup = protectedDependencies({
      ownerStatus: { status: "valid", ownerId: "gdo_owner-a", issuedAt: 1, expiresAt: 2_000_000_000 },
      lookup: { status: "not_found" },
    });
    const result = await executeCustomerUploadProtectedReceiptOperation(
      requestFor("preview", "verified-owner-context"),
      "preview",
      candidate.target,
      setup.dependencies,
      async () => { throw new Error("must not inspect private object"); },
    );
    const response = customerUploadProtectedBoundaryResponse(result);
    results.push({ label: candidate.label, status: response.status, body: await response.json() });
    assert.equal(setup.calls.receiptFactories, 1, candidate.label);
    assert.equal(setup.calls.receiptLookups, 1, candidate.label);
    assert.equal(setup.calls.previewFactories, 0, candidate.label);
    assert.equal(setup.calls.objectFactories, 0, candidate.label);
  }
  assert.deepEqual(
    { status: results[0].status, body: results[0].body },
    { status: results[1].status, body: results[1].body },
  );
  assert.doesNotMatch(JSON.stringify(results), /receipt-known|receipt-never|owner-a|wrong owner|exists/i);
});

test("9.2-7: unauthorized CustomizationField query/command and verifier failure construct zero repositories", async () => {
  for (const productId of ["known-product", "unknown-product"]) {
    let queryFactories = 0;
    let commandFactories = 0;
    const queryResult = await new AdminCustomizationFieldQueryBoundary(
      adminVerifier(),
      () => {
        queryFactories += 1;
        throw new Error("must not construct admin reader");
      },
    ).execute({ productId });
    const commandResult = await new AdminCustomizationFieldCommandBoundary(
      adminVerifier(),
      () => {
        commandFactories += 1;
        throw new Error("must not construct admin repositories");
      },
    ).execute({ productId });
    assert.deepEqual(queryResult, { status: "unauthorized" }, productId);
    assert.deepEqual(commandResult, { status: "unauthorized" }, productId);
    assert.equal(queryFactories, 0, productId);
    assert.equal(commandFactories, 0, productId);
  }

  let factories = 0;
  const failing = adminVerifier("throw");
  const queryResult = await new AdminCustomizationFieldQueryBoundary(failing, () => {
    factories += 1;
    throw new Error("must not construct");
  }).execute({ productId: "known-product" });
  const commandResult = await new AdminCustomizationFieldCommandBoundary(failing, () => {
    factories += 1;
    throw new Error("must not construct");
  }).execute({ productId: "known-product" });
  assert.deepEqual(queryResult, { status: "authentication_failure" });
  assert.deepEqual(commandResult, { status: "authentication_failure" });
  assert.equal(factories, 0);
});

test("9.2-8: admin content/lifecycle/customization HTTP boundaries reject before injected repositories", async () => {
  let factories = 0;
  const dependencies = {
    verifier: adminVerifier(),
    createRepositories() {
      factories += 1;
      throw new Error("must not construct privileged admin repository");
    },
  };
  for (const resourceId of ["known-product", "unknown-product"]) {
    const content = await handleAdminCatalogContentMutation(
      adminMutationRequest(),
      "products",
      resourceId,
      dependencies,
    );
    const lifecycle = await handleAdminCatalogLifecycleMutation(
      adminMutationRequest({ action: "publish" }),
      "products",
      resourceId,
      dependencies,
    );
    assert.equal(content.status, 401, resourceId);
    assert.equal(lifecycle.status, 401, resourceId);
  }
  const customQuery = await handleAdminCustomizationFieldQuery("known-product", {
    verifier: adminVerifier(),
    createReader() {
      factories += 1;
      throw new Error("must not construct customization reader");
    },
    createRepositories: dependencies.createRepositories,
  });
  const customCommand = await handleAdminCustomizationFieldMutation(
    adminMutationRequest(),
    "known-product",
    {
      verifier: adminVerifier(),
      createReader() {
        factories += 1;
        throw new Error("must not construct customization reader");
      },
      createRepositories: dependencies.createRepositories,
    },
  );
  assert.equal(customQuery.status, 401);
  assert.equal(customCommand.status, 401);
  assert.equal(factories, 0);
});

test("9.2-9: existing admin route wrappers remain thin and delegate to protected server boundaries", async () => {
  const routeSources = await Promise.all([
    "app/api/admin/cleanup-uploads/route.ts",
    "app/api/admin/orders/route.ts",
    "app/api/admin/digital-delivery/route.ts",
    "app/api/admin/catalog/[resource]/[id]/route.ts",
    "app/api/admin/catalog/[resource]/[id]/lifecycle/route.ts",
    "app/api/admin/catalog/products/[id]/customization/route.ts",
    "app/api/admin/catalog/products/[id]/assets/route.ts",
    "app/api/admin/catalog/products/[id]/fulfillment/route.ts",
    "app/api/admin/catalog/products/[id]/sku-graph/route.ts",
  ].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")]));
  for (const [path, source] of routeSources) {
    assert.match(source, /export async function (GET|POST|PATCH|DELETE)/, path);
    if (path.includes("cleanup-uploads") || path.includes("orders/route") || path.includes("digital-delivery")) {
      assert.match(source, /isValidAdminSession/, path);
    } else {
      assert.match(source, /createExistingAdminMutationVerifier/, path);
      assert.match(source, /handleAdmin/, path);
    }
  }
});

function assertOrder(source, before, after, label) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.ok(beforeIndex >= 0, `${label}: missing ${before}`);
  assert.ok(afterIndex >= 0, `${label}: missing ${after}`);
  assert.ok(beforeIndex < afterIndex, `${label}: ${before} must precede ${after}`);
}

test("9.2-10: route control flow keeps authorization before database/storage access", async () => {
  const sources = await Promise.all([
    ["cleanup", "app/api/admin/cleanup-uploads/route.ts"],
    ["orders", "app/api/admin/orders/route.ts"],
    ["delivery", "app/api/admin/digital-delivery/route.ts"],
    ["export", "app/api/admin/orders/export/route.ts"],
    ["catalog", "app/server/admin-catalog-http.server.ts"],
    ["lifecycle", "app/server/admin-catalog-lifecycle-http.server.ts"],
    ["customization", "app/server/admin-customization-field-http.server.ts"],
    ["assets", "app/server/admin-product-assets-http.server.ts"],
    ["fulfillment", "app/server/admin-product-fulfillment-http.server.ts"],
    ["sku", "app/server/admin-sku-graph-http.server.ts"],
  ].map(async ([label, path]) => [label, await readFile(new URL(`../${path}`, import.meta.url), "utf8")]));

  for (const [label, source] of sources) {
    const body = source.slice(source.indexOf("export async function"));
    if (["cleanup", "orders", "delivery", "export"].includes(label)) {
      assertOrder(body, "isValidAdminSession", "getSupabaseServerClient", label);
    } else {
      assertOrder(body, "authorization = await dependencies.verifier.verifyAdminSession()", "dependencies.createRepositories", label);
    }
  }
  const cleanupSource = sources.find(([label]) => label === "cleanup")[1];
  assertOrder(cleanupSource.slice(cleanupSource.indexOf("export async function")), "isValidAdminSession", ".storage", "cleanup storage");
  const deliverySource = sources.find(([label]) => label === "delivery")[1];
  assertOrder(deliverySource.slice(deliverySource.indexOf("export async function")), "isValidAdminSession", "formData", "delivery body");
});

test("9.2-11: admin cleanup remains a separately authorized privileged operation, not a guest-owner operation", async () => {
  const [route, lifecycle] = await Promise.all([
    readFile(new URL("../app/api/admin/cleanup-uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-lifecycle-service.ts", import.meta.url), "utf8"),
  ]);
  const routeBody = route.slice(route.indexOf("export async function"));
  assertOrder(routeBody, "isValidAdminSession", "getSupabaseServerClient", "admin cleanup authorization");
  assert.match(lifecycle, /runCustomerUploadCleanup\(input: \{[\s\S]*observedAt:[\s\S]*limit:[\s\S]*operationId:/);
  assert.doesNotMatch(lifecycle, /runCustomerUploadCleanup\(input: \{[\s\S]*ownerId/);
});

test("9.2-12: the existing upload route stays provider-stopped and does not parse an unauthorized multipart body", async () => {
  const priorSecret = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
  const priorTtl = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = "offline-authorization-order-owner-secret-material-1234567890";
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = "3600";
  try {
    const observed = observeMultipartParsing(uploadRequest());
    const response = await unavailableUploadRoute(observed.request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Customer upload is temporarily unavailable." });
    assert.equal(observed.calls(), 0);
  } finally {
    if (priorSecret === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = priorSecret;
    if (priorTtl === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = priorTtl;
  }
});

test("9.2-13: normalized checkout remains the existing 503 fail-closed boundary", async () => {
  const route = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const gate = route.indexOf("requestedItems.some(isNormalizedOrderRequestItem)");
  const response = route.indexOf("Personalized checkout is temporarily unavailable.", gate);
  const catalogConstruction = route.indexOf("const catalog = await createServerCatalogRepository();", gate);
  const orderInsert = route.indexOf('.from("orders")', gate);
  assert.ok(gate >= 0);
  assert.ok(response > gate);
  assert.match(route.slice(response - 40, response + 140), /status: 503/);
  assert.ok(catalogConstruction > response);
  assert.ok(orderInsert > catalogConstruction);
});
