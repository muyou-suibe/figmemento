import type { ProductVariant, CatalogCurrency } from "../domain/catalog/variant.ts";
import type { ProductCustomizationFieldConfiguration } from "./customization-field-repository.ts";
import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";

const MAX_CENTS = 2_147_483_647;

export interface CustomizationSurchargeAllocation {
  readonly ruleKey: string;
  readonly ruleRevision: number;
  readonly fieldId: string;
  readonly selectorKind: "field_present";
  readonly amountCents: number;
  readonly currency: CatalogCurrency;
}

export interface CustomizationPricingSnapshot {
  readonly basePriceCents: number;
  readonly currency: CatalogCurrency;
  readonly configurationRevision: string;
  readonly surchargeAllocations: readonly CustomizationSurchargeAllocation[];
  readonly totalSurchargeCents: number;
  readonly finalUnitPriceCents: number;
}

export interface CustomizationSurchargeRule {
  readonly ruleKey: string;
  readonly ruleRevision: number;
  readonly productId: string;
  readonly configurationRevision: string;
  readonly selector: { readonly kind: "field_present"; readonly fieldId: string };
  readonly amountCents: number;
  readonly currency: CatalogCurrency;
}

export type CustomizationPricingResult =
  | { readonly status: "found"; readonly value: CustomizationPricingSnapshot }
  | { readonly status: "unavailable"; readonly reason: string };

export interface CustomizationPricingInput {
  readonly productId: string;
  readonly variant: ProductVariant;
  readonly configuration: ProductCustomizationFieldConfiguration;
  readonly handoff: ConfiguredItemHandoff;
  readonly rules: readonly CustomizationSurchargeRule[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => Object.hasOwn(value, key));
}

function boundedString(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function boundedCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;
}

/**
 * Parses only the new C03 definition. Other pricing rule kinds remain owned
 * by their existing authorities and are intentionally ignored by this parser.
 * A null result for a C03 row is invalid authority, not a zero-price rule.
 */
export function parseCustomizationSurchargeRuleRow(
  row: unknown,
  projectId: string,
): CustomizationSurchargeRule | null {
  if (!isRecord(row) || row.project_id !== projectId || row.rule_status !== "active" || row.lifecycle !== "active"
    || !boundedString(row.rule_key) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) return null;
  const definition = row.definition;
  if (!isRecord(definition) || definition.kind !== "customization_surcharge") return null;
  if (!exactKeys(definition, ["kind", "ruleRevision", "productId", "configurationRevision", "selector", "amountCents", "currency"])) return null;
  if (definition.ruleRevision !== row.revision || !boundedString(definition.productId)
    || !boundedString(definition.configurationRevision, 64) || definition.currency !== "USD"
    || !boundedCents(definition.amountCents) || !isRecord(definition.selector)
    || !exactKeys(definition.selector, ["kind", "fieldId"])
    || definition.selector.kind !== "field_present" || !boundedString(definition.selector.fieldId)) return null;
  return {
    ruleKey: row.rule_key as string,
    ruleRevision: row.revision as number,
    productId: definition.productId,
    configurationRevision: definition.configurationRevision,
    selector: { kind: "field_present", fieldId: definition.selector.fieldId },
    amountCents: definition.amountCents as number,
    currency: "USD",
  };
}

function valueIsPresent(
  field: ProductCustomizationFieldConfiguration["fields"][number],
  value: ConfiguredItemHandoff["customizationValues"][number] | undefined,
): boolean {
  if (!value || value.fieldId !== field.id || value.fieldCode !== field.code || value.kind !== field.kind) return false;
  if (value.kind === "image") return value.images.length > 0;
  if (value.kind === "single_select") {
    return field.kind === "single_select"
      && field.constraints.choices.some((choice) => choice.id === value.choiceId && choice.isActive);
  }
  if (value.kind === "multi_select") {
    return field.kind === "multi_select"
      && value.choiceIds.length > 0
      && value.choiceIds.every((choiceId) => field.constraints.choices.some((choice) => choice.id === choiceId && choice.isActive));
  }
  if (value.kind === "generic_file") return value.files.length > 0;
  if (value.kind === "numeric") return Number.isFinite(value.value);
  return value.value.trim().length > 0;
}

/** Server-side deterministic C03 calculation over already accepted values. */
export function calculateCustomizationPricing(input: CustomizationPricingInput): CustomizationPricingResult {
  const { productId, variant, configuration, handoff } = input;
  if (handoff.productId !== productId || configuration.productId !== productId
    || handoff.configurationRevision !== configuration.configurationRevision
    || !boundedCents(variant.priceCents) || variant.currency !== "USD") {
    return { status: "unavailable", reason: "stale_or_invalid_configuration" };
  }

  const fields = new Map(configuration.fields.map((field) => [field.id, field]));
  const values = new Map(handoff.customizationValues.map((value) => [value.fieldId, value]));
  const applicableRules = input.rules
    .filter((rule) => rule.productId === productId)
    .sort((left, right) => left.ruleKey.localeCompare(right.ruleKey) || left.selector.fieldId.localeCompare(right.selector.fieldId));

  const seenSelectors = new Set<string>();
  const allocations: CustomizationSurchargeAllocation[] = [];
  let totalSurchargeCents = 0;
  for (const rule of applicableRules) {
    if (rule.configurationRevision !== configuration.configurationRevision) {
      return { status: "unavailable", reason: "stale_pricing_rule" };
    }
    const field = fields.get(rule.selector.fieldId);
    if (!field || field.productId !== productId || !field.isActive) {
      return { status: "unavailable", reason: "invalid_pricing_field" };
    }
    const selector = `${rule.selector.kind}:${rule.selector.fieldId}`;
    if (seenSelectors.has(selector)) return { status: "unavailable", reason: "duplicate_pricing_selector" };
    seenSelectors.add(selector);
    if (!boundedCents(rule.amountCents) || rule.currency !== variant.currency) {
      return { status: "unavailable", reason: "invalid_pricing_amount" };
    }
    if (!valueIsPresent(field, values.get(field.id))) continue;
    if (totalSurchargeCents > MAX_CENTS - rule.amountCents) {
      return { status: "unavailable", reason: "pricing_overflow" };
    }
    totalSurchargeCents += rule.amountCents;
    allocations.push({
      ruleKey: rule.ruleKey,
      ruleRevision: rule.ruleRevision,
      fieldId: field.id,
      selectorKind: rule.selector.kind,
      amountCents: rule.amountCents,
      currency: rule.currency,
    });
  }
  if (variant.priceCents > MAX_CENTS - totalSurchargeCents) {
    return { status: "unavailable", reason: "pricing_overflow" };
  }
  const finalUnitPriceCents = variant.priceCents + totalSurchargeCents;
  return {
    status: "found",
    value: {
      basePriceCents: variant.priceCents,
      currency: variant.currency,
      configurationRevision: configuration.configurationRevision,
      surchargeAllocations: allocations,
      totalSurchargeCents,
      finalUnitPriceCents,
    },
  };
}

export function equalCustomizationPricingSnapshot(
  left: CustomizationPricingSnapshot | undefined,
  right: CustomizationPricingSnapshot | undefined,
): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
