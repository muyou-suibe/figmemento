import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminCatalogCommandBoundary,
  AdminCatalogQueryBoundary,
} from "../app/application/admin-catalog-boundary.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { SupabaseCatalogAdminCommandRepository } from "../app/infrastructure/catalog/supabase-catalog-admin-repository.ts";
import {
  handleAdminCatalogContentMutation,
  isSameOriginAdminMutation,
} from "../app/server/admin-catalog-http.server.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function cloneFixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function createRepositories(dataSet = cloneFixtures(), writeResult) {
  const calls = { reads: 0, writes: 0, values: [] };
  const reader = {
    async readAdminCatalogGraph() {
      calls.reads += 1;
      return { status: "found", value: dataSet };
    },
  };
  const apply = async (value) => {
    calls.writes += 1;
    calls.values.push(value);
    return writeResult ?? { status: "applied", value };
  };
  const writer = {
    saveCategory: apply,
    saveProduct: apply,
    saveOption: apply,
    saveOptionValue: apply,
    saveVariant: apply,
    saveAsset: apply,
    saveFulfillmentConfig: apply,
  };
  return { reader, writer, calls };
}

function commandBoundary(repositories, verifier = authorized) {
  return new AdminCatalogCommandBoundary(verifier, () => repositories);
}

function productCommand(product) {
  return { kind: "save_product", payload: product };
}

function categoryCommand(category) {
  return { kind: "save_category", payload: category };
}

