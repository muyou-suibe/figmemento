import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminCatalogCommandBoundary,
  AdminCatalogQueryBoundary,
} from "../app/application/admin-catalog-boundary.ts";
import { createSignedAdminSession } from "../app/application/admin-session.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { ExistingAdminSessionVerifier } from "../app/server/admin-catalog-session.server.ts";

const authorized = {
  async verifyAdminSession() {
    return {
      status: "authorized",
      principal: { role: "admin", identity: "configured-admin" },
    };
  },
};

const unauthorized = {
  async verifyAdminSession() {
    return { status: "unauthorized" };
  },
};

function cloneFixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function createFakeRepositories(dataSet = cloneFixtures(), options = {}) {
  const calls = { reads: 0, writes: 0, methods: [] };
  const reader = {
    async readAdminCatalogGraph() {
      calls.reads += 1;
      return options.readResult ?? { status: "found", value: dataSet };
    },
  };
  const apply = async (method, value) => {
    calls.writes += 1;
    calls.methods.push(method);
    return options.writeResult ?? { status: "applied", value };
  };
  const writer = {
    saveCategory: (value) => apply("saveCategory", value),
    saveProduct: (value) => apply("saveProduct", value),
    saveOption: (value) => apply("saveOption", value),
    saveOptionValue: (value) => apply("saveOptionValue", value),
    saveVariant: (value) => apply("saveVariant", value),
    saveAsset: (value) => apply("saveAsset", value),
    saveFulfillmentConfig: (value) => apply("saveFulfillmentConfig", value),
  };
  return { calls, reader, writer };
}

test("existing signed administrator session maps to the single configured admin principal", async () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "offline-admin-boundary-test-password";
  try {
    const token = await createSignedAdminSession(process.env.ADMIN_PASSWORD);
    assert.deepEqual(await new ExistingAdminSessionVerifier(token).verifyAdminSession(), {
      status: "authorized",
      principal: { role: "admin", identity: "configured-admin" },
    });
    assert.deepEqual(await new ExistingAdminSessionVerifier("invalid").verifyAdminSession(), {
      status: "unauthorized",
    });
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});

test("A: unauthorized query never creates or invokes a privileged catalog source", async () => {
  let factories = 0;
  const boundary = new AdminCatalogQueryBoundary(unauthorized, () => {
    factories += 1;
    throw new Error("must not construct privileged source");
  });
  assert.deepEqual(await boundary.execute({}), { status: "unauthorized" });
  assert.equal(factories, 0);
});

test("B: unauthorized command never creates a writer", async () => {
  let factories = 0;
  const boundary = new AdminCatalogCommandBoundary(unauthorized, () => {
    factories += 1;
    throw new Error("must not construct writer");
  });
  assert.deepEqual(await boundary.execute({ kind: "save_category", payload: {} }), {
    status: "unauthorized",
  });
  assert.equal(factories, 0);
});

test("C: authorized query returns only the provider-neutral catalog graph", async () => {
  const repositories = createFakeRepositories();
  const result = await new AdminCatalogQueryBoundary(authorized, () => repositories.reader).execute({});
  assert.equal(result.status, "found");
  assert.equal(result.value.categories.length > 0, true);
  assert.equal("supabase" in result.value, false);
  assert.deepEqual(result.principal, { role: "admin", identity: "configured-admin" });
  assert.equal(repositories.calls.reads, 1);
});

test("D: authorized valid command invokes its typed writer exactly once", async () => {
  const dataSet = cloneFixtures();
  const category = { ...dataSet.categories[0], name: "Updated catalog category" };
  const repositories = createFakeRepositories(dataSet);
  const result = await new AdminCatalogCommandBoundary(authorized, () => repositories).execute({
    kind: "save_category",
    payload: category,
  });
  assert.equal(result.status, "applied");
  assert.equal(result.value.name, "Updated catalog category");
  assert.deepEqual(repositories.calls.methods, ["saveCategory"]);
  assert.equal(repositories.calls.writes, 1);
});

