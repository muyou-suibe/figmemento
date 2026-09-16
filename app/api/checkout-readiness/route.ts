import {
  CheckoutReadinessEvaluator,
} from "../../application/checkout-readiness-evaluator.ts";
import {
  aggregateCheckoutReadiness,
  emptyCartReadiness,
  readinessIssue,
  unavailableReadiness,
  type CheckoutReadinessDependency,
} from "../../domain/checkout-readiness.ts";
import { createServerCatalogRepository } from "../../infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../../infrastructure/customization/server-customization-field-repository.ts";
import { getShoppingCartProvider, readShoppingCartId } from "../../server/shopping-cart-runtime.server.ts";
import {
  hasPrivateImageReceiptValue,
  resolveLocalCustomerUploadReceiptAuthority,
} from "../../server/customer-upload-runtime.server.ts";
import { readPersistentPurchaseCart, persistentPurchaseReceipts } from "../../server/local-persistent-purchase-authority.server.ts";
import { LocalCatalogAuthority } from "../../infrastructure/local-commerce/local-catalog-authority.server.ts";

const deferredDependencies: readonly CheckoutReadinessDependency[] = [
  { name: "order_persistence", status: "not_activated", issue: readinessIssue("ORDER_PERSISTENCE_UNAVAILABLE") },
  { name: "shipping", status: "not_activated", issue: readinessIssue("SHIPPING_UNAVAILABLE") },
  { name: "tax", status: "not_activated", issue: readinessIssue("TAX_UNAVAILABLE") },
  { name: "discount", status: "not_activated", issue: readinessIssue("DISCOUNT_UNAVAILABLE") },
  { name: "payment", status: "not_activated", issue: readinessIssue("PAYMENT_UNAVAILABLE") },
];

function responseForReport(report: ReturnType<typeof emptyCartReadiness>): Response {
  return Response.json(report, { status: report.state === "unavailable" ? 503 : 200 });
}

export async function GET(request: Request): Promise<Response> {
  const evaluatedAt = new Date().toISOString();
  try {
    if (process.env.CART_SOURCE?.trim() === "local_persistent") {
      const current = await readPersistentPurchaseCart(request);
      if (current.status === "empty") return responseForReport(emptyCartReadiness(evaluatedAt));
      if (current.status !== "found") return responseForReport(unavailableReadiness(evaluatedAt, "CART_UNAVAILABLE"));
      const catalog = new LocalCatalogAuthority(process.env);
      const needsMedia = current.record.lines.some(line => hasPrivateImageReceiptValue(line.handoff));
      const evaluator = new CheckoutReadinessEvaluator({
        // evaluateCartRecord below consumes the captured, authorized DB read.
        cartReader: { async getCart(id) { return id === current.record.cartId
          ? { status: "found", value: current.record } : { status: "not_found" }; } },
        catalogRepository: catalog.repository, customizationFieldRepository: catalog,
        dependencies: deferredDependencies,
        ...(needsMedia ? { verifiedOwnerId: current.owner.ownerId,
          receiptRepository: persistentPurchaseReceipts(process.env, current.verifyOwner, current.record.lines.map(line => line.handoff)) } : {}),
      });
      return responseForReport(await evaluator.evaluateCartRecord(current.record, evaluatedAt));
    }
    const cartId = readShoppingCartId(request);
    if (!cartId) return responseForReport(emptyCartReadiness(evaluatedAt));

    const provider = getShoppingCartProvider();
    if (!provider) return responseForReport(unavailableReadiness(evaluatedAt, "CART_UNAVAILABLE"));

    // Capture the current Cart exactly once before constructing any other
    // authority. Missing and empty Carts are deterministic EMPTY_CART reads.
    const currentCart = await provider.getCart(cartId);
    if (currentCart.status === "not_found") return responseForReport(emptyCartReadiness(evaluatedAt));
    if (currentCart.status !== "found") {
      return responseForReport(unavailableReadiness(evaluatedAt, "CART_UNAVAILABLE"));
    }
    if (currentCart.value.lines.length === 0) return responseForReport(emptyCartReadiness(evaluatedAt));

    const needsUploadAuthority = currentCart.value.lines.some((line) =>
      hasPrivateImageReceiptValue(line.handoff));
    const uploadAuthority = needsUploadAuthority
      ? await resolveLocalCustomerUploadReceiptAuthority(request)
      : null;

    const catalogSource = await createServerCatalogRepository();
    if (catalogSource.status !== "found") {
      return responseForReport(unavailableReadiness(evaluatedAt));
    }
    const customizationSource = createServerCustomizationFieldRepository();
    if (customizationSource.source !== catalogSource.value.source) {
      return responseForReport(unavailableReadiness(evaluatedAt));
    }

    const evaluator = new CheckoutReadinessEvaluator({
      cartReader: provider,
      catalogRepository: catalogSource.value.repository,
      customizationFieldRepository: customizationSource.repository,
      dependencies: deferredDependencies,
      ...(uploadAuthority
        ? {
            receiptRepository: uploadAuthority.receiptRepository,
            verifiedOwnerId: uploadAuthority.ownerId,
          }
        : {}),
    });
    return responseForReport(await evaluator.evaluateCartRecord(currentCart.value, evaluatedAt));
  } catch {
    return responseForReport(aggregateCheckoutReadiness({
      evaluatedAt,
      lines: [],
      issues: [readinessIssue("INTERNAL_UNAVAILABLE")],
      dependencies: deferredDependencies,
    }));
  }
}
