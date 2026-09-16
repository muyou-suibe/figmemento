import assert from "node:assert/strict";
import test from "node:test";

import { readCustomerUploadConfig } from "../app/config/server.ts";
import { POST as cartRoute } from "../app/api/cart/route.ts";
import { GET as readinessRoute } from "../app/api/checkout-readiness/route.ts";
import { GET as previewRoute } from "../app/api/customer-uploads/preview/route.ts";
import { POST as uploadRoute } from "../app/api/uploads/route.ts";
import { createServerCatalogRepository } from "../app/infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../app/infrastructure/customization/server-customization-field-repository.ts";
import {
  getSharedLocalCustomerUploadRuntime,
  resetSharedLocalCustomerUploadRuntime,
} from "../app/infrastructure/customer-upload/local-customer-upload-runtime.server.ts";
import { resetShoppingCartProviderForTests } from "../app/server/shopping-cart-runtime.server.ts";

const productId = "fixture-product-couple-figure";
const fieldId = "fixture-customization-field-couple-figure-reference-images";
const origin = "https://photogift.test";
const secret = "local-runtime-owner-secret-material-1234567890";

function png(width = 600, height = 600) {
  const uint32BE = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const chunk = (type, data) => [...uint32BE(data.length), ...type.split("").map((value) => value.charCodeAt(0)), ...data, 0, 0, 0, 0];
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...chunk("IDAT", [0]),
    ...chunk("IEND", []),
  ]);
}

function request({ product = productId, field = fieldId, context, bytes = png(), rawQuery } = {}) {
  const form = new FormData();
  form.append("file", new File([bytes], "portrait.png", { type: "image/png" }));
  const query = rawQuery ?? new URLSearchParams([
    ["productId", product],
    ["fieldId", field],
  ]).toString();
  return new Request(`${origin}/api/uploads${query ? `?${query}` : ""}`, {
    method: "POST",
    body: form,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      ...(context ? { cookie: context } : {}),
    },
  });
}

function observeMultipart(requestToObserve) {
  let bodyReads = 0;
  return {
    request: new Proxy(requestToObserve, {
      get(target, property) {
        if (property === "formData") {
          return async () => {
            bodyReads += 1;
            return target.formData();
          };
        }
        return Reflect.get(target, property, target);
      },
    }),
    bodyReads: () => bodyReads,
  };
}

