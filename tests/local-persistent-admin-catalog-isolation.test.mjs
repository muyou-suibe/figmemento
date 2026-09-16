import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  readAdminCatalogSourceConfiguration,
} from "../app/server/admin-source-resolution.server.ts";
import {
  createAdminCatalogReader,
  createAdminCatalogRepositories,
} from "../app/server/admin-catalog-source.server.ts";
import {
  getSharedLocalCatalogAdminRuntime,
  resetSharedLocalCatalogAdminRuntimeForTests,
} from "../app/infrastructure/catalog/local-admin-catalog-runtime.server.ts";
import {
  resolveLocalPersistentComposition,
} from "../app/application/local-persistent-commerce-composition.server.ts";
import {
  readCartConfig,
  readCustomerAuthConfig,
  readProductSource,
} from "../app/config/server.ts";
import { readLocalCheckoutConfig } from "../app/config/local-checkout-runtime.ts";
import { readLocalOrderConfig } from "../app/config/local-order-runtime.ts";
import { readLocalPaymentConfig } from "../app/config/local-payment-runtime.ts";
import { readLocalFulfillmentConfig } from "../app/config/local-fulfillment-runtime.ts";
import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { LocalCatalogAuthority } from "../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import {
  catalogTestEnvironment,
  ids,
  offlineCatalogClient,
} from "./fixtures/local-persistent-catalog.mjs";

const persistentEnvironment = () => catalogTestEnvironment({
  ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
});

async function withPersistentAdminEnvironment(callback) {
  const keys = ["NODE_ENV", "ADMIN_ACCEPTANCE_SOURCE"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.ADMIN_ACCEPTANCE_SOURCE = "local_persistent";
  resetSharedLocalCatalogAdminRuntimeForTests();
  try {
    return await callback();
  } finally {
    resetSharedLocalCatalogAdminRuntimeForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Task 8.3 projects persistent Admin commerce to explicit process-memory Catalog", async () => {
  assert.deepEqual(readAdminCatalogSourceConfiguration({}, "test"), {
    status: "production",
    source: "production",
  });
  for (const selected of ["local_fake", "local_persistent"]) {
    assert.deepEqual(readAdminCatalogSourceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: selected }, "test"), {
      status: "local_fake",
      source: "local_fake",
      restartLoss: true,
    });
  }
  assert.equal(
    readAdminCatalogSourceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_persistent" }, "production").status,
    "configuration_failure",
  );

  await withPersistentAdminEnvironment(async () => {
    const runtime = getSharedLocalCatalogAdminRuntime();
    assert.strictEqual(createAdminCatalogReader(), runtime.reader);
    assert.strictEqual(createAdminCatalogRepositories().writer, runtime.commandRepository);
  });
});

test("Task 8.3 fake Product and price edits cannot alter persistent Catalog purchase facts", async () => {
  await withPersistentAdminEnvironment(async () => {
    const authority = new LocalCatalogAuthority(persistentEnvironment(), offlineCatalogClient());
    const persistentBefore = await authority.repository.findPublicProductById(ids.product);
    assert.equal(persistentBefore.status, "found");

    const runtime = getSharedLocalCatalogAdminRuntime();
    const fakeBefore = runtime.state.snapshotCatalog();
    const fakeProduct = fakeBefore.products[0];
    const fakeVariant = fakeBefore.variants.find((variant) => variant.productId === fakeProduct.id);
    assert.ok(fakeVariant);
    assert.equal(runtime.state.commitCatalog({
      ...fakeBefore,
      products: fakeBefore.products.map((product) => product.id === fakeProduct.id
        ? { ...product, name: "Task 8.3 fake-only Product" }
        : product),
      variants: fakeBefore.variants.map((variant) => variant.id === fakeVariant.id
        ? { ...variant, priceCents: variant.priceCents + 777 }
        : variant),
    }).ok, true);

    const fakeAfter = runtime.state.snapshotCatalog();
    assert.equal(fakeAfter.products.find((product) => product.id === fakeProduct.id).name, "Task 8.3 fake-only Product");
    assert.equal(fakeAfter.variants.find((variant) => variant.id === fakeVariant.id).priceCents, fakeVariant.priceCents + 777);
    assert.deepEqual(await authority.repository.findPublicProductById(ids.product), persistentBefore);

    resetSharedLocalCatalogAdminRuntimeForTests();
    const afterRestart = getSharedLocalCatalogAdminRuntime().state.snapshotCatalog();
    assert.equal(afterRestart.products.find((product) => product.id === fakeProduct.id).name, fakeProduct.name);
    assert.equal(afterRestart.variants.find((variant) => variant.id === fakeVariant.id).priceCents, fakeVariant.priceCents);
  });
});

test("Task 8.3 Admin selection alone activates no public commerce capability", () => {
  const environment = { NODE_ENV: "test", ADMIN_ACCEPTANCE_SOURCE: "local_persistent" };
  assert.equal(readProductSource(environment), "supabase");
  assert.equal(readCustomerAuthConfig(environment, "test").source, "disabled");
  assert.equal(readCartConfig(environment, "test").source, "disabled");
  assert.equal(readLocalCheckoutConfig(environment, "test").source, "disabled");
  assert.equal(readLocalOrderConfig(environment, "test").source, "disabled");
  assert.equal(readLocalPaymentConfig(environment, "test").source, "disabled");
  assert.equal(readLocalFulfillmentConfig(environment, "test").source, "disabled");
  assert.equal(readLocalTrackingConfig(environment, "test").source, "disabled");
  const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin"] });
  assert.equal(composition.status, "unavailable");
  assert.ok(composition.issues.some((issue) => issue.code === "dependency_source_mismatch"));
});

test("Task 8.3 adds no persistent Catalog CRUD boundary or fake fallback into public authority", () => {
  const source = readFileSync(new URL("../app/server/admin-catalog-source.server.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/products/page.tsx", import.meta.url), "utf8");
  const authority = readFileSync(new URL("../app/infrastructure/local-commerce/local-catalog-authority.server.ts", import.meta.url), "utf8");
  assert.match(source, /resolveAuthorizedAdminCatalogSource/);
  assert.doesNotMatch(source, /LocalCatalogAuthority|local-persistent.*catalog.*writer/i);
  assert.match(page, /process-memory only and reset when the development process restarts/);
  assert.doesNotMatch(authority, /local-admin-catalog|development-catalog|fallback/i);
});