function mutationRequest(body, origin = "https://photogift.test") {
  return new Request("https://photogift.test/api/admin/catalog/products/product-1", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

test("1-2: unauthorized admin list creates no privileged source; authorized list is provider-neutral", async () => {
  let unauthorizedFactories = 0;
  const denied = new AdminCatalogQueryBoundary(unauthorized, () => {
    unauthorizedFactories += 1;
    throw new Error("must not create source");
  });
  assert.equal((await denied.execute({})).status, "unauthorized");
  assert.equal(unauthorizedFactories, 0);

  const repositories = createRepositories();
  const allowed = await new AdminCatalogQueryBoundary(authorized, () => repositories.reader).execute({});
  assert.equal(allowed.status, "found");
  assert.equal(allowed.value.products.length, 22);
  assert.equal(allowed.value.categories.length > 0, true);
  assert.equal("supabase" in allowed.value, false);
});

test("3: Product content edit preserves ID and changes only approved domain content", async () => {
  const dataSet = cloneFixtures();
  const original = dataSet.products[0];
  const candidate = { ...original, name: "Edited product", description: "Updated customer-facing description." };
  const repositories = createRepositories(dataSet);
  const result = await commandBoundary(repositories).execute(productCommand(candidate), {
    allowedKinds: ["save_product"], existingResourceId: original.id, preserveLifecycle: true,
  });
  assert.equal(result.status, "applied");
  assert.equal(result.value.id, original.id);
  assert.equal(result.value.name, "Edited product");
  assert.equal(repositories.calls.writes, 1);
});

test("4: Category content edit preserves its stable ID", async () => {
  const dataSet = cloneFixtures();
  const original = dataSet.categories[0];
  const candidate = { ...original, name: "Edited category" };
  const repositories = createRepositories(dataSet);
  const result = await commandBoundary(repositories).execute(categoryCommand(candidate), {
    allowedKinds: ["save_category"], existingResourceId: original.id, preserveLifecycle: true,
  });
  assert.equal(result.status, "applied");
  assert.equal(result.value.id, original.id);
  assert.equal(repositories.calls.writes, 1);
});

test("5-6: browser cannot change Product identity or lifecycle through ordinary content edit", async () => {
  const dataSet = cloneFixtures();
  const original = dataSet.products[0];
  for (const candidate of [
    { ...original, id: "different-product-id" },
    { ...original, lifecycle: original.lifecycle === "draft" ? "published" : "draft" },
  ]) {
    const repositories = createRepositories(dataSet);
    const result = await commandBoundary(repositories).execute(productCommand(candidate), {
      allowedKinds: ["save_product"], existingResourceId: original.id, preserveLifecycle: true,
    });
    assert.equal(result.status, "invalid_request");
    assert.equal(repositories.calls.writes, 0);
  }
});

test("7-9: duplicate Product/Category slugs and missing Category are rejected before write", async () => {
  const dataSet = cloneFixtures();
  const cases = [
    {
      command: productCommand({ ...dataSet.products[0], slug: dataSet.products[1].slug }),
      constraints: { allowedKinds: ["save_product"], existingResourceId: dataSet.products[0].id, preserveLifecycle: true },
    },
    {
      command: categoryCommand({ ...dataSet.categories[0], slug: dataSet.categories[1].slug }),
      constraints: { allowedKinds: ["save_category"], existingResourceId: dataSet.categories[0].id, preserveLifecycle: true },
    },
    {
      command: productCommand({ ...dataSet.products[0], categoryId: "missing-category" }),
      constraints: { allowedKinds: ["save_product"], existingResourceId: dataSet.products[0].id, preserveLifecycle: true },
    },
  ];
  for (const item of cases) {
    const repositories = createRepositories(dataSet);
    const result = await commandBoundary(repositories).execute(item.command, item.constraints);
    assert.equal(result.status, "invalid_request");
    assert.equal(repositories.calls.writes, 0);
  }
});

test("10: malformed and unknown fields fail before privileged repositories are created", async () => {
  let factories = 0;
  const boundary = new AdminCatalogCommandBoundary(authorized, () => {
    factories += 1;
    throw new Error("must not create repositories");
  });
  const result = await boundary.execute({
    kind: "save_product",
    payload: { id: "product", lifecycle: "draft", priceCents: 1 },
  }, { allowedKinds: ["save_product"], existingResourceId: "product", preserveLifecycle: true });
  assert.equal(result.status, "invalid_request");
  assert.equal(factories, 0);
});

test("11: write failure is explicit and HTTP response hides raw database details", async () => {
  const dataSet = cloneFixtures();
  const product = dataSet.products[0];
  const repositories = createRepositories(dataSet, { status: "source_failure", operation: "password=raw-secret" });
  const response = await handleAdminCatalogContentMutation(
    mutationRequest(productCommand(product)),
    "products",
    product.id,
    { verifier: authorized, createRepositories: () => repositories },
  );
  const text = await response.text();
  assert.equal(response.status, 503);
  assert.equal(text.includes("raw-secret"), false);
  assert.equal(text.includes("password"), false);
});

test("12: unauthorized mutation stops before writer factory and before payload parsing", async () => {
  let factories = 0;
  const response = await handleAdminCatalogContentMutation(
    mutationRequest("not a command", "https://attacker.test"),
    "products",
    "product-1",
    {
      verifier: unauthorized,
      createRepositories: () => {
        factories += 1;
        throw new Error("must not create writer");
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(factories, 0);
});

test("13: production admin composition has no fixture fallback", async () => {
  const factorySource = await readFile(new URL("../app/infrastructure/catalog/catalog-repository-factory.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/admin/products/page.tsx", import.meta.url), "utf8");
  assert.equal(factorySource.includes("development-catalog"), false);
  assert.equal(pageSource.includes("fixture"), false);
  assert.equal(factorySource.includes("SupabaseCatalogRepository"), true);
});

test("14: mutation transport is POST-only and requires an exact same Origin", async () => {
  assert.equal(isSameOriginAdminMutation(mutationRequest({})), true);
  assert.equal(isSameOriginAdminMutation(mutationRequest({}, "https://attacker.test")), false);
  assert.equal(isSameOriginAdminMutation(new Request("https://photogift.test/api/admin/catalog/products/id", { method: "POST" })), false);
  const routeSource = await readFile(new URL("../app/api/admin/catalog/[resource]/[id]/route.ts", import.meta.url), "utf8");
  assert.equal(routeSource.includes("export async function POST"), true);
  assert.equal(routeSource.includes("export async function GET"), false);
});

test("concrete Category/Product writer uses fixed tables and explicit content-only columns", async () => {
  const dataSet = cloneFixtures();
  const category = dataSet.categories[0];
  const product = dataSet.products[0];
  const calls = [];
  const writer = {
    async updateCategory(id, columns) {
      calls.push({ method: "category", id, columns });
      return { data: { ...category, ...columns }, error: null };
    },
    async updateProduct(id, columns) {
      calls.push({ method: "product", id, columns });
      return { data: { id, slug: columns.slug, category_id: columns.category_id, name: columns.name, description: columns.description, seo: columns.seo, lifecycle: product.lifecycle }, error: null };
    },
  };
  const repository = new SupabaseCatalogAdminCommandRepository(writer);
  assert.equal((await repository.saveCategory({ ...category, name: "Category content" })).status, "applied");
  assert.equal((await repository.saveProduct({ ...product, name: "Product content" })).status, "applied");
  assert.deepEqual(Object.keys(calls[0].columns).sort(), ["description", "name", "seo", "slug"]);
  assert.deepEqual(Object.keys(calls[1].columns).sort(), ["category_id", "description", "name", "seo", "slug"]);
  for (const call of calls) {
    assert.equal("id" in call.columns, false);
    assert.equal("lifecycle" in call.columns, false);
    assert.equal("price_cents" in call.columns, false);
  }
});