test("E: malformed command is rejected before privileged repositories are created", async () => {
  let factories = 0;
  const boundary = new AdminCatalogCommandBoundary(authorized, () => {
    factories += 1;
    throw new Error("invalid input must not reach persistence");
  });
  const result = await boundary.execute({
    kind: "save_variant",
    payload: { id: "variant-only", priceCents: -1, currency: "EUR" },
  });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.issues.some((issue) => issue.path.startsWith("$.payload")), true);
  assert.equal(factories, 0);
});

test("F: shared catalog validation rejects a cross-Product asset before persistence", async () => {
  const dataSet = cloneFixtures();
  const firstProduct = dataSet.products[0];
  const otherVariant = dataSet.variants.find((variant) => variant.productId !== firstProduct.id);
  const asset = {
    ...dataSet.assets.find((candidate) => candidate.productId === firstProduct.id),
    id: "admin-cross-product-asset",
    variantId: otherVariant.id,
  };
  const repositories = createFakeRepositories(dataSet);
  const result = await new AdminCatalogCommandBoundary(authorized, () => repositories).execute({
    kind: "save_asset",
    payload: asset,
  });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.issues.some((issue) => issue.code === "ownership"), true);
  assert.equal(repositories.calls.reads, 1);
  assert.equal(repositories.calls.writes, 0);
});

test("G: repository failures become safe boundary failures without leaking details", async () => {
  const queryRepositories = createFakeRepositories(cloneFixtures(), {
    readResult: { status: "source_failure", operation: "raw-secret-bearing-operation" },
  });
  assert.deepEqual(
    await new AdminCatalogQueryBoundary(authorized, () => queryRepositories.reader).execute({}),
    { status: "source_failure", operation: "admin_catalog_query" },
  );

  const commandRepositories = createFakeRepositories(cloneFixtures(), {
    writeResult: { status: "source_failure", operation: "raw-database-error" },
  });
  const category = { ...cloneFixtures().categories[0], name: "Safe failure" };
  assert.deepEqual(
    await new AdminCatalogCommandBoundary(authorized, () => commandRepositories).execute({
      kind: "save_category",
      payload: category,
    }),
    { status: "source_failure", operation: "admin_catalog_command" },
  );
  assert.equal(commandRepositories.calls.writes, 1);
});

test("H: verifier failure fails closed before any privileged dependency is created", async () => {
  let factories = 0;
  const failingVerifier = {
    async verifyAdminSession() {
      throw new Error("verification infrastructure unavailable");
    },
  };
  const query = new AdminCatalogQueryBoundary(failingVerifier, () => {
    factories += 1;
    throw new Error("must not run");
  });
  const command = new AdminCatalogCommandBoundary(failingVerifier, () => {
    factories += 1;
    throw new Error("must not run");
  });
  assert.deepEqual(await query.execute({}), { status: "authentication_failure" });
  assert.deepEqual(await command.execute({ kind: "save_category", payload: {} }), {
    status: "authentication_failure",
  });
  assert.equal(factories, 0);
});

test("I: repeated unauthorized and invalid requests remain side-effect free", async () => {
  let unauthorizedFactories = 0;
  const unauthorizedBoundary = new AdminCatalogCommandBoundary(unauthorized, () => {
    unauthorizedFactories += 1;
    throw new Error("must not run");
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(
      (await unauthorizedBoundary.execute({ kind: "save_category", payload: {} })).status,
      "unauthorized",
    );
  }
  assert.equal(unauthorizedFactories, 0);

  let invalidFactories = 0;
  const invalidBoundary = new AdminCatalogCommandBoundary(authorized, () => {
    invalidFactories += 1;
    throw new Error("must not run");
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await invalidBoundary.execute({ kind: "unknown", payload: {} })).status, "invalid_request");
  }
  assert.equal(invalidFactories, 0);
});
