import { isRecord, isIdentifier } from "../domain/catalog/validation.ts";
import { parseCatalogProduct, parseProductVariant, parseProductOption, parseProductOptionValue } from "../domain/catalog/index.ts";
import { parseConfiguredItemHandoff } from "../domain/configured-item.ts";
import { normalizeCustomizationFieldConfiguration } from "./customization-field-repository.ts";
import { parsePersistentPurchaseFulfillment } from "./local-persistent-fulfillment-authority.server.ts";

const unavailable = () => ({ status: "unavailable" as const });
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2147483647;
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const validated = new WeakSet<object>(); // Validation stamp only, never a repository/cache.

/** Internal DB-result validation, NOT actor authorization. Call only after the
 * repository has selected exact canonical state under its caller's authority.
 * Projectors never call this parser on browser/Catalog/Cart input themselves. */
export function validatePersistentHistoryModel(raw: unknown) {
  try {
    if (!isRecord(raw) || !uuid(raw.orderId) || !uuid(raw.orderItemId)
      || typeof raw.publicReference !== "string" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(raw.publicReference)
      || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))
      || !Number.isSafeInteger(raw.itemSequence) || Number(raw.itemSequence) < 0
      || typeof raw.orderLifecycle !== "string" || !["pending_payment","paid","payment_failed","cancelled","closed"].includes(raw.orderLifecycle)
      || !isRecord(raw.contact) || !isRecord(raw.purchasedItem)) return unavailable();
    const i = raw.purchasedItem;
    const product = parseCatalogProduct(i.product), variant = parseProductVariant(i.variant);
    const fulfillment = parsePersistentPurchaseFulfillment(i.fulfillment);
    if (!product.ok || !variant.ok || fulfillment.status !== "found"
      || product.value.id !== variant.value.productId || product.value.id !== fulfillment.value.fulfillment.productId
      || !Number.isSafeInteger(i.quantity) || Number(i.quantity) < 1 || Number(i.quantity) > 20
      || i.currency !== "USD" || !money(i.unitPriceCents) || !money(i.subtotalCents)
      || i.subtotalCents !== i.unitPriceCents * Number(i.quantity) || !Array.isArray(i.selectedOptions) || !Array.isArray(i.media)) return unavailable();
    const configuration = normalizeCustomizationFieldConfiguration(product.value.id, i.configuration);
    if (configuration.status !== "found") return unavailable();
    const handoff = parseConfiguredItemHandoff({ productId: product.value.id, variantId: variant.value.id,
      skuCode: variant.value.skuCode, selectedOptions: variant.value.selectedOptions,
      configurationRevision: configuration.value.configurationRevision, customizationValues: i.customizationValues });
    if (!handoff.ok) return unavailable();
    const options = [];
    for (const o of i.selectedOptions) {
      if (!isRecord(o)) return unavailable();
      const option = parseProductOption(o.option), value = parseProductOptionValue(o.value);
      if (!option.ok || !value.ok || option.value.productId !== product.value.id || value.value.productId !== product.value.id
        || option.value.id !== o.optionId || value.value.id !== o.valueId || value.value.optionId !== o.optionId) return unavailable();
      options.push({ optionId: option.value.id, valueId: value.value.id, optionName: option.value.name, valueLabel: value.value.label });
    }
    if (JSON.stringify(options.map(({optionId,valueId})=>({optionId,valueId}))) !== JSON.stringify(variant.value.selectedOptions)) return unavailable();
    const media = [];
    for (const m of i.media) {
      if (!isRecord(m) || !uuid(m.receiptId) || !isIdentifier(m.fieldId) || !isIdentifier(m.fieldCode)
        || !Number.isSafeInteger(m.position) || Number(m.position) < 0
        || Object.keys(m).some(k=>!["receiptId","fieldId","fieldCode","position","crop"].includes(k))) return unavailable();
      const field = handoff.value.customizationValues.find(f=>f.fieldId===m.fieldId && f.fieldCode===m.fieldCode);
      if (!field || field.kind !== "image" || field.images[Number(m.position)]?.receiptId !== m.receiptId
        || JSON.stringify(field.images[Number(m.position)]?.crop) !== JSON.stringify(m.crop)) return unavailable();
      media.push({ receiptId:m.receiptId, fieldId:m.fieldId, fieldCode:m.fieldCode, position:Number(m.position),
        ...(field.images[Number(m.position)].crop ? {crop:structuredClone(field.images[Number(m.position)].crop)} : {}) });
    }
    if (media.length !== handoff.value.customizationValues.reduce((n,f)=>n+(f.kind==="image"?f.images.length:0),0)
      || new Set(media.map(m=>m.receiptId)).size!==media.length) return unavailable();
    if (!isRecord(i.amounts) || !isRecord(i.amounts.tax) || i.amounts.tax.status!=="not_activated" || i.amounts.tax.amount!==null
      || !money(i.amounts.discountCents) || !money(i.amounts.shippingCents) || !money(i.amounts.localArithmeticTotalCents)
      || i.amounts.localArithmeticTotalCents!==i.subtotalCents+i.amounts.shippingCents-i.amounts.discountCents) return unavailable();
    const contact: Record<string,string> = {};
    for (const [k,v] of Object.entries(raw.contact)) {
      if (!["email","firstName","lastName","country","stateProvince","city","addressLine1","postalCode","phone"].includes(k)
        || typeof v!=="string" || v.length>254) return unavailable();
      contact[k]=v;
    }
    const value = freeze({ orderId:raw.orderId,publicReference:raw.publicReference,createdAt:raw.createdAt,
      orderLifecycle:raw.orderLifecycle,orderItemId:raw.orderItemId,itemSequence:Number(raw.itemSequence),
      contact,product:{id:product.value.id,slug:product.value.slug,name:product.value.name,description:product.value.description},
      variant:{id:variant.value.id,skuCode:variant.value.skuCode},selectedOptions:options,quantity:Number(i.quantity),
      pricing:{currency:"USD" as const,unitPriceCents:i.unitPriceCents,subtotalCents:i.subtotalCents,
        discountCents:i.amounts.discountCents,shippingCents:i.amounts.shippingCents,
        localArithmeticTotalCents:i.amounts.localArithmeticTotalCents,tax:{status:"not_activated" as const,amount:null}},
      configuration:structuredClone(configuration.value),customizationValues:structuredClone(handoff.value.customizationValues),
      fulfillment:{...fulfillment.value.fulfillment,requiresProductionPreview:fulfillment.value.requiresProductionPreview},media });
    validated.add(value);
    return {status:"found" as const,value};
  } catch { return unavailable(); }
}