function withLocalEnvironment(callback, { cart = false } = {}) {
  const keys = [
    "NODE_ENV",
    "CART_SOURCE",
    "CUSTOMER_UPLOAD_SOURCE",
    "PHOTOGIFT_PRODUCT_SOURCE",
    "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET",
    "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: "development",
    CART_SOURCE: cart ? "local_fake" : "disabled",
    CUSTOMER_UPLOAD_SOURCE: "local_fake",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: secret,
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  });
  return Promise.resolve().then(callback).finally(() => {
    resetSharedLocalCustomerUploadRuntime();
    resetShoppingCartProviderForTests();
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

async function fixtureImageHandoff() {
  const catalogSource = await createServerCatalogRepository({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" });
  assert.equal(catalogSource.status, "found");
  const customizationSource = createServerCustomizationFieldRepository({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" });
  const detail = await catalogSource.value.repository.findPublicProductBySlug("couple-figure");
  assert.equal(detail.status, "found");
  const variant = detail.value.variants.find((candidate) => candidate.isActive && candidate.isAvailable);
  assert.ok(variant);
  const configuration = await customizationSource.repository.getCustomizationFieldsForProduct(detail.value.product.id);
  assert.equal(configuration.status, "found");
  const imageField = configuration.value.fields.find((field) => field.kind === "image");
  assert.ok(imageField);
  return {
    productId: detail.value.product.id,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions,
    configurationRevision: configuration.value.configurationRevision,
    customizationValues: [{
      fieldId: imageField.id,
      fieldCode: imageField.code,
      kind: "image",
      images: [{ receiptId: "placeholder-replaced-by-upload" }],
    }],
  };
}

test("local upload configuration is independent of catalog source and does not accept production fixture mode", () => {
  assert.deepEqual(readCustomerUploadConfig({ CUSTOMER_UPLOAD_SOURCE: "local_fake" }, "development"), {
    source: "local_fake",
    runtimeMode: "development",
  });
  assert.deepEqual(readCustomerUploadConfig({ CUSTOMER_UPLOAD_SOURCE: "local_fake" }, "test"), {
    source: "local_fake",
    runtimeMode: "test",
  });
  assert.throws(() => readCustomerUploadConfig({ CUSTOMER_UPLOAD_SOURCE: "local_fake" }, "production"));
});

test("shared local runtime is process-memory only and reset creates a fresh bundle", () => {
  const first = getSharedLocalCustomerUploadRuntime();
  assert.equal(first.receiptRepository, first.previewAccess);
  assert.equal(first.acceptanceDependencies.objectStore, first.objectStore);
  assert.equal(first.acceptanceDependencies.receiptRepository, first.receiptRepository);
  assert.equal(getSharedLocalCustomerUploadRuntime(), first);
  resetSharedLocalCustomerUploadRuntime();
  assert.notEqual(getSharedLocalCustomerUploadRuntime(), first);
  resetSharedLocalCustomerUploadRuntime();
});

test("real route composition resolves current fixture Product and image field, stores private data, and previews it", async () => {
  await withLocalEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network access is forbidden in the local runtime test");
    };
    try {
      const first = await uploadRoute(request());
      assert.equal(first.status, 201);
      const cookie = first.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      const body = await first.json();
      assert.equal(body.receipt.lifecycle, "active");
      assert.equal("ownerId" in body.receipt, false);
      assert.equal("storageKey" in body.receipt, false);

      const preview = await previewRoute(new Request(
        `${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(body.receipt.receiptId)}`,
        { headers: { cookie } },
      ));
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.get("cache-control"), "private, no-store");
      assert.deepEqual([...new Uint8Array(await preview.arrayBuffer())], [...png()]);
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("same explicit POST is not deduplicated and selector failures do not materialize multipart data", async () => {
  await withLocalEnvironment(async () => {
    const first = await uploadRoute(request());
    assert.equal(first.status, 201);
    const cookie = first.headers.get("set-cookie")?.split(";")[0];
    const firstReceipt = (await first.json()).receipt.receiptId;
    const second = await uploadRoute(request({ context: cookie }));
    assert.equal(second.status, 201);
    const secondReceipt = (await second.json()).receipt.receiptId;
    assert.notEqual(firstReceipt, secondReceipt);

    const observed = observeMultipart(request({ field: "missing-field", context: cookie }));
    const rejected = await uploadRoute(observed.request);
    assert.equal(rejected.status, 404);
    assert.equal(observed.bodyReads(), 0);
  });
});

test("canonical bounded selectors reject malformed requests before catalog lookup or write mutation", async () => {
  await withLocalEnvironment(async () => {
    const encodedProduct = encodeURIComponent(productId);
    const encodedField = encodeURIComponent(fieldId);
    const runtime = getSharedLocalCustomerUploadRuntime();
    const originalPutPrivateObject = runtime.objectStore.putPrivateObject;
    const originalCreateAcceptedReceipt = runtime.receiptRepository.createAcceptedReceipt;
    let objectWrites = 0;
    let receiptCreates = 0;
    runtime.objectStore.putPrivateObject = async (...args) => {
      objectWrites += 1;
      return originalPutPrivateObject.apply(runtime.objectStore, args);
    };
    runtime.receiptRepository.createAcceptedReceipt = async (...args) => {
      receiptCreates += 1;
      return originalCreateAcceptedReceipt.apply(runtime.receiptRepository, args);
    };
    const cases = [
      ["missing productId", `fieldId=${encodedField}`],
      ["missing fieldId", `productId=${encodedProduct}`],
      ["duplicate productId", `productId=${encodedProduct}&productId=${encodedProduct}&fieldId=${encodedField}`],
      ["duplicate fieldId", `productId=${encodedProduct}&fieldId=${encodedField}&fieldId=${encodedField}`],
      ["empty productId", `productId=&fieldId=${encodedField}`],
      ["empty fieldId", `productId=${encodedProduct}&fieldId=`],
      ["whitespace-only productId", `productId=${encodeURIComponent(" ")}&fieldId=${encodedField}`],
      ["whitespace-only fieldId", `productId=${encodedProduct}&fieldId=${encodeURIComponent(" ")}`],
      ["leading/trailing productId whitespace", `productId=${encodeURIComponent(` ${productId} `)}&fieldId=${encodedField}`],
      ["leading/trailing fieldId whitespace", `productId=${encodedProduct}&fieldId=${encodeURIComponent(` ${fieldId} `)}`],
      ["productId over canonical maximum", `productId=${"a".repeat(129)}&fieldId=${encodedField}`],
      ["fieldId over canonical maximum", `productId=${encodedProduct}&fieldId=${"a".repeat(129)}`],
      ["productId slash", `productId=${encodeURIComponent("bad/id")}&fieldId=${encodedField}`],
      ["productId question mark", `productId=${encodeURIComponent("bad?id")}&fieldId=${encodedField}`],
      ["productId hash", `productId=${encodeURIComponent("bad#id")}&fieldId=${encodedField}`],
      ["productId embedded space", `productId=${encodeURIComponent("bad id")}&fieldId=${encodedField}`],
      ["fieldId slash", `productId=${encodedProduct}&fieldId=${encodeURIComponent("bad/id")}`],
      ["fieldId question mark", `productId=${encodedProduct}&fieldId=${encodeURIComponent("bad?id")}`],
      ["fieldId hash", `productId=${encodedProduct}&fieldId=${encodeURIComponent("bad#id")}`],
      ["fieldId embedded space", `productId=${encodedProduct}&fieldId=${encodeURIComponent("bad id")}`],
    ];

    for (const [label, rawQuery] of cases) {
      const observed = observeMultipart(request({ rawQuery }));
      const response = await uploadRoute(observed.request);
      assert.equal(response.status, 404, label);
      assert.equal(observed.bodyReads(), 0, `${label} must not parse multipart data`);
    }

    process.env.PHOTOGIFT_PRODUCT_SOURCE = "supabase";
    const sourceIndependent = observeMultipart(request({
      rawQuery: `productId=${encodeURIComponent("bad/id")}&fieldId=${encodedField}`,
    }));
    const sourceIndependentResponse = await uploadRoute(sourceIndependent.request);
    assert.equal(sourceIndependentResponse.status, 404);
    assert.equal(sourceIndependent.bodyReads(), 0);
    assert.equal(objectWrites, 0);
    assert.equal(receiptCreates, 0);

    runtime.objectStore.putPrivateObject = originalPutPrivateObject;
    runtime.receiptRepository.createAcceptedReceipt = originalCreateAcceptedReceipt;
  });
});

test("local receipt authority composes through Cart Add and Checkout Readiness, while restart and disabled source fail closed", async () => {
  await withLocalEnvironment(async () => {
    const cartOrigin = "http://localhost:3000";
    const handoff = await fixtureImageHandoff();
    const first = await uploadRoute(request());
    assert.equal(first.status, 201);
    const ownerCookie = first.headers.get("set-cookie")?.split(";")[0];
    assert.ok(ownerCookie);
    const firstReceipt = (await first.json()).receipt.receiptId;
    const acceptedHandoff = {
      ...handoff,
      customizationValues: [{
        ...handoff.customizationValues[0],
        images: [{ receiptId: firstReceipt }],
      }],
    };

    resetSharedLocalCustomerUploadRuntime();
    const afterRestart = await cartRoute(new Request(`${cartOrigin}/api/cart`, {
      method: "POST",
      body: JSON.stringify({ handoff: acceptedHandoff }),
      headers: {
        origin: cartOrigin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        cookie: ownerCookie,
      },
    }));
    assert.equal(afterRestart.status, 400);

    const second = await uploadRoute(request({ context: ownerCookie }));
    assert.equal(second.status, 201);
    const secondReceipt = (await second.json()).receipt.receiptId;
    const currentHandoff = {
      ...acceptedHandoff,
      customizationValues: [{ ...acceptedHandoff.customizationValues[0], images: [{ receiptId: secondReceipt }] }],
    };

    process.env.CUSTOMER_UPLOAD_SOURCE = "disabled";
    const disabled = await cartRoute(new Request(`${cartOrigin}/api/cart`, {
      method: "POST",
      body: JSON.stringify({ handoff: currentHandoff }),
      headers: { origin: cartOrigin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: ownerCookie },
    }));
    assert.equal(disabled.status, 503);
    process.env.CUSTOMER_UPLOAD_SOURCE = "local_fake";

    const added = await cartRoute(new Request(`${cartOrigin}/api/cart`, {
      method: "POST",
      body: JSON.stringify({ handoff: currentHandoff }),
      headers: { origin: cartOrigin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: ownerCookie },
    }));
    assert.equal(added.status, 200);
    const cartCookie = added.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cartCookie);
    const cartBody = await added.json();
    assert.equal(cartBody.status, "available");
    assert.equal(cartBody.lines.length, 1);

    const readiness = await readinessRoute(new Request(`${origin}/api/checkout-readiness`, {
      headers: { cookie: `${ownerCookie}; ${cartCookie}` },
    }));
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.equal(readinessBody.lines.length, 1);
    assert.equal(readinessBody.lines[0].state, "ready");
    assert.ok(!readinessBody.lines[0].issues.some((issue) => issue.code === "UPLOAD_UNAVAILABLE"));
    assert.doesNotMatch(JSON.stringify({ cartBody, readinessBody }), /receiptId|ownerId|storageKey/);
  }, { cart: true });
});

test("disabled/default and production modes fail closed, while Supabase failure never falls back to local fake", async () => {
  await withLocalEnvironment(async () => {
    delete process.env.CUSTOMER_UPLOAD_SOURCE;
    assert.equal((await uploadRoute(request())).status, 503);

    process.env.CUSTOMER_UPLOAD_SOURCE = "local_fake";
    process.env.NODE_ENV = "production";
    assert.equal((await uploadRoute(request())).status, 503);

    process.env.NODE_ENV = "development";
    process.env.PHOTOGIFT_PRODUCT_SOURCE = "supabase";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal((await uploadRoute(request())).status, 503);
  });
});
