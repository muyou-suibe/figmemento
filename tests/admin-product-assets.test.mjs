import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminProductAssetBoundary,
} from "../app/application/admin-product-assets.ts";
import { AdminCatalogQueryBoundary } from "../app/application/admin-catalog-boundary.ts";
import { sortCatalogDataSet } from "../app/application/catalog-data-set.ts";
import { deriveCatalogDraftUuid } from "../app/application/catalog-draft-identity.ts";
import { isIdentifier } from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { SupabaseProductAssetRepository } from "../app/infrastructure/catalog/supabase-product-asset-repository.ts";
import { handleAdminProductAssetMutation } from "../app/server/admin-product-assets-http.server.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function fixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function assetIntent(dataSet = fixtures(), overrides = {}) {
  const productId = overrides.productId ?? dataSet.products[0].id;
  return {
    operation: "create",
    productId,
    asset: {
      id: "new:marketing-asset",
      productId,
      mediaType: "image",
      role: "gallery",
      position: 2,
      altText: "Warm personalized gift portrait",
      title: "Gift portrait",
      width: 1200,
      height: 900,
      visibility: "public",
      source: { kind: "url", value: "https://cdn.example.test/gift.webp" },
      ...overrides.asset,
    },
    ...overrides.command,
  };
}

function repositories(dataSet = fixtures(), resultOverride) {
  const calls = { reads: 0, creates: [], updates: [], removes: [] };
  const result = (value) => resultOverride ?? { status: "applied", value };
  return {
    calls,
    reader: {
      async readAdminCatalogGraph() {
        calls.reads += 1;
        return { status: "found", value: dataSet };
      },
    },
    writer: {
      async createProductAsset(asset) {
        calls.creates.push(asset);
        return result(asset);
      },
      async updateProductAsset(asset) {
        calls.updates.push(asset);
        return result(asset);
      },
      async removeProductAsset(asset) {
        calls.removes.push(asset);
        return result(asset);
      },
    },
  };
}

