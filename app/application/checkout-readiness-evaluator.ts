import {
  acceptConfiguredItemHandoff,
  type SafeConfiguredItemRejectionReason,
} from "./configured-item-handoff-acceptance.ts";
import type {
  CustomizationFieldReadRepository,
} from "./customization-field-repository.ts";
import type { CustomerUploadReceiptRepository } from "./customer-upload-repository.ts";
import type {
  PublicCatalogProductDetail,
  PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import {
  aggregateCheckoutReadiness,
  emptyCartReadiness,
  readinessIssue,
  readinessStateForIssues,
  type CheckoutReadinessDependency,
  type CheckoutReadinessIssue,
  type CheckoutReadinessLine,
  type CheckoutReadinessReport,
} from "../domain/checkout-readiness.ts";
import {
  validateProductFulfillmentConfig,
} from "../domain/catalog/fulfillment.ts";
import { canonicalVariantSignature } from "../domain/catalog/variant.ts";
import type { CustomerUploadOwnerId, CustomerUploadTimestamp } from "../domain/customer-upload.ts";
import type {
  ShoppingCartProvider,
  StoredCartLine,
} from "../domain/shopping-cart.ts";

export interface CheckoutReadinessEvaluatorDependencies {
  readonly cartReader: Pick<ShoppingCartProvider, "getCart">;
  readonly catalogRepository: Pick<PublicCatalogReadRepository, "findPublicProductById">;
  readonly customizationFieldRepository: Pick<
    CustomizationFieldReadRepository,
    "getCustomizationFieldsForProduct"
  >;
  /** The runtime may omit this until an approved owner-scoped adapter exists. */
  readonly receiptRepository?: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
  /** Derived by a separate verified ownership boundary; never read from the Cart. */
  readonly verifiedOwnerId?: CustomerUploadOwnerId | null;
  readonly dependencies?: readonly CheckoutReadinessDependency[];
}

const missingReceiptRepository: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt"> = {
  async findOwnedReceipt() {
    return { status: "not_found" };
  },
};

function containsPrivateImage(line: StoredCartLine): boolean {
  return line.handoff.customizationValues.some(
    (value) => value.kind === "image" && value.images.length > 0,
  );
}

function mapCatalogResultIssue(
  result: Exclude<Awaited<ReturnType<PublicCatalogReadRepository["findPublicProductById"]>>, { status: "found" }>,
): CheckoutReadinessIssue {
  if (result.status === "unavailable" || result.status === "not_found") {
    return readinessIssue("ITEM_UNAVAILABLE");
  }
  return readinessIssue("INTERNAL_UNAVAILABLE");
}

function mapAcceptanceReason(
  reason: SafeConfiguredItemRejectionReason,
  line: StoredCartLine,
  receiptAuthorityAvailable: boolean,
): CheckoutReadinessIssue {
  switch (reason) {
    case "product_not_available":
    case "variant_unavailable":
      return readinessIssue("ITEM_UNAVAILABLE");
    case "variant_incomplete":
    case "variant_mismatch":
    case "variant_invalid":
      return readinessIssue("OPTIONS_CHANGED");
    case "stale_configuration":
      return readinessIssue("CUSTOMIZATION_STALE");
    case "customization_not_configured":
    case "invalid_customization":
      return readinessIssue("CUSTOMIZATION_INVALID");
    case "receipt_not_owned_or_missing":
    case "receipt_inactive":
    case "receipt_expired":
      return containsPrivateImage(line) && !receiptAuthorityAvailable
        ? readinessIssue("UPLOAD_UNAVAILABLE")
        : readinessIssue("UPLOAD_INVALID");
    case "catalog_failure":
    case "source_failure":
      return readinessIssue("INTERNAL_UNAVAILABLE");
    case "invalid_handoff":
      return readinessIssue("CUSTOMIZATION_INVALID");
  }
}

function compareFreshCatalog(
  line: StoredCartLine,
  detail: PublicCatalogProductDetail,
): CheckoutReadinessIssue[] {
  const issues: CheckoutReadinessIssue[] = [];
  if (
    detail.product.id !== line.snapshot.productId
    || detail.product.name !== line.snapshot.productName
    || detail.product.slug !== line.snapshot.productSlug
  ) {
    issues.push(readinessIssue("CATALOG_CHANGED"));
  }

  // StoredCartLine has no historical FulfillmentConfig snapshot. These are
  // current-authority integrity failures, not evidence of historical change.
  if (detail.fulfillment.productId !== detail.product.id) {
    issues.push(readinessIssue("INTERNAL_UNAVAILABLE"));
  } else if (!validateProductFulfillmentConfig(detail.fulfillment).ok) {
    issues.push(readinessIssue("INTERNAL_UNAVAILABLE"));
  }

  const variant = detail.variants.find((candidate) => candidate.id === line.snapshot.variantId);
  if (!variant) {
    issues.push(readinessIssue("ITEM_UNAVAILABLE"));
    return issues;
  }
  if (
    variant.productId !== line.snapshot.productId
    || variant.skuCode !== line.snapshot.skuCode
  ) {
    issues.push(readinessIssue("CATALOG_CHANGED"));
  }
  if (canonicalVariantSignature(variant.selectedOptions) !== canonicalVariantSignature(line.snapshot.selectedOptions)
    || variant.selectedOptions.length !== line.snapshot.selectedOptions.length) {
    issues.push(readinessIssue("OPTIONS_CHANGED"));
  }
  if (variant.priceCents !== line.snapshot.unitPriceCents) {
    issues.push(readinessIssue("PRICE_CHANGED"));
  }
  if (variant.currency !== line.snapshot.currency) {
    issues.push(readinessIssue("CURRENCY_CHANGED"));
  }
  if (!variant.isActive || !variant.isAvailable) {
    issues.push(readinessIssue("ITEM_UNAVAILABLE"));
  }
  return issues;
}

