import { cartErrorResponse, publicCartFromProviderResult } from "../../../../application/shopping-cart-service.ts";
import { getShoppingCartProvider, readShoppingCartId } from "../../../../server/shopping-cart-runtime.server.ts";
import { isSameOriginCartMutation } from "../../../../server/cart-http.server.ts";
import { parseCartQuantity } from "../../../../domain/shopping-cart.ts";

interface RouteContext { params: Promise<{ lineId: string }> }

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  if (persistentCartSelected()) return persistentCartHttp(request, "update", (await context.params).lineId);
  if (!isSameOriginCartMutation(request)) return cartErrorResponse(403, "Cart request was not allowed.");
  const cartId = readShoppingCartId(request);
  if (!cartId) return cartErrorResponse(404, "Cart line was not found.");
  let quantity: unknown;
  try {
    const body: unknown = await request.json();
    quantity = body && typeof body === "object" && "quantity" in body ? (body as { quantity?: unknown }).quantity : undefined;
  } catch {
    return cartErrorResponse(400, "Quantity is invalid.");
  }
  if (parseCartQuantity(quantity) === null) return cartErrorResponse(400, "Quantity is invalid.");
  try {
    const provider = getShoppingCartProvider();
    if (!provider) return cartErrorResponse(503, "Cart is not enabled in this environment.");
    const { lineId } = await context.params;
    const result = await provider.updateLine(cartId, lineId, quantity as number);
    return result.status === "not_found"
      ? cartErrorResponse(404, "Cart line was not found.")
      : result.status === "source_failure"
        ? cartErrorResponse(503, "Cart is temporarily unavailable.")
        : Response.json(publicCartFromProviderResult(result));
  } catch {
    return cartErrorResponse(503, "Cart is temporarily unavailable.");
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  if (persistentCartSelected()) return persistentCartHttp(request, "remove", (await context.params).lineId);
  if (!isSameOriginCartMutation(request)) return cartErrorResponse(403, "Cart request was not allowed.");
  const cartId = readShoppingCartId(request);
  if (!cartId) return cartErrorResponse(404, "Cart line was not found.");
  try {
    const provider = getShoppingCartProvider();
    if (!provider) return cartErrorResponse(503, "Cart is not enabled in this environment.");
    const { lineId } = await context.params;
    const result = await provider.removeLine(cartId, lineId);
    return result.status === "not_found"
      ? cartErrorResponse(404, "Cart line was not found.")
      : result.status === "source_failure"
        ? cartErrorResponse(503, "Cart is temporarily unavailable.")
        : Response.json(publicCartFromProviderResult(result));
  } catch {
    return cartErrorResponse(503, "Cart is temporarily unavailable.");
  }
}
import { persistentCartHttp, persistentCartSelected } from "../../../../server/local-persistent-cart-http.server.ts";