export type CanonicalPersistentHistory = Extract<ReturnType<typeof validatePersistentHistoryModel>,{status:"found"}>["value"];
const identity = (h:CanonicalPersistentHistory)=>({orderId:h.orderId,publicReference:h.publicReference,
  createdAt:h.createdAt,orderLifecycle:h.orderLifecycle,orderItemId:h.orderItemId,itemSequence:h.itemSequence});
function project(h:CanonicalPersistentHistory, select:(h:CanonicalPersistentHistory)=>object) {
  return h && validated.has(h) ? {status:"found" as const,value:freeze(structuredClone(select(h)))} : unavailable();
}
export const projectHistoryForAdmin = (h:CanonicalPersistentHistory)=>project(h,x=>({...identity(x),contact:x.contact,
  product:x.product,variant:x.variant,selectedOptions:x.selectedOptions,quantity:x.quantity,pricing:x.pricing,
  configuration:x.configuration,customizationValues:x.customizationValues,fulfillment:x.fulfillment,media:x.media}));
export const projectHistoryForFulfillment = (h:CanonicalPersistentHistory)=>project(h,x=>({...identity(x),quantity:x.quantity,
  fulfillmentType:x.fulfillment.fulfillmentType,requiresShipping:x.fulfillment.requiresShipping,
  productionMode:x.fulfillment.productionMode,leadTime:x.fulfillment.leadTime,
  requiresProductionPreview:x.fulfillment.requiresProductionPreview,configuration:x.configuration,
  customizationValues:x.customizationValues,media:x.media}));
export const projectHistoryForTracking = (h:CanonicalPersistentHistory)=>project(h,x=>({...identity(x),
  fulfillmentType:x.fulfillment.fulfillmentType,requiresShipping:x.fulfillment.requiresShipping,
  requiresProductionPreview:x.fulfillment.requiresProductionPreview,
  destination:Object.fromEntries(Object.entries(x.contact).filter(([k])=>k!=="email"))}));
export const projectHistoryForDelivery = (h:CanonicalPersistentHistory)=>project(h,x=>({...identity(x),
  fulfillmentType:x.fulfillment.fulfillmentType,requiresProductionPreview:x.fulfillment.requiresProductionPreview,
  configuration:x.configuration,customizationValues:x.customizationValues,media:x.media}));
export const projectHistoryForSupplier = (h:CanonicalPersistentHistory)=>{void h;return unavailable();};
