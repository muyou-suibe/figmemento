import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Fusion Batch F wires real Admin Login, Products, and Orders routes to scoped presentation", async () => {
  const [loginPage, productsPage, editor, ordersPage, styles] = await Promise.all([
    source("app/admin/login/page.tsx"),
    source("app/admin/products/page.tsx"),
    source("app/admin/products/AdminCatalogEditor.tsx"),
    source("app/admin/orders/page.tsx"),
    source("app/admin/products/admin-products.module.css"),
  ]);

  assert.match(loginPage, /fusionAdminShell/);
  assert.match(loginPage, /fusionAdminLogin/);
  assert.match(loginPage, /fusionAdminLoginCard/);
  assert.match(loginPage, /admin-password/);
  assert.match(productsPage, /AdminCatalogQueryBoundary/);
  assert.match(productsPage, /ExistingAdminSessionVerifier/);
  assert.match(productsPage, /createAdminCatalogReader/);
  assert.match(productsPage, /styles\.fusionAdminShell/);
  assert.match(editor, /styles\.fusionAdminWorkspace/);
  assert.match(ordersPage, /isValidAdminSession/);
  assert.match(ordersPage, /getSupabaseServerClient/);
  assert.match(ordersPage, /styles\.fusionAdminOrdersPage/);
  assert.match(styles, /FUSION ADMIN \+ OPERATOR CONSISTENCY — BATCH F/);
  for (const token of ["--fusion-bg", "--fusion-paper", "--fusion-ink", "--fusion-terra-deep", "--fusion-gold", "--fusion-line", "--fusion-radius-card", "--fusion-radius-control", "--fusion-shadow-card", "--fusion-tap"]) {
    assert.match(styles, new RegExp(`var\\(${token.replaceAll("-", "\\-")}\\)`));
  }
  for (const breakpoint of ["960px", "720px", "520px"]) assert.match(styles, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /FUSION RESPONSIVE \+ ACCESSIBILITY HARDENING — BATCH F/);
  assert.doesNotMatch(`${loginPage}\n${productsPage}\n${ordersPage}\n${styles}`, /auto-login|fixture login bypass|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SECRET_KEY/i);
  assert.doesNotMatch(productsPage, /development-catalog|fixture/i);
});

test("Fusion Batch F preserves Admin operation and authority boundaries", async () => {
  const [productsPage, editor, lifecycle, sku, assets, fulfillment, ordersPage, controls] = await Promise.all([
    source("app/admin/products/page.tsx"),
    source("app/admin/products/AdminCatalogEditor.tsx"),
    source("app/admin/products/AdminCatalogLifecycleEditor.tsx"),
    source("app/admin/products/AdminSkuGraphEditor.tsx"),
    source("app/admin/products/AdminProductAssetEditor.tsx"),
    source("app/admin/products/AdminProductFulfillmentEditor.tsx"),
    source("app/admin/orders/page.tsx"),
    source("app/admin/AdminOrderControls.tsx"),
  ]);

  assert.match(productsPage, /redirect\("\/admin\/login"\)/);
  assert.match(productsPage, /The production C1 schema must be deployed/);
  assert.match(editor, /AdminCatalogLifecycleEditor/);
  assert.match(editor, /AdminSkuGraphEditor/);
  assert.match(editor, /AdminProductAssetEditor/);
  assert.match(editor, /AdminProductFulfillmentEditor/);
  for (const action of ["publish", "unpublish", "retire"]) assert.match(lifecycle, new RegExp(`"${action}"`));
  for (const endpoint of ["sku-graph", "assets", "fulfillment"]) assert.match(`${sku}\n${assets}\n${fulfillment}`, new RegExp(endpoint));
  assert.match(ordersPage, /AdminOrderControls/);
  assert.match(ordersPage, /AdminTrackingControls/);
  assert.match(ordersPage, /AdminPhotoReview/);
  assert.match(controls, /paymentStatus/);
  assert.doesNotMatch(`${editor}\n${lifecycle}\n${sku}\n${assets}\n${fulfillment}`, /supplier|factory|procurement|warehouse|inventory/i);
  assert.match(ordersPage, /Supplier remains unsupported/);
});

test("Fusion Batch F keeps Fulfillment and Tracking operator authority separate", async () => {
  const [fulfillmentPage, fulfillment, trackingPage, tracking, fulfillmentRoute, trackingRoute, fulfillmentAuthority, trackingAuthority] = await Promise.all([
    source("app/local-fulfillment/operator/page.tsx"),
    source("app/storefront/LocalFulfillmentOperatorTool.tsx"),
    source("app/local-tracking/operator/page.tsx"),
    source("app/storefront/LocalTrackingExperience.tsx"),
    source("app/api/local-fulfillment/operator/[reference]/route.ts"),
    source("app/api/local-tracking/operator/[reference]/route.ts"),
    source("app/server/local-fulfillment-operator.server.ts"),
    source("app/server/local-tracking-operator.server.ts"),
  ]);

  assert.match(fulfillmentPage, /styles\.fusionFulfillmentPage/);
  assert.match(trackingPage, /styles\.fusionTrackingPage/);
  assert.match(fulfillment, /styles\.fusionFulfillment/);
  assert.match(tracking, /styles\.fusionTracking/);
  assert.match(fulfillment, /Server-side local operator authority/);
  assert.match(tracking, /Server-side operator authority/);
  assert.match(fulfillmentAuthority, /resolveLocalFulfillmentOperatorAuthority/);
  assert.match(trackingAuthority, /resolveLocalTrackingOperatorAuthority/);
  assert.match(fulfillmentRoute, /handleLocalFulfillmentOperatorHttp/);
  assert.match(trackingRoute, /createLocalTrackingOperatorHttpHandler/);
  assert.doesNotMatch(`${fulfillment}\n${tracking}`, /document\.cookie|localStorage|sessionStorage|NEXT_PUBLIC|password|secret|token|supplier|factory|procurement|warehouse|inventory/i);
  for (const state of ["quality_check", "delivered"]) assert.match(`${fulfillment}\n${tracking}`, new RegExp(state));
  assert.match(tracking, /no further local Tracking action is available/);
});

test("Fusion Batch F exposes safe rejection and terminal-control contracts without new claims", async () => {
  const [adminBoundary, lifecycleBoundary, fulfillmentService, trackingService, fulfillmentAuthority, trackingAuthority, styles] = await Promise.all([
    source("app/application/admin-catalog-boundary.ts"),
    source("app/application/admin-catalog-lifecycle.ts"),
    source("app/application/local-fulfillment-operator-service.ts"),
    source("app/application/local-tracking-operator-service.ts"),
    source("app/server/local-fulfillment-operator.server.ts"),
    source("app/server/local-tracking-operator.server.ts"),
    source("app/admin/products/admin-products.module.css"),
  ]);

  assert.match(adminBoundary, /verifyAdminSession/);
  assert.match(adminBoundary, /createRepositories/);
  assert.match(lifecycleBoundary, /verifyAdminSession/);
  assert.match(fulfillmentAuthority, /resolveLocalFulfillmentOperatorAuthority/);
  assert.match(trackingAuthority, /resolveLocalTrackingOperatorAuthority/);
  assert.match(fulfillmentService, /quality_check/);
  assert.match(trackingService, /delivered/);
  assert.doesNotMatch(styles, /Free worldwide shipping|10% off|Preview every order|50\+? countries/i);
  assert.doesNotMatch(`${adminBoundary}\n${lifecycleBoundary}`, /customerCapability|sameBrowserCapability|paymentAttemptId|fulfillmentActionId/i);
});
