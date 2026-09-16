/**
 * Audited server entrypoints for the local commerce persistence boundary.
 *
 * This is descriptive policy metadata, not a router and not a source
 * selector. Keeping it server-only and static makes omissions and accidental
 * fallbacks testable without creating another business command authority.
 */

export type LocalCommerceEntrypointActor =
  | "customer"
  | "admin"
  | "operator"
  | "supplier_operator"
  | "provider"
  | "public";

export type LocalCommercePersistentSupport =
  | "canonical"
  | "read_only"
  | "deferred_fail_closed"
  | "supplier_unsupported"
  | "legacy_isolated"
  | "catalog_separate"
  | "ancillary_isolated";

export interface LocalCommerceEntrypointInventoryItem {
  readonly route: string;
  readonly file: string;
  readonly methods: readonly string[];
  readonly actor: LocalCommerceEntrypointActor;
  readonly sourceAuthority: string;
  readonly operation: "read" | "mutation" | "read_and_mutation";
  readonly canonicalBoundary: string;
  readonly persistentSupport: LocalCommercePersistentSupport;
  readonly fallbackRisk: "none" | "guarded" | "deferred";
}

export const LOCAL_COMMERCE_ENTRYPOINT_INVENTORY = [
  { route: "/api/products", file: "app/api/products/route.ts", methods: ["GET"], actor: "public", sourceAuthority: "PHOTOGIFT_PRODUCT_SOURCE", operation: "read", canonicalBoundary: "public Catalog read authority", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/coupons/validate", file: "app/api/coupons/validate/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "legacy production", operation: "read", canonicalBoundary: "legacy coupon projection; persistent Checkout revalidates rules internally", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/customer-auth/sign-up", file: "app/api/customer-auth/sign-up/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "CUSTOMER_AUTH_SOURCE", operation: "mutation", canonicalBoundary: "customer account + durable session ports", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/customer-auth/sign-in", file: "app/api/customer-auth/sign-in/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "CUSTOMER_AUTH_SOURCE", operation: "mutation", canonicalBoundary: "customer account + durable session ports", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/customer-auth/sign-out", file: "app/api/customer-auth/sign-out/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "CUSTOMER_AUTH_SOURCE", operation: "mutation", canonicalBoundary: "durable session revoke port", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/customer-auth/session", file: "app/api/customer-auth/session/route.ts", methods: ["GET"], actor: "customer", sourceAuthority: "CUSTOMER_AUTH_SOURCE", operation: "read", canonicalBoundary: "durable session read port", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/cart", file: "app/api/cart/route.ts", methods: ["GET", "POST", "DELETE"], actor: "customer", sourceAuthority: "CART_SOURCE", operation: "read_and_mutation", canonicalBoundary: "unified Cart command port", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/cart/items/[lineId]", file: "app/api/cart/items/[lineId]/route.ts", methods: ["PATCH", "DELETE"], actor: "customer", sourceAuthority: "CART_SOURCE", operation: "mutation", canonicalBoundary: "unified Cart command port", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/checkout-readiness", file: "app/api/checkout-readiness/route.ts", methods: ["GET"], actor: "customer", sourceAuthority: "CART_SOURCE + PHOTOGIFT_PRODUCT_SOURCE", operation: "read", canonicalBoundary: "configured-item readiness authority", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/checkout", file: "app/api/checkout/route.ts", methods: ["GET", "POST"], actor: "customer", sourceAuthority: "LOCAL_CHECKOUT_SOURCE", operation: "read_and_mutation", canonicalBoundary: "local Checkout authority", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/uploads", file: "app/api/uploads/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "CUSTOMER_UPLOAD_SOURCE", operation: "mutation", canonicalBoundary: "durable media command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-drafts", file: "app/api/local-drafts/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "CUSTOMER_UPLOAD_SOURCE", operation: "mutation", canonicalBoundary: "durable draft command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-drafts/:draftId", file: "app/api/local-drafts/[draftId]/route.ts", methods: ["GET", "PUT"], actor: "customer", sourceAuthority: "CUSTOMER_UPLOAD_SOURCE", operation: "read_and_mutation", canonicalBoundary: "durable draft command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/customer-uploads/preview", file: "app/api/customer-uploads/preview/route.ts", methods: ["GET"], actor: "customer", sourceAuthority: "CUSTOMER_UPLOAD_SOURCE", operation: "read", canonicalBoundary: "durable private-media projection", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-orders", file: "app/api/local-orders/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "LOCAL_ORDER_SOURCE", operation: "mutation", canonicalBoundary: "atomic local Order command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-orders/[reference]", file: "app/api/local-orders/[reference]/route.ts", methods: ["GET"], actor: "customer", sourceAuthority: "LOCAL_ORDER_SOURCE", operation: "read", canonicalBoundary: "authorized immutable Order projection", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-orders/[reference]/digital-delivery/grant", file: "app/api/local-orders/[reference]/digital-delivery/grant/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "LOCAL_ORDER_SOURCE + persistent delivery composition", operation: "mutation", canonicalBoundary: "Order-authorized canonical owner/item digital grant activation", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-orders/[reference]/digital-delivery/tickets", file: "app/api/local-orders/[reference]/digital-delivery/tickets/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "LOCAL_ORDER_SOURCE + persistent delivery composition", operation: "mutation", canonicalBoundary: "Order-authorized short-lived opaque digital ticket issuance", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-orders/[reference]/digital-delivery/download", file: "app/api/local-orders/[reference]/digital-delivery/download/route.ts", methods: ["GET", "HEAD"], actor: "customer", sourceAuthority: "LOCAL_ORDER_SOURCE + persistent delivery composition", operation: "mutation", canonicalBoundary: "explicit Order-authorized private open then atomic digital claim then stream; probes never claim", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-payments", file: "app/api/local-payments/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "LOCAL_PAYMENT_SOURCE", operation: "mutation", canonicalBoundary: "atomic local Payment command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-fulfillment/[reference]", file: "app/api/local-fulfillment/[reference]/route.ts", methods: ["GET", "POST"], actor: "customer", sourceAuthority: "LOCAL_FULFILLMENT_SOURCE", operation: "read_and_mutation", canonicalBoundary: "authorized preview decision command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-fulfillment/operator/[reference]", file: "app/api/local-fulfillment/operator/[reference]/route.ts", methods: ["GET", "POST"], actor: "operator", sourceAuthority: "LOCAL_FULFILLMENT_SOURCE", operation: "read_and_mutation", canonicalBoundary: "operator Fulfillment command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-fulfillment/operator/[reference]/preview", file: "app/api/local-fulfillment/operator/[reference]/preview/route.ts", methods: ["POST"], actor: "operator", sourceAuthority: "LOCAL_FULFILLMENT_SOURCE", operation: "mutation", canonicalBoundary: "atomic preview publication command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-fulfillment/admin/[reference]/timeout", file: "app/api/local-fulfillment/admin/[reference]/timeout/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "ADMIN_ACCEPTANCE_SOURCE + LOCAL_FULFILLMENT_SOURCE", operation: "mutation", canonicalBoundary: "signed-Admin timeout command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/admin/login", file: "app/api/admin/login/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "signed Admin configuration", operation: "mutation", canonicalBoundary: "signed Admin session issuer", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/admin/logout", file: "app/api/admin/logout/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "signed Admin configuration", operation: "mutation", canonicalBoundary: "signed Admin cookie expiry", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/admin/catalog/[resource]/[id]", file: "app/api/admin/catalog/[resource]/[id]/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "mutation", canonicalBoundary: "protected Admin Catalog command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/catalog/[resource]/[id]/lifecycle", file: "app/api/admin/catalog/[resource]/[id]/lifecycle/route.ts", methods: ["POST", "DELETE"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "mutation", canonicalBoundary: "protected Admin Catalog lifecycle command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/catalog/products/[id]/assets", file: "app/api/admin/catalog/products/[id]/assets/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "mutation", canonicalBoundary: "protected Admin ProductAsset command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/catalog/products/[id]/customization", file: "app/api/admin/catalog/products/[id]/customization/route.ts", methods: ["GET", "POST"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "read_and_mutation", canonicalBoundary: "protected Admin customization command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/catalog/products/[id]/fulfillment", file: "app/api/admin/catalog/products/[id]/fulfillment/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "mutation", canonicalBoundary: "protected Admin fulfillment-definition command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/catalog/products/[id]/sku-graph", file: "app/api/admin/catalog/products/[id]/sku-graph/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "Admin Catalog source", operation: "mutation", canonicalBoundary: "protected Admin SKU graph command", persistentSupport: "catalog_separate", fallbackRisk: "none" },
  { route: "/api/admin/orders/export", file: "app/api/admin/orders/export/route.ts", methods: ["GET"], actor: "admin", sourceAuthority: "ADMIN_ACCEPTANCE_SOURCE", operation: "read", canonicalBoundary: "Admin Orders read composition", persistentSupport: "deferred_fail_closed", fallbackRisk: "deferred" },
  { route: "/api/admin/orders", file: "app/api/admin/orders/route.ts", methods: ["PATCH"], actor: "admin", sourceAuthority: "ADMIN_ACCEPTANCE_SOURCE", operation: "mutation", canonicalBoundary: "legacy production Admin Order mutation", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/admin/digital-delivery", file: "app/api/admin/digital-delivery/route.ts", methods: ["POST", "DELETE"], actor: "admin", sourceAuthority: "ADMIN_ACCEPTANCE_SOURCE", operation: "mutation", canonicalBoundary: "signed-Admin exact-item private digital publication and canonical grant revocation commands", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/admin/cleanup-uploads", file: "app/api/admin/cleanup-uploads/route.ts", methods: ["POST"], actor: "admin", sourceAuthority: "production only", operation: "mutation", canonicalBoundary: "legacy production upload cleanup", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/local-suppliers/operator", file: "app/api/local-suppliers/operator/route.ts", methods: ["GET", "POST"], actor: "supplier_operator", sourceAuthority: "LOCAL_SUPPLIER_SOURCE + persistent commerce selectors", operation: "read_and_mutation", canonicalBoundary: "local_fake Supplier operator service", persistentSupport: "supplier_unsupported", fallbackRisk: "none" },
  { route: "/api/local-tracking/[reference]", file: "app/api/local-tracking/[reference]/route.ts", methods: ["GET"], actor: "customer", sourceAuthority: "LOCAL_TRACKING_SOURCE", operation: "read", canonicalBoundary: "Order-authorized read-only customer Tracking projection", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/local-tracking/operator/[reference]", file: "app/api/local-tracking/operator/[reference]/route.ts", methods: ["GET", "POST"], actor: "operator", sourceAuthority: "LOCAL_TRACKING_SOURCE", operation: "read_and_mutation", canonicalBoundary: "operator Tracking command", persistentSupport: "canonical", fallbackRisk: "none" },
  { route: "/api/orders", file: "app/api/orders/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "legacy production", operation: "mutation", canonicalBoundary: "legacy normalized Order stop gate / production Order flow", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/order-lookup", file: "app/api/order-lookup/route.ts", methods: ["POST"], actor: "customer", sourceAuthority: "legacy production", operation: "read", canonicalBoundary: "legacy email + PG reference lookup", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/webhooks/stripe", file: "app/api/webhooks/stripe/route.ts", methods: ["POST"], actor: "provider", sourceAuthority: "legacy production", operation: "mutation", canonicalBoundary: "legacy Stripe webhook", persistentSupport: "legacy_isolated", fallbackRisk: "guarded" },
  { route: "/api/local-analytics", file: "app/api/local-analytics/route.ts", methods: ["POST"], actor: "public", sourceAuthority: "local ancillary runtime", operation: "mutation", canonicalBoundary: "non-commerce analytics boundary", persistentSupport: "ancillary_isolated", fallbackRisk: "none" },
  { route: "/api/local-contact", file: "app/api/local-contact/route.ts", methods: ["GET", "POST"], actor: "public", sourceAuthority: "local ancillary runtime", operation: "read_and_mutation", canonicalBoundary: "non-commerce contact boundary", persistentSupport: "ancillary_isolated", fallbackRisk: "none" },
  { route: "/api/local-newsletter", file: "app/api/local-newsletter/route.ts", methods: ["GET", "POST"], actor: "public", sourceAuthority: "local ancillary runtime", operation: "read_and_mutation", canonicalBoundary: "non-commerce newsletter boundary", persistentSupport: "ancillary_isolated", fallbackRisk: "none" },
  { route: "/api/local-reviews", file: "app/api/local-reviews/route.ts", methods: ["GET", "POST"], actor: "public", sourceAuthority: "local ancillary runtime", operation: "read_and_mutation", canonicalBoundary: "non-commerce review boundary", persistentSupport: "ancillary_isolated", fallbackRisk: "none" },
] as const satisfies readonly LocalCommerceEntrypointInventoryItem[];
