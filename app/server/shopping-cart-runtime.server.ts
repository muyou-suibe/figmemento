import { readCartConfig, type RuntimeEnvironment } from "../config/server.ts";
import {
  LOCAL_CART_COOKIE_NAME,
  type ShoppingCartProvider,
} from "../domain/shopping-cart.ts";
import { LocalMemoryShoppingCartProvider } from "../infrastructure/cart/local-memory-shopping-cart-provider.ts";

let localProvider: ShoppingCartProvider | null = null;

export function getShoppingCartProvider(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): ShoppingCartProvider | null {
  const configuration = readCartConfig(environment, runtimeMode);
  // Persistent HTTP uses the CAS command port, never this legacy non-CAS provider.
  if (configuration.source !== "local_fake") return null;
  localProvider ??= new LocalMemoryShoppingCartProvider();
  return localProvider;
}

export function readShoppingCartId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LOCAL_CART_COOKIE_NAME}=`));
  if (!entry) return null;
  const raw = entry.slice(LOCAL_CART_COOKIE_NAME.length + 1);
  try {
    const value = decodeURIComponent(raw);
    return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function cartCookieHeader(cartId: string, runtimeMode = process.env.NODE_ENV): string {
  const secure = runtimeMode === "production" ? "; Secure" : "";
  return `${LOCAL_CART_COOKIE_NAME}=${encodeURIComponent(cartId)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`;
}

export function clearCartCookieHeader(): string {
  return `${LOCAL_CART_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function resetShoppingCartProviderForTests(): void {
  localProvider = null;
}
