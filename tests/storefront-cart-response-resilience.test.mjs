import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isPublicShoppingCart,
  loadPublicShoppingCart,
} from "../app/storefront/public-shopping-cart-response.ts";

const emptyCart = { status: "empty", lines: [] };
const populatedCart = { status: "available", lines: [{ lineId: "line-1" }] };

test("public Cart response accepts valid empty and populated projections", async () => {
  assert.equal(isPublicShoppingCart(emptyCart), true);
  assert.equal(isPublicShoppingCart(populatedCart), true);

  const empty = await loadPublicShoppingCart(async () => Response.json(emptyCart));
  const populated = await loadPublicShoppingCart(async () => Response.json(populatedCart));
  assert.deepEqual(empty, { status: "ready", cart: emptyCart });
  assert.deepEqual(populated, { status: "ready", cart: populatedCart });
});

test("public Cart response rejects non-2xx safe errors and stale Cart projections", async () => {
  const safeError = { status: "error", message: "Cart was not found." };
  const result = await loadPublicShoppingCart(async () => Response.json(safeError, { status: 404 }));
  assert.deepEqual(result, { status: "unavailable" });
  assert.equal(isPublicShoppingCart(safeError), false);
});

test("public Cart response rejects malformed and missing lines projections", async () => {
  for (const value of [null, "cart", {}, { status: "available" }, { status: "available", lines: null }, { status: "unknown", lines: [] }]) {
    assert.equal(isPublicShoppingCart(value), false);
  }
  const malformed = await loadPublicShoppingCart(async () => new Response("{", { status: 200, headers: { "content-type": "application/json" } }));
  assert.deepEqual(malformed, { status: "unavailable" });
});

test("public Cart response contains network and JSON failures", async () => {
  const network = await loadPublicShoppingCart(async () => { throw new Error("network unavailable"); });
  const json = await loadPublicShoppingCart(async () => ({ ok: true, json: async () => { throw new Error("invalid JSON"); } }));
  assert.deepEqual(network, { status: "unavailable" });
  assert.deepEqual(json, { status: "unavailable" });
});

test("Cart and Checkout clients use the validated boundary and distinct unavailable UI", async () => {
  const [cart, checkout] = await Promise.all([
    readFile(new URL("../app/storefront/CartExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/LocalCheckoutExperience.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(cart, /loadPublicShoppingCart/);
  assert.match(checkout, /loadPublicShoppingCart/);
  assert.match(cart, /setCart\(unavailableCart\(\)\)/);
  assert.match(checkout, /setCart\(unavailableCart\(\)\)/);
  assert.match(checkout, /Checkout is temporarily unavailable/);
  assert.match(checkout, /Your local Cart is temporarily unavailable/);
  assert.match(checkout, /Return to the shop/);
  assert.ok(
    checkout.indexOf('cart.status === "unavailable_source"') < checkout.indexOf("cart.lines.length === 0"),
    "Checkout must classify unavailable before empty",
  );
  assert.doesNotMatch(`${cart}\n${checkout}`, /await response\.json\(\) as ShoppingCart/);
});