function request(body, origin = "https://photogift.test") {
  return new Request("https://photogift.test/api/admin/catalog/products/product/assets", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

function updateIntent(asset, patch = {}) {
  const updated = { ...asset, ...patch };
  return { operation: "update", productId: updated.productId, asset: updated };
}

function rowFor(asset) {
  return {
    id: asset.id,
    product_id: asset.productId,
    variant_id: asset.variantId ?? null,
    media_type: asset.mediaType,
    role: asset.role,
    position: asset.position,
    alt_text: asset.altText ?? null,
    title: asset.title ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    visibility: "public",
    source_kind: asset.source.kind,
    source_value: asset.source.value,
  };
}

test("1: unauthorized ProductAsset read and mutation create no privileged dependency", async () => {
  let readFactories = 0;
  const read = await new AdminCatalogQueryBoundary(unauthorized, () => {
    readFactories += 1;
    throw new Error("must not create reader");
  }).execute({});
  assert.equal(read.status, "unauthorized");
  assert.equal(readFactories, 0);

  let writeFactories = 0;
  const intent = assetIntent();
  const response = await handleAdminProductAssetMutation(
    request(intent, "https://attacker.test"),
    intent.productId,
    {
      verifier: unauthorized,
      createRepositories() {
        writeFactories += 1;
        throw new Error("must not create writer");
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(writeFactories, 0);
});

test("2-3: cross-origin and unknown-field mutations stop before writer creation", async () => {
  const base = assetIntent();
  for (const [candidate, origin, status] of [
    [base, "https://attacker.test", 403],
    [{ ...base, storageBucket: "private-customer-files" }, "https://photogift.test", 400],
    [{ ...base, asset: { ...base.asset, privateObjectKey: "customer/order/file" } }, "https://photogift.test", 400],
  ]) {
    let factories = 0;
    const response = await handleAdminProductAssetMutation(request(candidate, origin), base.productId, {
      verifier: authorized,
      createRepositories() {
        factories += 1;
        throw new Error("must not create writer");
      },
    });
    assert.equal(response.status, status);
    assert.equal(factories, 0);
  }
});

test("4-6: valid Product image, video, and same-Product Variant assets are created", async () => {
  const dataSet = fixtures();
  const productId = dataSet.products[0].id;
  const variant = dataSet.variants.find((candidate) => candidate.productId === productId);
  assert.ok(variant);
  const cases = [
    assetIntent(dataSet),
    assetIntent(dataSet, { asset: { id: "new:video", mediaType: "video", source: { kind: "public_reference", value: "marketing:launch-video" } } }),
    assetIntent(dataSet, { asset: { id: "new:variant-image", variantId: variant.id } }),
  ];
  for (const intent of cases) {
    const repos = repositories(dataSet);
    const result = await new AdminProductAssetBoundary(authorized, () => repos).execute(productId, intent);
    assert.equal(result.status, "applied");
    assert.equal(isIdentifier(result.value.id), true);
    assert.equal(result.value.id.startsWith("new:"), false);
    assert.equal(repos.calls.creates.length, 1);
    assert.equal(repos.calls.updates.length + repos.calls.removes.length, 0);
  }
});

test("7-8: cross-Product Variant association and Asset identity tampering are rejected", async () => {
  const dataSet = fixtures();
  const first = dataSet.products[0].id;
  const second = dataSet.products[1].id;
  const otherVariant = dataSet.variants.find((variant) => variant.productId === second);
  assert.ok(otherVariant);
  const crossVariant = assetIntent(dataSet, { asset: { variantId: otherVariant.id } });
  const variantRepositories = repositories(dataSet);
  const variantResult = await new AdminProductAssetBoundary(authorized, () => variantRepositories).execute(first, crossVariant);
  assert.equal(variantResult.status, "invalid_request");
  assert.equal(variantRepositories.calls.creates.length, 0);

  const existing = dataSet.assets.find((asset) => asset.productId === first);
  assert.ok(existing);
  const tampered = updateIntent({ ...existing, productId: second });
  const identityRepositories = repositories(dataSet);
  const identityResult = await new AdminProductAssetBoundary(authorized, () => identityRepositories).execute(second, tampered);
  assert.equal(identityResult.status, "invalid_request");
  assert.equal(identityRepositories.calls.updates.length, 0);
});

test("9-12: invalid media, role, URL, and private-like references fail before persistence", async () => {
  const dataSet = fixtures();
  const base = assetIntent(dataSet);
  const invalidAssets = [
    { ...base.asset, mediaType: "document" },
    { ...base.asset, role: "production_preview" },
    { ...base.asset, source: { kind: "url", value: "http://cdn.example.test/file.jpg" } },
    ...["private:file", "customer:file", "order:file", "preview:file", "delivery:file"].map((value) => ({
      ...base.asset,
      source: { kind: "public_reference", value },
    })),
  ];
  for (const asset of invalidAssets) {
    let factories = 0;
    const result = await new AdminProductAssetBoundary(authorized, () => {
      factories += 1;
      throw new Error("must not create repositories");
    }).execute(base.productId, { ...base, asset });
    assert.equal(result.status, "invalid_request");
    assert.equal(factories, 0);
  }
});

test("13-15: ordering is deterministic and updates preserve Asset and Product identity", async () => {
  const dataSet = fixtures();
  const productId = dataSet.products[0].id;
  const existing = dataSet.assets.find((asset) => asset.productId === productId);
  assert.ok(existing);
  dataSet.assets.push({ ...existing, id: "asset-z", position: 4 }, { ...existing, id: "asset-a", position: 4 });
  const ordered = sortCatalogDataSet(dataSet).assets.filter((asset) => asset.productId === productId);
  const tied = ordered.filter((asset) => asset.position === 4).map((asset) => asset.id);
  assert.deepEqual(tied, [...tied].sort());

  const cleanDataSet = fixtures();
  const cleanExisting = cleanDataSet.assets.find((asset) => asset.productId === productId);
  const beforeProducts = structuredClone(cleanDataSet.products);
  const beforeVariants = structuredClone(cleanDataSet.variants);
  const repos = repositories(cleanDataSet);
  let derivations = 0;
  const result = await new AdminProductAssetBoundary(authorized, () => repos, () => {
    derivations += 1;
    throw new Error("existing identity must not be rederived");
  }).execute(productId, updateIntent(cleanExisting, { position: cleanExisting.position + 3, title: "Updated title" }));
  assert.equal(result.status, "applied");
  assert.equal(result.value.id, cleanExisting.id);
  assert.equal(result.value.productId, cleanExisting.productId);
  assert.equal(result.value.position, cleanExisting.position + 3);
  assert.equal(derivations, 0);
  assert.deepEqual(cleanDataSet.products, beforeProducts);
  assert.deepEqual(cleanDataSet.variants, beforeVariants);
  assert.equal(repos.calls.updates.length, 1);
});

test("16-17: removal is safe and blocked while Product SEO references the Asset", async () => {
  const dataSet = fixtures();
  const existing = dataSet.assets[0];
  const command = { operation: "remove", productId: existing.productId, assetId: existing.id };
  const repos = repositories(dataSet);
  const removed = await new AdminProductAssetBoundary(authorized, () => repos).execute(existing.productId, command);
  assert.equal(removed.status, "applied");
  assert.equal(repos.calls.removes.length, 1);
  assert.equal(repos.calls.creates.length + repos.calls.updates.length, 0);

  const referenced = fixtures();
  const referencedAsset = referenced.assets[0];
  const productIndex = referenced.products.findIndex((product) => product.id === referencedAsset.productId);
  referenced.products[productIndex] = {
    ...referenced.products[productIndex],
    seo: { ...referenced.products[productIndex].seo, imageAssetId: referencedAsset.id },
  };
  const blockedRepositories = repositories(referenced);
  const blocked = await new AdminProductAssetBoundary(authorized, () => blockedRepositories).execute(
    referencedAsset.productId,
    { operation: "remove", productId: referencedAsset.productId, assetId: referencedAsset.id },
  );
  assert.equal(blocked.status, "invalid_request");
  assert.equal(blockedRepositories.calls.removes.length, 0);
  assert.equal(blocked.issues.some((issue) => issue.path.includes("seo.imageAssetId")), true);
});

test("18-20: lost-response retry reuses one Asset identity and existing IDs are not derived", async () => {
  const initial = fixtures();
  const intent = assetIntent(initial, { asset: { id: "new:retry-safe" } });
  const firstRepositories = repositories(initial);
  const first = await new AdminProductAssetBoundary(authorized, () => firstRepositories).execute(intent.productId, intent);
  assert.equal(first.status, "applied");
  const committed = { ...initial, assets: [...initial.assets, first.value] };
  const retryRepositories = repositories(committed);
  const retry = await new AdminProductAssetBoundary(authorized, () => retryRepositories).execute(
    intent.productId,
    structuredClone(intent),
  );
  assert.equal(retry.status, "applied");
  assert.equal(retry.value.id, first.value.id);
  assert.equal(retryRepositories.calls.creates.length, 0);
  assert.equal(committed.assets.filter((asset) => asset.id === first.value.id).length, 1);

  const otherProduct = initial.products[1].id;
  assert.notEqual(
    await deriveCatalogDraftUuid(intent.productId, "asset", intent.asset.id),
    await deriveCatalogDraftUuid(otherProduct, "asset", intent.asset.id),
  );
  assert.notEqual(
    await deriveCatalogDraftUuid(intent.productId, "asset", intent.asset.id),
    await deriveCatalogDraftUuid(intent.productId, "variant", intent.asset.id),
  );
});

test("21-23: adapter performs only explicit ProductAsset operations and maps failures safely", async () => {
  const dataSet = fixtures();
  const asset = dataSet.assets[0];
  const calls = [];
  const writer = {
    async insertAsset(columns) {
      calls.push({ operation: "insert", columns });
      return { data: rowFor({ ...asset, id: columns.id }), error: null };
    },
    async updateAsset(id, productId, columns) {
      calls.push({ operation: "update", id, productId, columns });
      return { data: rowFor({ ...asset, ...{
        role: columns.role,
        position: columns.position,
        source: { kind: columns.source_kind, value: columns.source_value },
      } }), error: null };
    },
    async deleteAsset(id, productId) {
      calls.push({ operation: "delete", id, productId });
      return { data: rowFor(asset), error: null };
    },
  };
  const repository = new SupabaseProductAssetRepository(writer);
  const created = { ...asset, id: "11111111-1111-5111-8111-111111111111" };
  assert.equal((await repository.createProductAsset(created)).status, "applied");
  assert.equal((await repository.updateProductAsset({ ...asset, position: 9 })).status, "applied");
  assert.equal((await repository.removeProductAsset(asset)).status, "applied");
  assert.deepEqual(calls.map((call) => call.operation), ["insert", "update", "delete"]);
  assert.deepEqual(Object.keys(calls[0].columns).sort(), [
    "alt_text", "height", "id", "media_type", "position", "product_id", "role", "source_kind",
    "source_value", "title", "variant_id", "visibility", "width",
  ]);
  assert.equal("id" in calls[1].columns, false);
  assert.equal("product_id" in calls[1].columns, false);

  const failing = new SupabaseProductAssetRepository({
    async insertAsset() { return { data: null, error: { code: "XX000", message: "password=secret", detail: "private_uploads" } }; },
    async updateAsset() { return { data: null, error: { code: "XX000", message: "password=secret" } }; },
    async deleteAsset() { return { data: null, error: { code: "23503", detail: "raw constraint" } }; },
  });
  const failure = await failing.createProductAsset(created);
  assert.equal(failure.status, "source_failure");
  assert.equal(JSON.stringify(failure).includes("password"), false);
  assert.equal(JSON.stringify(failure).includes("private_uploads"), false);
  const protectedRemoval = await failing.removeProductAsset(asset);
  assert.equal(protectedRemoval.status, "invalid_configuration");
  assert.equal(JSON.stringify(protectedRemoval).includes("constraint"), false);
});

test("24-25: route and UI expose metadata-only behavior with no lifecycle, Variant, or storage mutation", async () => {
  const route = await readFile(new URL("../app/api/admin/catalog/products/[id]/assets/route.ts", import.meta.url), "utf8");
  const boundary = await readFile(new URL("../app/application/admin-product-assets.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/infrastructure/catalog/supabase-product-asset-repository.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/admin/products/AdminProductAssetEditor.tsx", import.meta.url), "utf8");
  assert.equal(route.includes("export async function POST"), true);
  assert.equal(route.includes("export async function GET"), false);
  assert.equal(adapter.includes('.from("product_assets")'), true);
  for (const forbidden of ["customer_uploads", "order_uploads", "production_previews", "digital_delivery", "product_fulfillment_configs"]) {
    assert.equal(adapter.includes(forbidden), false);
    assert.equal(boundary.includes(forbidden), false);
  }
  assert.equal(adapter.includes('.from("products")'), false);
  assert.equal(adapter.includes('.from("product_variants")'), false);
  assert.equal(ui.includes('type="file"'), false);
  assert.equal(ui.includes("already-public"), true);
  assert.equal(ui.includes("Supabase Storage"), false);
  assert.equal(ui.includes("Cloudflare R2"), false);
});
