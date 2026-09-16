import type { CatalogDataSet } from "./catalog-data-set.ts";
import type { FreshLocalCheckoutLine } from "./local-checkout-evaluator.ts";
import { normalizeCustomizationFieldConfiguration } from "./customization-field-repository.ts";
import { parseConfiguredItemHandoff } from "../domain/configured-item.ts";
import { canonicalVariantSignature } from "../domain/catalog/variant.ts";
import { allocateLocalOrderAmounts } from "./local-order-allocation.ts";
import { parsePersistentPurchaseFulfillment } from "./local-persistent-fulfillment-authority.server.ts";

/** Internal preparation only, NOT an AcceptedCheckout or a commit capability.
 * The atomic repository must lock and recheck these versioned facts before
 * writing. This module neither reads browser state nor writes a repository. */
export function prepareLocalOrderPurchaseFacts(input: {
  readonly lines: readonly FreshLocalCheckoutLine[];
  readonly catalog: CatalogDataSet;
  readonly purchasedFulfillments: Readonly<Record<string, unknown>>;
  readonly configurations: readonly Record<string, unknown>[];
  readonly versions: Readonly<Record<string, number>>;
  readonly discountCents: number;
  readonly shippingCents: number;
}) {
  const unavailable = { status: "unavailable" as const };
  try {
    if (!input.lines.length || input.lines.length > 1000
      || !Object.keys(input.versions).length
      || Object.values(input.versions).some(v => !Number.isSafeInteger(v) || v < 1)) return unavailable;
    const receipts = new Set<string>();
    const items = [];
    for (const line of input.lines) {
      const parsed = parseConfiguredItemHandoff(line.handoff);
      if (!parsed.ok) return unavailable;
      const h = parsed.value, s = line.summary;
      const products = input.catalog.products.filter(p => p.id === h.productId);
      const variants = input.catalog.variants.filter(v => v.id === h.variantId && v.productId === h.productId);
      const fulfillments = input.catalog.fulfillmentConfigs.filter(f => f.productId === h.productId);
      const configs = input.configurations.filter(c => c.product_id === h.productId);
      if (products.length !== 1 || variants.length !== 1 || fulfillments.length !== 1 || configs.length !== 1) return unavailable;
      const [product] = products, [variant] = variants, [fulfillment] = fulfillments, [config] = configs;
      const purchasedFulfillment = parsePersistentPurchaseFulfillment(input.purchasedFulfillments[product.id]);
      if (purchasedFulfillment.status !== "found"
        || JSON.stringify(purchasedFulfillment.value.fulfillment) !== JSON.stringify(fulfillment)) return unavailable;
      const configuration = normalizeCustomizationFieldConfiguration(h.productId, config.definition);
      if (configuration.status !== "found" || configuration.value.configurationRevision !== h.configurationRevision
        || String(config.revision) !== h.configurationRevision
        || !Number.isSafeInteger(config.revision) || Number(config.revision) < 1
        || input.versions[`products:${product.id}`] === undefined
        || input.versions[`variants:${variant.id}`] === undefined
        || typeof config.id !== "string" || input.versions[`configurations:${config.id}`] === undefined
        || product.lifecycle !== "published" || !variant.isActive || !variant.isAvailable
        || variant.skuCode !== h.skuCode
        || canonicalVariantSignature(variant.selectedOptions) !== canonicalVariantSignature(h.selectedOptions)
        || s.lineId !== line.cartLine.lineId || s.quantity !== line.cartLine.quantity
        || !Number.isSafeInteger(s.quantity) || s.quantity < 1 || s.quantity > 20
        || s.productId !== product.id || s.productSlug !== product.slug || s.productName !== product.name
        || s.variantId !== variant.id || s.skuCode !== variant.skuCode
        || canonicalVariantSignature(s.selectedOptions) !== canonicalVariantSignature(h.selectedOptions)
        || s.unitBasePriceCents !== variant.priceCents || s.currency !== variant.currency || s.currency !== "USD"
        || !Number.isSafeInteger(s.lineSubtotalCents) || s.lineSubtotalCents !== variant.priceCents * s.quantity
        || s.fulfillmentType !== fulfillment.fulfillmentType
        || fulfillment.fulfillmentType === "digital" && fulfillment.requiresShipping) return unavailable;
      const selectedOptions = [];
      for (const selected of h.selectedOptions) {
        const options = input.catalog.options.filter(o => o.id === selected.optionId && o.productId === product.id);
        const values = input.catalog.optionValues.filter(v => v.id === selected.valueId
          && v.optionId === selected.optionId && v.productId === product.id);
        if (options.length !== 1 || values.length !== 1) return unavailable;
        selectedOptions.push({ ...selected, option: options[0], value: values[0] });
      }
      // A shared receipt cannot authorize two lines (nor appear twice in one
      // selection). An explicit same-owner copy must supply a distinct receipt.
      const media = [];
      for (const field of h.customizationValues) {
        const definition = configuration.value.fields.find(f => f.id === field.fieldId);
        if (!definition || definition.code !== field.fieldCode || definition.kind !== field.kind) return unavailable;
        if (field.kind !== "image") continue;
        for (const [position, image] of field.images.entries()) {
          if (receipts.has(image.receiptId)) return unavailable;
          receipts.add(image.receiptId);
          media.push({ fieldId: field.fieldId, fieldCode: field.fieldCode, position,
            receiptId: image.receiptId, ...(image.crop ? { crop: image.crop } : {}) });
        }
      }
      items.push({ cartLineId: s.lineId, product, variant, selectedOptions,
        quantity: s.quantity, fulfillment: { ...fulfillment, requiresProductionPreview: purchasedFulfillment.value.requiresProductionPreview }, configuration: configuration.value,
        customizationValues: h.customizationValues, media,
        customizationPriceComponents: [], customizationAmountCents: 0,
        currency: s.currency, unitPriceCents: s.unitBasePriceCents, subtotalCents: s.lineSubtotalCents });
    }
    const allocation = allocateLocalOrderAmounts({ lines: items.map(i => ({
      lineId: i.cartLineId, subtotalCents: i.subtotalCents, discountEligible: true,
      requiresShipping: i.fulfillment.fulfillmentType === "physical" && i.fulfillment.requiresShipping,
    })), discountCents: input.discountCents, shippingCents: input.shippingCents });
    if (allocation.status !== "found") return unavailable;
    // Detached immutable data, not references to a mutable Catalog data set.
    const value = structuredClone({ versions: input.versions, currency: "USD" as const,
      amounts: allocation.value, items: items.map((item, index) => ({ ...item, amounts: allocation.value.lines[index] })) });
    freeze(value);
    return { status: "found" as const, value };
  } catch { return unavailable; }
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