async function evaluateLine(
  line: StoredCartLine,
  dependencies: CheckoutReadinessEvaluatorDependencies,
  observedAt: CustomerUploadTimestamp,
): Promise<CheckoutReadinessLine> {
  const issues: CheckoutReadinessIssue[] = [];
  let catalogResult: Awaited<ReturnType<PublicCatalogReadRepository["findPublicProductById"]>>;
  try {
    catalogResult = await dependencies.catalogRepository.findPublicProductById(line.snapshot.productId);
  } catch {
    catalogResult = { status: "source_failure", operation: "catalog.read" };
  }

  if (catalogResult.status !== "found") {
    issues.push(mapCatalogResultIssue(catalogResult));
  } else {
    issues.push(...compareFreshCatalog(line, catalogResult.value));
  }

  const acceptance = await acceptConfiguredItemHandoff(
    {
      rawInput: line.handoff,
      verifiedOwnerId: dependencies.verifiedOwnerId ?? null,
      observedAt,
    },
    {
      catalogRepository: dependencies.catalogRepository,
      customizationFieldRepository: dependencies.customizationFieldRepository,
      receiptRepository: dependencies.receiptRepository ?? missingReceiptRepository,
    },
  );
  if (acceptance.status === "rejected") {
    issues.push(mapAcceptanceReason(
      acceptance.reason,
      line,
      dependencies.receiptRepository !== undefined && dependencies.verifiedOwnerId != null,
    ));
  }

  return {
    lineId: line.lineId,
    productName: line.snapshot.productName,
    skuCode: line.snapshot.skuCode,
    state: readinessStateForIssues(issues),
    issues,
  };
}

async function evaluateLineSafely(
  line: StoredCartLine,
  dependencies: CheckoutReadinessEvaluatorDependencies,
  observedAt: CustomerUploadTimestamp,
): Promise<CheckoutReadinessLine> {
  try {
    return await evaluateLine(line, dependencies, observedAt);
  } catch {
    return {
      lineId: line.lineId,
      productName: line.snapshot.productName,
      skuCode: line.snapshot.skuCode,
      state: "unavailable",
      issues: [readinessIssue("INTERNAL_UNAVAILABLE")],
    };
  }
}

/**
 * Read-only readiness evaluation above the existing Cart and configured-item
 * boundaries. It never writes, refreshes, removes, or claims any state.
 */
export class CheckoutReadinessEvaluator {
  private readonly dependencies: CheckoutReadinessEvaluatorDependencies;

  constructor(dependencies: CheckoutReadinessEvaluatorDependencies) {
    this.dependencies = dependencies;
  }

  async evaluateCartRecord(
    record: { readonly lines: readonly StoredCartLine[] },
    evaluatedAt = new Date().toISOString(),
  ): Promise<CheckoutReadinessReport> {
    if (record.lines.length === 0) return emptyCartReadiness(evaluatedAt);

    const lines = await Promise.all(
      record.lines.map((line) => evaluateLineSafely(line, this.dependencies, evaluatedAt)),
    );
    return aggregateCheckoutReadiness({
      evaluatedAt,
      lines,
      dependencies: this.dependencies.dependencies,
    });
  }

  async evaluate(
    cartId: string | null,
    evaluatedAt = new Date().toISOString(),
  ): Promise<CheckoutReadinessReport> {
    if (cartId === null) return emptyCartReadiness(evaluatedAt);

    let result: Awaited<ReturnType<ShoppingCartProvider["getCart"]>>;
    try {
      result = await this.dependencies.cartReader.getCart(cartId);
    } catch {
      return aggregateCheckoutReadiness({
        evaluatedAt,
        lines: [],
        issues: [readinessIssue("CART_UNAVAILABLE")],
        dependencies: this.dependencies.dependencies,
      });
    }
    if (result.status === "not_found") return emptyCartReadiness(evaluatedAt);
    if (result.status !== "found") {
      return aggregateCheckoutReadiness({
        evaluatedAt,
        lines: [],
        issues: [readinessIssue("CART_UNAVAILABLE")],
        dependencies: this.dependencies.dependencies,
      });
    }
    return this.evaluateCartRecord(result.value, evaluatedAt);
  }
}
