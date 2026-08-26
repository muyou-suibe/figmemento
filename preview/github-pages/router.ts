import type { PreviewRoute } from "./types.ts";

export function normalizeBasePath(value: string | undefined): string {
  if (!value || value === "." || value === "./") return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return `${withoutTrailingSlash}/`;
}

export function previewBasePath(baseUrl = "/"): string {
  return normalizeBasePath(baseUrl);
}

export function previewHref(route: string, baseUrl = "/"): string {
  const base = normalizeBasePath(baseUrl);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${base}#${normalizedRoute}`;
}

export function parsePreviewRoute(hash: string): PreviewRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.split("?")[0] || "/";
  const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));

  if (segments.length === 0) return { kind: "home" };
  if (segments[0] === "shop" && segments.length === 1) return { kind: "shop" };
  if (segments[0] === "category" && segments[1]) return { kind: "category", slug: segments[1] };
  if (segments[0] === "product" && segments[1]) return { kind: "product", slug: segments[1] };

  const placeholders: Record<string, string> = {
    cart: "Cart demo",
    checkout: "Checkout demo",
    "order-success": "Order Success demo",
    payment: "Payment demo",
    fulfillment: "Fulfillment demo",
    operator: "Operator visual preview",
  };
  if (segments.length === 1 && placeholders[segments[0]]) {
    return { kind: "placeholder", label: placeholders[segments[0]], route: `/${segments[0]}` };
  }
  return { kind: "placeholder", label: "Preview route", route: path };
}

export function isPreviewRoute(route: PreviewRoute, kind: PreviewRoute["kind"]): boolean {
  return route.kind === kind;
}
