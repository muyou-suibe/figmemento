import {
  acceptConfiguredItemHandoff,
  type ConfiguredItemHandoffAcceptanceDependencies,
} from "./configured-item-handoff-acceptance.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../domain/product-customization-draft.ts";
import { createProductCustomizationSummary } from "./product-customization-summary.ts";
import { toSafeCartCustomizationSummary } from "./shopping-cart-summary.ts";
import type { PublicCatalogProductDetail, PublicCatalogReadRepository } from "./catalog-repository.ts";
import type { CustomizationFieldReadRepository } from "./customization-field-repository.ts";
import type { ProductCustomizationFieldConfiguration } from "./customization-field-repository.ts";
import type { CustomerUploadReceiptRepository } from "./customer-upload-repository.ts";
import type { CustomerUploadOwnerId } from "../domain/customer-upload.ts";
import type {
  AcceptedCartItem,
  CartProviderResult,
  CartLineAvailability,
  ShoppingCart,
  ShoppingCartRecord,
  StoredCartLine,
} from "../domain/shopping-cart.ts";
import { toPublicShoppingCart } from "../domain/shopping-cart.ts";
import type { CustomizationPricingResult } from "./customization-surcharge-pricing.ts";

export type CartAddAcceptanceResult =
  | { readonly status: "accepted"; readonly value: AcceptedCartItem }
  | { readonly status: "rejected"; readonly reason: "invalid_item" | "unavailable" | "source_failure" };

export type CustomizationPricingResolver = (input: {
  readonly productId: string;
  readonly variant: PublicCatalogProductDetail["variants"][number];
  readonly configuration: ProductCustomizationFieldConfiguration;
  readonly handoff: AcceptedCartItem["handoff"];
}) => Promise<CustomizationPricingResult>;

function missingReceiptRepository(): Pick<CustomerUploadReceiptRepository, "findOwnedReceipt"> {
  return {
    async findOwnedReceipt() {
      return { status: "not_found" };
    },
  };
}

function draftFromAcceptedHandoff(input: {
  readonly productId: string;
  readonly configurationRevision: string;
  readonly handoff: AcceptedCartItem["handoff"];
}) {
  let draft = createProductCustomizationDraft({
    productId: input.productId,
    configurationRevision: input.configurationRevision,
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: input.handoff.selectedOptions,
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: input.handoff.variantId, skuCode: input.handoff.skuCode },
  });
  for (const value of input.handoff.customizationValues) {
    draft = reduceProductCustomizationDraft(draft, value.kind === "image"
      ? { type: "set_image_value", value }
      : { type: "set_text_value", value });
  }
  return draft;
}

export async function acceptCartItem(
  rawInput: unknown,
  input: {
    readonly observedAt: string;
    readonly catalogRepository: PublicCatalogReadRepository;
    readonly customizationFieldRepository: CustomizationFieldReadRepository;
    readonly receiptRepository?: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
    readonly verifiedOwnerId?: CustomerUploadOwnerId | null;
    readonly pricingResolver?: CustomizationPricingResolver;
  },
): Promise<CartAddAcceptanceResult> {
  const dependencies: ConfiguredItemHandoffAcceptanceDependencies = {
    catalogRepository: input.catalogRepository,
    customizationFieldRepository: input.customizationFieldRepository,
    receiptRepository: input.receiptRepository ?? missingReceiptRepository(),
  };
  let accepted;
  try {
    accepted = await acceptConfiguredItemHandoff(
      { rawInput, verifiedOwnerId: input.verifiedOwnerId ?? null, observedAt: input.observedAt },
      dependencies,
    );
  } catch {
    return { status: "rejected", reason: "source_failure" };
  }
  if (accepted.status !== "accepted") {
    return {
      status: "rejected",
      reason: accepted.reason === "catalog_failure" || accepted.reason === "source_failure"
        ? "source_failure"
        : accepted.reason === "product_not_available" || accepted.reason === "variant_unavailable"
          ? "unavailable"
          : "invalid_item",
    };
  }

  let detailResult;
  try {
    detailResult = await input.catalogRepository.findPublicProductById(accepted.handoff.productId);
  } catch {
    return { status: "rejected", reason: "source_failure" };
  }
  if (detailResult.status !== "found") return { status: "rejected", reason: "unavailable" };
  const detail: PublicCatalogProductDetail = detailResult.value;
  const variant = detail.variants.find((candidate) => candidate.id === accepted.handoff.variantId);
  if (!variant || variant.productId !== detail.product.id || !variant.isActive || !variant.isAvailable) {
    return { status: "rejected", reason: "unavailable" };
  }
  let configuration;
  try {
    configuration = await input.customizationFieldRepository.getCustomizationFieldsForProduct(detail.product.id);
  } catch {
    return { status: "rejected", reason: "source_failure" };
  }
  if (configuration.status !== "found") return { status: "rejected", reason: "invalid_item" };
  let pricingSnapshot: AcceptedCartItem["pricingSnapshot"];
  if (input.pricingResolver) {
    let pricing: CustomizationPricingResult;
    try {
      pricing = await input.pricingResolver({
        productId: detail.product.id,
        variant,
        configuration: configuration.value,
        handoff: accepted.handoff,
      });
    } catch {
      return { status: "rejected", reason: "source_failure" };
    }
    if (pricing.status !== "found") return { status: "rejected", reason: "source_failure" };
    pricingSnapshot = pricing.value;
  }
  const draft = draftFromAcceptedHandoff({
    productId: detail.product.id,
    configurationRevision: configuration.value.configurationRevision,
    handoff: accepted.handoff,
  });
  const summary = createProductCustomizationSummary({
    draft,
    configurationRevision: configuration.value.configurationRevision,
    fields: configuration.value.fields,
    options: detail.options,
    optionValues: detail.optionValues,
  });
  return {
    status: "accepted",
    value: {
      handoff: accepted.handoff,
      customization: toSafeCartCustomizationSummary(summary),
      snapshot: {
        productId: detail.product.id,
        productName: detail.product.name,
        productSlug: detail.product.slug,
        variantId: variant.id,
        skuCode: variant.skuCode,
        selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
        unitPriceCents: pricingSnapshot?.finalUnitPriceCents ?? variant.priceCents,
        currency: variant.currency,
        availability: "available",
      },
      ...(pricingSnapshot ? { pricingSnapshot } : {}),
    },
  };
}

