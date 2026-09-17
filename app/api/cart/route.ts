import { acceptCartItem, cartErrorResponse, publicCartFromProviderResult, publicCartWithCatalogRevalidation, unavailableCart } from "../../application/shopping-cart-service.ts";
import { createServerCatalogRepository } from "../../infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../../infrastructure/customization/server-customization-field-repository.ts";
import { getShoppingCartProvider, cartCookieHeader, readShoppingCartId } from "../../server/shopping-cart-runtime.server.ts";
import { isSameOriginCartMutation } from "../../server/cart-http.server.ts";
import {
  hasPrivateImageReceiptValue,
  resolveLocalCustomerUploadReceiptAuthority,
} from "../../server/customer-upload-runtime.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../../config/server-runtime-composition.server.ts";

function responseForCart(value: ReturnType<typeof publicCartFromProviderResult>, init?: ResponseInit): Response {
  return Response.json(value, init);
}

export async function GET(request: Request): Promise<Response> {
  const selection = resolveCanonicalLocalCommerceCapability("cart");
  if (selection === "selected") return persistentCartHttp(request, "read");
  if (selection === "unavailable") return responseForCart(unavailableCart(), { status: 503 });
  try {
    const provider = getShoppingCartProvider();
    if (!provider) return responseForCart(unavailableCart());
    const cartId = readShoppingCartId(request);
    if (!cartId) return responseForCart({ status: "empty", lines: [] });
    const stored = await provider.getCart(cartId);
    if (stored.status !== "found") return responseForCart(publicCartFromProviderResult(stored));
    const catalogSource = await createServerCatalogRepository();
    if (catalogSource.status !== "found") return responseForCart({ status: "failure", lines: [] }, { status: 503 });
    return responseForCart(await publicCartWithCatalogRevalidation(stored.value, catalogSource.value.repository));
  } catch {
    return responseForCart({ status: "failure", lines: [] }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const selection = resolveCanonicalLocalCommerceCapability("cart");
  if (selection === "selected") return persistentCartHttp(request, "add");
  if (selection === "unavailable") return cartErrorResponse(503, "Cart is temporarily unavailable.");
  if (!isSameOriginCartMutation(request)) return cartErrorResponse(403, "Cart request was not allowed.");
  let rawInput: unknown;
  try {
    const body: unknown = await request.json();
    rawInput = body && typeof body === "object" && "handoff" in body
      ? (body as { handoff?: unknown }).handoff
      : undefined;
  } catch {
    return cartErrorResponse(400, "Cart item is invalid.");
  }
  try {
    const needsUploadAuthority = hasPrivateImageReceiptValue(rawInput);
    const uploadAuthority = needsUploadAuthority
      ? await resolveLocalCustomerUploadReceiptAuthority(request)
      : null;
    if (needsUploadAuthority && !uploadAuthority) {
      return cartErrorResponse(503, "Customer upload is temporarily unavailable.");
    }
    const provider = getShoppingCartProvider();
    if (!provider) return cartErrorResponse(503, "Cart is not enabled in this environment.");
    const catalogSource = await createServerCatalogRepository();
    if (catalogSource.status !== "found") return cartErrorResponse(503, "Catalog is temporarily unavailable.");
    const customizationSource = createServerCustomizationFieldRepository();
    if (customizationSource.source !== catalogSource.value.source) return cartErrorResponse(503, "Catalog is temporarily unavailable.");
    const accepted = await acceptCartItem(rawInput, {
      observedAt: new Date().toISOString(),
      catalogRepository: catalogSource.value.repository,
      customizationFieldRepository: customizationSource.repository,
      ...(uploadAuthority
        ? {
            receiptRepository: uploadAuthority.receiptRepository,
            verifiedOwnerId: uploadAuthority.ownerId,
          }
        : {}),
    });
    if (accepted.status !== "accepted") {
      return cartErrorResponse(accepted.reason === "unavailable" ? 409 : accepted.reason === "source_failure" ? 503 : 400,
        accepted.reason === "unavailable" ? "This configured item is no longer available." : accepted.reason === "source_failure" ? "Cart is temporarily unavailable." : "Configured item is invalid.");
    }
    let cartId = readShoppingCartId(request);
    let created = false;
    if (!cartId) {
      const newCart = await provider.createCart();
      if (newCart.status !== "found") return cartErrorResponse(503, "Cart is temporarily unavailable.");
      cartId = newCart.value.cartId;
      created = true;
    } else {
      const existing = await provider.getCart(cartId);
      if (existing.status !== "found") {
        const newCart = await provider.createCart();
        if (newCart.status !== "found") return cartErrorResponse(503, "Cart is temporarily unavailable.");
        cartId = newCart.value.cartId;
        created = true;
      }
    }
    const result = await provider.addLine(cartId, accepted.value);
    if (result.status !== "found") return cartErrorResponse(503, "Cart is temporarily unavailable.");
    return responseForCart(publicCartFromProviderResult(result), created ? { headers: { "set-cookie": cartCookieHeader(cartId) } } : undefined);
  } catch {
    return cartErrorResponse(503, "Cart is temporarily unavailable.");
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const selection = resolveCanonicalLocalCommerceCapability("cart");
  if (selection === "selected") return persistentCartHttp(request, "clear");
  if (selection === "unavailable") return cartErrorResponse(503, "Cart is temporarily unavailable.");
  if (!isSameOriginCartMutation(request)) return cartErrorResponse(403, "Cart request was not allowed.");
  try {
    const provider = getShoppingCartProvider();
    const cartId = readShoppingCartId(request);
    if (!provider || !cartId) return responseForCart({ status: "empty", lines: [] });
    return responseForCart(publicCartFromProviderResult(await provider.clearCart(cartId)));
  } catch {
    return cartErrorResponse(503, "Cart is temporarily unavailable.");
  }
}
import { persistentCartHttp } from "../../server/local-persistent-cart-http.server.ts";