export function publicCartFromProviderResult(
  result: CartProviderResult<ShoppingCartRecord>,
): ShoppingCart {
  if (result.status === "found") return toPublicShoppingCart(result.value);
  if (result.status === "not_found") return { status: "empty", lines: [] };
  return { status: "failure", lines: [] };
}

function sameOptions(
  left: readonly { readonly optionId: string; readonly valueId: string }[],
  right: readonly { readonly optionId: string; readonly valueId: string }[],
): boolean {
  const key = (items: readonly { readonly optionId: string; readonly valueId: string }[]) =>
    items.map((item) => `${item.optionId}:${item.valueId}`).sort().join("|");
  return key(left) === key(right);
}

function withAvailability(line: StoredCartLine, availability: CartLineAvailability): StoredCartLine {
  return { ...line, snapshot: { ...line.snapshot, availability } };
}

/** Revalidates current catalog availability without rewriting the Cart snapshot. */
export async function publicCartWithCatalogRevalidation(
  record: ShoppingCartRecord,
  catalogRepository: PublicCatalogReadRepository,
): Promise<ShoppingCart> {
  let sourceFailure = false;
  const lines = await Promise.all(record.lines.map(async (line) => {
    try {
      const product = await catalogRepository.findPublicProductById(line.snapshot.productId);
      if (product.status === "source_failure" || product.status === "invalid_configuration") {
        sourceFailure = true;
        return line;
      }
      if (product.status !== "found") {
        return withAvailability(line, "unavailable");
      }
      const variant = await catalogRepository.resolveExactVariant({
        productId: line.snapshot.productId,
        variantId: line.snapshot.variantId,
      });
      if (variant.status === "source_failure" || variant.status === "invalid_configuration") {
        sourceFailure = true;
        return line;
      }
      if (variant.status !== "found") {
        return withAvailability(line, "unavailable");
      }
      const current = variant.value;
      const storedBasePrice = line.pricingSnapshot?.basePriceCents ?? line.snapshot.unitPriceCents;
      const stale = product.value.product.name !== line.snapshot.productName
        || product.value.product.slug !== line.snapshot.productSlug
        || current.skuCode !== line.snapshot.skuCode
        || current.priceCents !== storedBasePrice
        || current.currency !== line.snapshot.currency
        || !sameOptions(current.selectedOptions, line.snapshot.selectedOptions);
      return withAvailability(line, stale ? "stale" : "available");
    } catch {
      sourceFailure = true;
      return line;
    }
  }));
  return sourceFailure
    ? { status: "failure", lines: [] }
    : toPublicShoppingCart({ ...record, lines });
}

export function unavailableCart(): ShoppingCart {
  return { status: "unavailable_source", lines: [] };
}

export function cartErrorResponse(status: number, message: string): Response {
  return Response.json({ status: "error", message }, { status });
}
