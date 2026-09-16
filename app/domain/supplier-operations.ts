import {
  isIdentifier,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isSkuCode,
  isSlug,
  unknownFieldIssues,
} from "./catalog/validation.ts";
import type {
  LocalSupplierFixture,
  SupplierOfferFixture,
  SupplierOfferVariantFixture,
  SupplierSourceProvenance,
} from "./supplier-source.ts";
import { isLocalOrderPublicReference } from "./local-order.ts";

export type SupplierOperationalStatus = "active" | "inactive" | "unknown";
export type SupplierFulfillmentType = "physical" | "digital";
export type SupplierPlatform = "1688" | "Taobao" | "Tmall" | "unknown";
export type SupplierCurrency = "CNY" | "USD";
export type SupplierPricingBasis =
  | "fixed"
  | "variant_fixed"
  | "area_based"
  | "manual_quote_required";
export type SupplierPriceUnit = "per_unit" | "per_area" | "manual_quote" | "unknown";
export type SupplierReviewStatus =
  | "approved"
  | "provisional"
  | "ambiguous"
  | "unmapped"
  | "unknown";

export type SupplierValidationCode =
  | "invalid_type"
  | "invalid_format"
  | "invalid_value"
  | "unknown_field"
  | "required"
  | "duplicate"
  | "ownership"
  | "inactive"
  | "unsupported"
  | "warehouse_ineligible"
  | "missing_mapping"
  | "review_required"
  | "conflict"
  | "unauthorized"
  | "unavailable";

export interface SupplierValidationIssue {
  readonly path: string;
  readonly code: SupplierValidationCode;
  readonly message: string;
}

export type SupplierValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly SupplierValidationIssue[] };

export interface SupplierSelectedOption {
  readonly optionId: string;
  readonly valueId: string;
}

export interface CanonicalSupplierSelection {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SupplierSelectedOption[];
  readonly fulfillmentType: SupplierFulfillmentType;
  readonly quantity: number;
}

export interface SupplierCatalogMapping {
  readonly status: SupplierReviewStatus;
  readonly productId: string | null;
  readonly productSlug: string | null;
  readonly catalogVariantId: string | null;
  readonly skuCode: string | null;
  readonly selectedOptions: readonly SupplierSelectedOption[] | null;
  readonly supplierOfferId: string | null;
  readonly supplierOfferVariantId: string | null;
  readonly mappingKey: string | null;
  readonly reason: string;
}

export interface Supplier {
  readonly kind: "supplier";
  readonly supplierId: string;
  readonly displayName: string;
  readonly platform: SupplierPlatform;
  readonly sourceUrl: string | null;
  readonly status: SupplierOperationalStatus;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly videoCapability: "available" | "paid" | "unknown";
  readonly returnReworkPolicy: string | null;
  readonly notes: string | null;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export interface SupplierOffer {
  readonly kind: "supplier_offer";
  readonly offerId: string;
  readonly supplierId: string;
  readonly sourceProductLabel: string;
  readonly fulfillmentType: SupplierFulfillmentType;
  readonly status: SupplierOperationalStatus;
  readonly catalogMapping: SupplierCatalogMapping;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly sourcePackagedWeightText: string | null;
  readonly notes: string | null;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export interface SupplierOfferVariant {
  readonly kind: "supplier_offer_variant";
  readonly supplierOfferVariantId: string;
  readonly offerId: string;
  readonly supplierSpecificationKey: string;
  readonly label: string;
  readonly status: SupplierOperationalStatus;
  readonly supplierCostCents: number | null;
  readonly currency: SupplierCurrency | null;
  readonly pricingBasis: SupplierPricingBasis;
  readonly priceUnit: SupplierPriceUnit;
  readonly optionSurchargeCents: number | null;
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: SupplierReviewStatus;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly dimensionsCm: null;
  readonly rawSourceValue: string;
  readonly reviewStatus: SupplierReviewStatus;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export interface SupplierDomainDataset {
  readonly suppliers: readonly Supplier[];
  readonly offers: readonly SupplierOffer[];
  readonly variants: readonly SupplierOfferVariant[];
}

export interface SupplierSourceFixtureDataset {
  readonly suppliers: readonly LocalSupplierFixture[];
  readonly offers: readonly SupplierOfferFixture[];
  readonly variants: readonly SupplierOfferVariantFixture[];
}

export interface SupplierCanonicalOrderIdentity {
  readonly internalOrderId: string;
  readonly publicReference: string;
}

export interface SupplierProductionUnitIdentity {
  readonly canonicalOrder: SupplierCanonicalOrderIdentity;
  readonly orderItemId: string;
}

export interface SupplierCandidateInput {
  readonly selection: CanonicalSupplierSelection;
  readonly shanghaiWarehouseRequired: boolean;
}

export interface SupplierCandidateIdentity {
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
}

export interface SupplierCandidate extends SupplierCandidateIdentity {
  readonly kind: "supplier_candidate";
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly selection: CanonicalSupplierSelection;
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SupplierSelectedOption[];
  readonly quantity: number;
  readonly fulfillmentType: SupplierFulfillmentType;
  readonly supplierSpecificationKey: string;
  readonly supplierDisplayName: string;
  readonly sourceProductLabel: string;
  readonly supplierCostCents: number | null;
  readonly currency: SupplierCurrency | null;
  readonly pricingBasis: SupplierPricingBasis;
  readonly priceUnit: SupplierPriceUnit;
  readonly optionSurchargeCents: number | null;
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: SupplierReviewStatus;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly reviewStatus: SupplierReviewStatus;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export type SupplierCandidateMatchResult =
  | {
      readonly status: "eligible";
      readonly input: SupplierCandidateInput;
      readonly candidates: readonly SupplierCandidate[];
    }
  | {
      readonly status: "no_eligible_candidates" | "review_required";
      readonly input: SupplierCandidateInput;
      readonly candidates: readonly [];
      readonly issues: readonly SupplierValidationIssue[];
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly SupplierValidationIssue[];
    };

export interface SupplierOperatorAuthority {
  readonly actorKind: "operator";
  readonly actorContextId: string;
}

export interface SupplierAssignmentRequest {
  readonly assignmentActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly operatorAuthority: SupplierOperatorAuthority;
  readonly candidateResult: SupplierCandidateMatchResult;
  readonly selectedCandidate: SupplierCandidateIdentity;
}

export interface SupplierAssignmentSnapshot {
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SupplierSelectedOption[];
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
  readonly supplierSpecificationKey: string;
  readonly supplierCostCents: number | null;
  readonly currency: SupplierCurrency | null;
  readonly pricingBasis: SupplierPricingBasis;
  readonly priceUnit: SupplierPriceUnit;
  readonly optionSurchargeCents: number | null;
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: SupplierReviewStatus;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly reviewStatus: SupplierReviewStatus;
  readonly assignedAt: string;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export interface SupplierAssignment {
  readonly kind: "supplier_assignment";
  readonly assignmentId: string;
  readonly assignmentActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly snapshot: SupplierAssignmentSnapshot;
  readonly assignedByActorContextId: string;
}

export type SupplierAssignmentResult =
  | { readonly status: "committed" | "replayed"; readonly assignment: SupplierAssignment }
  | {
      readonly status: "rejected" | "conflict" | "unavailable" | "failed";
      readonly issues: readonly SupplierValidationIssue[];
    };

export interface SupplierAssignmentRepository {
  commit(input: SupplierAssignmentRequest): SupplierAssignmentResult;
  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly assignment: SupplierAssignment }
    | { readonly status: "unavailable" };
}

const SPECIFICATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function issue(path: string, code: SupplierValidationCode, message: string): SupplierValidationIssue {
  return { path, code, message };
}

function success<T>(value: T): SupplierValidationResult<T> {
  return { ok: true, value };
}

function failure<T = never>(...issues: SupplierValidationIssue[]): SupplierValidationResult<T> {
  return { ok: false, issues };
}

function isSupplierOperationalStatus(value: unknown): value is SupplierOperationalStatus {
  return value === "active" || value === "inactive" || value === "unknown";
}

function isSupplierReviewStatus(value: unknown): value is SupplierReviewStatus {
  return value === "approved"
    || value === "provisional"
    || value === "ambiguous"
    || value === "unmapped"
    || value === "unknown";
}

function isSupplierPlatform(value: unknown): value is SupplierPlatform {
  return value === "1688" || value === "Taobao" || value === "Tmall" || value === "unknown";
}

function isSupplierCurrency(value: unknown): value is SupplierCurrency | null {
  return value === null || value === "CNY" || value === "USD";
}

function isPricingBasis(value: unknown): value is SupplierPricingBasis {
  return value === "fixed"
    || value === "variant_fixed"
    || value === "area_based"
    || value === "manual_quote_required";
}

function isPriceUnit(value: unknown): value is SupplierPriceUnit {
  return value === "per_unit" || value === "per_area" || value === "manual_quote" || value === "unknown";
}

function isProductionDays(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isSupplierFulfillmentType(value: unknown): value is SupplierFulfillmentType {
  return value === "physical" || value === "digital";
}

function isSpecificationKey(value: unknown): value is string {
  return typeof value === "string" && SPECIFICATION_KEY_PATTERN.test(value);
}

function parseSelectedOptions(value: unknown, path: string): SupplierValidationResult<readonly SupplierSelectedOption[]> {
  if (!Array.isArray(value)) return failure(issue(path, "invalid_type", "Selected options must be an array."));
  const issues: SupplierValidationIssue[] = [];
  const optionIds = new Set<string>();
  const selectedOptions: SupplierSelectedOption[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(issue(`${path}[${index}]`, "invalid_type", "Selected option must be an object."));
      return;
    }
    if (!isIdentifier(entry.optionId)) issues.push(issue(`${path}[${index}].optionId`, "invalid_format", "Selected option identity is invalid."));
    if (!isIdentifier(entry.valueId)) issues.push(issue(`${path}[${index}].valueId`, "invalid_format", "Selected value identity is invalid."));
    if (isIdentifier(entry.optionId) && optionIds.has(entry.optionId)) issues.push(issue(`${path}[${index}].optionId`, "duplicate", "Selected option identity is duplicated."));
    if (isIdentifier(entry.optionId)) optionIds.add(entry.optionId);
    if (isIdentifier(entry.optionId) && isIdentifier(entry.valueId)) selectedOptions.push({ optionId: entry.optionId, valueId: entry.valueId });
  });
  return issues.length > 0 ? failure(...issues) : success(selectedOptions);
}

function cloneProvenance(value: SupplierSourceProvenance): SupplierSourceProvenance {
  return {
    ...value,
    workbook: { ...value.workbook },
    rawValues: { ...value.rawValues },
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

export function makeSupplierCatalogMappingKey(input: {
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SupplierSelectedOption[];
  readonly supplierOfferId: string;
  readonly supplierOfferVariantId: string;
}): string {
  return JSON.stringify({
    productId: input.productId,
    productSlug: input.productSlug,
    catalogVariantId: input.catalogVariantId,
    skuCode: input.skuCode,
    selectedOptions: [...input.selectedOptions].sort((left, right) => left.optionId.localeCompare(right.optionId)),
    supplierOfferId: input.supplierOfferId,
    supplierOfferVariantId: input.supplierOfferVariantId,
  });
}

export function supplierCandidateIdentityKey(input: SupplierCandidateIdentity): string {
  return `${input.supplierId}::${input.offerId}::${input.supplierOfferVariantId}`;
}

export function supplierSelectedOptionsSignature(value: readonly SupplierSelectedOption[]): string {
  return JSON.stringify([...value].sort((left, right) => left.optionId.localeCompare(right.optionId)));
}

export function sameSupplierSelectedOptions(
  left: readonly SupplierSelectedOption[],
  right: readonly SupplierSelectedOption[],
): boolean {
  return supplierSelectedOptionsSignature(left) === supplierSelectedOptionsSignature(right);
}

export function supplierProductionUnitKey(input: SupplierProductionUnitIdentity): string {
  return `${input.canonicalOrder.internalOrderId}::${input.orderItemId}`;
}

export function isSupplierOperatorAuthority(value: unknown): value is SupplierOperatorAuthority {
  if (!isRecord(value)) return false;
  return value.actorKind === "operator"
    && typeof value.actorContextId === "string"
    && /^[A-Za-z0-9_-]{8,200}$/.test(value.actorContextId);
}

export function validateSupplierProductionUnitIdentity(value: unknown): SupplierValidationResult<SupplierProductionUnitIdentity> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Production unit must be an object."));
  const issues: SupplierValidationIssue[] = [];
  const canonicalOrder = isRecord(value.canonicalOrder) ? value.canonicalOrder : null;
  if (!isIdentifier(canonicalOrder?.internalOrderId)) {
    issues.push(issue("$.canonicalOrder.internalOrderId", "invalid_format", "Canonical Order identity is invalid."));
  }
  if (!isLocalOrderPublicReference(canonicalOrder?.publicReference)) {
    issues.push(issue("$.canonicalOrder.publicReference", "invalid_format", "Canonical Order public reference is invalid."));
  }
  if (!isIdentifier(value.orderItemId)) issues.push(issue("$.orderItemId", "invalid_format", "Order item identity is invalid."));
  return issues.length > 0
    ? failure(...issues)
    : success({
        canonicalOrder: {
          internalOrderId: canonicalOrder?.internalOrderId as string,
          publicReference: canonicalOrder?.publicReference as string,
        },
        orderItemId: value.orderItemId as string,
      });
}

export function validateCanonicalSupplierSelection(value: unknown): SupplierValidationResult<CanonicalSupplierSelection> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Canonical Supplier selection must be an object."));
  const issues: SupplierValidationIssue[] = unknownFieldIssues(value, [
    "internalOrderId", "publicOrderReference", "orderItemId", "productId", "productSlug",
    "catalogVariantId", "skuCode", "selectedOptions", "fulfillmentType", "quantity",
  ]).map((entry) => issue(entry.path, "unknown_field", entry.message));
  if (!isIdentifier(value.internalOrderId)) issues.push(issue("$.internalOrderId", "invalid_format", "Canonical Order identity is invalid."));
  if (!isLocalOrderPublicReference(value.publicOrderReference)) issues.push(issue("$.publicOrderReference", "invalid_format", "Canonical Order public reference is invalid."));
  if (!isIdentifier(value.orderItemId)) issues.push(issue("$.orderItemId", "invalid_format", "Order item identity is invalid."));
  if (!isIdentifier(value.productId)) issues.push(issue("$.productId", "invalid_format", "Product identity is invalid."));
  if (!isSlug(value.productSlug)) issues.push(issue("$.productSlug", "invalid_format", "Product slug is invalid."));
  if (!isIdentifier(value.catalogVariantId)) issues.push(issue("$.catalogVariantId", "invalid_format", "Catalog Variant identity is invalid."));
  if (!isSkuCode(value.skuCode)) issues.push(issue("$.skuCode", "invalid_format", "SKU code is invalid."));
  const selectedOptions = parseSelectedOptions(value.selectedOptions, "$.selectedOptions");
  if (!selectedOptions.ok) issues.push(...selectedOptions.issues);
  if (!isSupplierFulfillmentType(value.fulfillmentType)) issues.push(issue("$.fulfillmentType", "invalid_value", "Fulfillment type is invalid."));
  if (!isNonNegativeInteger(value.quantity) || value.quantity < 1) issues.push(issue("$.quantity", "invalid_value", "Quantity must be a positive integer."));
  if (issues.length > 0 || !selectedOptions.ok) return failure(...issues);
  return success(deepFreeze({
    internalOrderId: value.internalOrderId as string,
    publicOrderReference: value.publicOrderReference as string,
    orderItemId: value.orderItemId as string,
    productId: value.productId as string,
    productSlug: value.productSlug as string,
    catalogVariantId: value.catalogVariantId as string,
    skuCode: value.skuCode as string,
    selectedOptions: selectedOptions.value.map((entry) => ({ ...entry })),
    fulfillmentType: value.fulfillmentType as SupplierFulfillmentType,
    quantity: value.quantity as number,
  }));
}

export function validateSupplierCandidateInput(value: unknown): SupplierValidationResult<SupplierCandidateInput> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier candidate input must be an object."));
  const issues = unknownFieldIssues(value, ["selection", "shanghaiWarehouseRequired"])
    .map((entry) => issue(entry.path, "unknown_field", entry.message));
  const selection = validateCanonicalSupplierSelection(value.selection);
  if (!selection.ok) issues.push(...selection.issues.map((entry) => ({ ...entry, path: `$.selection${entry.path.slice(1)}` })));
  if (typeof value.shanghaiWarehouseRequired !== "boolean") {
    issues.push(issue("$.shanghaiWarehouseRequired", "invalid_type", "Shanghai warehouse requirement must be boolean."));
  }
  if (issues.length > 0 || !selection.ok) return failure(...issues);
  return success({
    selection: selection.value,
    shanghaiWarehouseRequired: value.shanghaiWarehouseRequired as boolean,
  });
}

function validateMapping(value: unknown, path: string): SupplierValidationResult<SupplierCatalogMapping> {
  if (!isRecord(value)) return failure(issue(path, "invalid_type", "Catalog mapping must be an object."));
  const issues: SupplierValidationIssue[] = [];
  issues.push(...unknownFieldIssues(value, [
    "status", "productId", "productSlug", "catalogVariantId", "skuCode", "selectedOptions",
    "supplierOfferId", "supplierOfferVariantId", "mappingKey", "reason",
  ]).map((entry) => issue(`${path}${entry.path.slice(1)}`, "unknown_field", entry.message)));
  if (!isSupplierReviewStatus(value.status)) issues.push(issue(`${path}.status`, "invalid_value", "Catalog mapping review status is invalid."));
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) issues.push(issue(`${path}.reason`, "required", "Catalog mapping reason is required."));
  if (value.status === "approved") {
    if (!isIdentifier(value.productId)) issues.push(issue(`${path}.productId`, "required", "Approved mapping requires Product identity."));
    if (!isSlug(value.productSlug)) issues.push(issue(`${path}.productSlug`, "required", "Approved mapping requires Product slug."));
    if (!isIdentifier(value.catalogVariantId)) issues.push(issue(`${path}.catalogVariantId`, "required", "Approved mapping requires Catalog Variant identity."));
    if (!isSkuCode(value.skuCode)) issues.push(issue(`${path}.skuCode`, "required", "Approved mapping requires SKU code."));
    const selectedOptions = parseSelectedOptions(value.selectedOptions, `${path}.selectedOptions`);
    if (!selectedOptions.ok) issues.push(...selectedOptions.issues);
    if (!isIdentifier(value.supplierOfferId)) issues.push(issue(`${path}.supplierOfferId`, "required", "Approved mapping requires Supplier Offer identity."));
    if (!isIdentifier(value.supplierOfferVariantId)) issues.push(issue(`${path}.supplierOfferVariantId`, "required", "Approved mapping requires Supplier Offer Variant identity."));
    if (!isNonEmptyString(value.mappingKey, 300)) issues.push(issue(`${path}.mappingKey`, "required", "Approved mapping requires mapping key."));
  } else if (isSupplierReviewStatus(value.status)) {
    if (value.productId !== null) issues.push(issue(`${path}.productId`, "invalid_value", "Unresolved mapping cannot contain Product identity."));
    if (value.productSlug !== null) issues.push(issue(`${path}.productSlug`, "invalid_value", "Unresolved mapping cannot contain Product slug."));
    if (value.catalogVariantId !== null) issues.push(issue(`${path}.catalogVariantId`, "invalid_value", "Unresolved mapping cannot contain Catalog Variant identity."));
    if (value.skuCode !== null) issues.push(issue(`${path}.skuCode`, "invalid_value", "Unresolved mapping cannot contain SKU code."));
    if (value.selectedOptions !== null) issues.push(issue(`${path}.selectedOptions`, "invalid_value", "Unresolved mapping cannot contain selected options."));
    if (value.supplierOfferId !== null) issues.push(issue(`${path}.supplierOfferId`, "invalid_value", "Unresolved mapping cannot contain Supplier Offer identity."));
    if (value.supplierOfferVariantId !== null) issues.push(issue(`${path}.supplierOfferVariantId`, "invalid_value", "Unresolved mapping cannot contain Supplier Offer Variant identity."));
    if (value.mappingKey !== null) issues.push(issue(`${path}.mappingKey`, "invalid_value", "Unresolved mapping cannot contain mapping key."));
  }
  if (issues.length > 0) return failure(...issues);
  return success({
    status: value.status as SupplierReviewStatus,
    productId: value.productId as string | null,
    productSlug: value.productSlug as string | null,
    catalogVariantId: value.catalogVariantId as string | null,
    skuCode: value.skuCode as string | null,
    selectedOptions: value.selectedOptions as readonly SupplierSelectedOption[] | null,
    supplierOfferId: value.supplierOfferId as string | null,
    supplierOfferVariantId: value.supplierOfferVariantId as string | null,
    mappingKey: value.mappingKey as string | null,
    reason: value.reason as string,
  });
}

export function validateSupplier(value: unknown): SupplierValidationResult<Supplier> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier must be an object."));
  const issues: SupplierValidationIssue[] = unknownFieldIssues(value, [
    "kind", "supplierId", "displayName", "platform", "sourceUrl", "status",
    "canShipToShanghaiWarehouse", "videoCapability", "returnReworkPolicy", "notes", "provenance",
  ]).map((entry) => issue(entry.path, "unknown_field", entry.message));
  if (value.kind !== "supplier") issues.push(issue("$.kind", "invalid_value", "Supplier kind is invalid."));
  if (!isIdentifier(value.supplierId)) issues.push(issue("$.supplierId", "invalid_format", "Supplier identity is invalid."));
  if (!isNonEmptyString(value.displayName, 240)) issues.push(issue("$.displayName", "required", "Supplier display name is required."));
  if (!isSupplierPlatform(value.platform)) issues.push(issue("$.platform", "invalid_value", "Supplier platform is invalid."));
  if (value.sourceUrl !== null && typeof value.sourceUrl !== "string") issues.push(issue("$.sourceUrl", "invalid_type", "Supplier source URL must be string or null."));
  if (!isSupplierOperationalStatus(value.status)) issues.push(issue("$.status", "invalid_value", "Supplier status is invalid."));
  if (value.canShipToShanghaiWarehouse !== null && typeof value.canShipToShanghaiWarehouse !== "boolean") issues.push(issue("$.canShipToShanghaiWarehouse", "invalid_type", "Warehouse eligibility must be boolean or null."));
  if (value.videoCapability !== "available" && value.videoCapability !== "paid" && value.videoCapability !== "unknown") issues.push(issue("$.videoCapability", "invalid_value", "Supplier video capability is invalid."));
  if (value.returnReworkPolicy !== null && typeof value.returnReworkPolicy !== "string") issues.push(issue("$.returnReworkPolicy", "invalid_type", "Return/rework policy must be string or null."));
  if (value.notes !== null && typeof value.notes !== "string") issues.push(issue("$.notes", "invalid_type", "Supplier notes must be string or null."));
  if (!Array.isArray(value.provenance)) issues.push(issue("$.provenance", "invalid_type", "Supplier provenance must be an array."));
  if (issues.length > 0) return failure(...issues);
  return success(value as unknown as Supplier);
}

export function validateSupplierOffer(value: unknown): SupplierValidationResult<SupplierOffer> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier offer must be an object."));
  const issues: SupplierValidationIssue[] = unknownFieldIssues(value, [
    "kind", "offerId", "supplierId", "sourceProductLabel", "fulfillmentType", "status",
    "catalogMapping", "minProductionBusinessDays", "maxProductionBusinessDays",
    "canShipToShanghaiWarehouse", "sourcePackagedWeightText", "notes", "provenance",
  ]).map((entry) => issue(entry.path, "unknown_field", entry.message));
  if (value.kind !== "supplier_offer") issues.push(issue("$.kind", "invalid_value", "Supplier offer kind is invalid."));
  if (!isIdentifier(value.offerId)) issues.push(issue("$.offerId", "invalid_format", "Offer identity is invalid."));
  if (!isIdentifier(value.supplierId)) issues.push(issue("$.supplierId", "invalid_format", "Offer supplier identity is invalid."));
  if (!isNonEmptyString(value.sourceProductLabel, 240)) issues.push(issue("$.sourceProductLabel", "required", "Source product label is required."));
  if (!isSupplierFulfillmentType(value.fulfillmentType)) issues.push(issue("$.fulfillmentType", "invalid_value", "Offer fulfillment type is invalid."));
  if (!isSupplierOperationalStatus(value.status)) issues.push(issue("$.status", "invalid_value", "Offer status is invalid."));
  const mapping = validateMapping(value.catalogMapping, "$.catalogMapping");
  if (!mapping.ok) issues.push(...mapping.issues);
  if (mapping.ok && mapping.value.status === "approved" && mapping.value.supplierOfferId !== value.offerId) {
    issues.push(issue("$.catalogMapping.supplierOfferId", "ownership", "Approved mapping must belong to this Supplier Offer."));
  }
  if (!isProductionDays(value.minProductionBusinessDays)) issues.push(issue("$.minProductionBusinessDays", "invalid_value", "Minimum production days are invalid."));
  if (!isProductionDays(value.maxProductionBusinessDays)) issues.push(issue("$.maxProductionBusinessDays", "invalid_value", "Maximum production days are invalid."));
  if (isNonNegativeInteger(value.minProductionBusinessDays) && isNonNegativeInteger(value.maxProductionBusinessDays) && value.minProductionBusinessDays > value.maxProductionBusinessDays) issues.push(issue("$.minProductionBusinessDays", "invalid_value", "Minimum production days cannot exceed maximum."));
  if (value.canShipToShanghaiWarehouse !== null && typeof value.canShipToShanghaiWarehouse !== "boolean") issues.push(issue("$.canShipToShanghaiWarehouse", "invalid_type", "Warehouse eligibility must be boolean or null."));
  if (value.sourcePackagedWeightText !== null && typeof value.sourcePackagedWeightText !== "string") issues.push(issue("$.sourcePackagedWeightText", "invalid_type", "Source packaged weight must be string or null."));
  if (value.notes !== null && typeof value.notes !== "string") issues.push(issue("$.notes", "invalid_type", "Offer notes must be string or null."));
  if (!Array.isArray(value.provenance)) issues.push(issue("$.provenance", "invalid_type", "Offer provenance must be an array."));
  if (issues.length > 0 || !mapping.ok) return failure(...issues);
  return success(value as unknown as SupplierOffer);
}

export function validateSupplierOfferVariant(value: unknown): SupplierValidationResult<SupplierOfferVariant> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier offer variant must be an object."));
  const issues: SupplierValidationIssue[] = unknownFieldIssues(value, [
    "kind", "supplierOfferVariantId", "offerId", "supplierSpecificationKey", "label", "status", "supplierCostCents",
    "currency", "pricingBasis", "priceUnit", "optionSurchargeCents", "packagedWeightGrams",
    "packagedWeightRawText", "packagedWeightReviewStatus", "minProductionBusinessDays",
    "maxProductionBusinessDays", "dimensionsCm", "rawSourceValue", "reviewStatus", "provenance",
  ]).map((entry) => issue(entry.path, "unknown_field", entry.message));
  if (value.kind !== "supplier_offer_variant") issues.push(issue("$.kind", "invalid_value", "Supplier offer variant kind is invalid."));
  if (!isIdentifier(value.supplierOfferVariantId)) issues.push(issue("$.supplierOfferVariantId", "invalid_format", "Supplier Offer Variant identity is invalid."));
  if (!isIdentifier(value.offerId)) issues.push(issue("$.offerId", "invalid_format", "Variant offer identity is invalid."));
  if (!isSpecificationKey(value.supplierSpecificationKey)) issues.push(issue("$.supplierSpecificationKey", "invalid_format", "Supplier specification key is invalid."));
  if (!isNonEmptyString(value.label, 240)) issues.push(issue("$.label", "required", "Variant label is required."));
  if (!isSupplierOperationalStatus(value.status)) issues.push(issue("$.status", "invalid_value", "Variant status is invalid."));
  if (value.supplierCostCents !== null && !isNonNegativeInteger(value.supplierCostCents)) issues.push(issue("$.supplierCostCents", "invalid_value", "Supplier cost must be non-negative or null."));
  if (!isSupplierCurrency(value.currency)) issues.push(issue("$.currency", "invalid_value", "Supplier currency is invalid."));
  if (!isPricingBasis(value.pricingBasis)) issues.push(issue("$.pricingBasis", "invalid_value", "Pricing basis is invalid."));
  if (!isPriceUnit(value.priceUnit)) issues.push(issue("$.priceUnit", "invalid_value", "Price unit is invalid."));
  if (value.optionSurchargeCents !== null && !isNonNegativeInteger(value.optionSurchargeCents)) issues.push(issue("$.optionSurchargeCents", "invalid_value", "Option surcharge must be non-negative or null."));
  if (value.packagedWeightGrams !== null && !isNonNegativeInteger(value.packagedWeightGrams)) issues.push(issue("$.packagedWeightGrams", "invalid_value", "Packaged weight must be non-negative or null."));
  if (value.packagedWeightRawText !== null && typeof value.packagedWeightRawText !== "string") issues.push(issue("$.packagedWeightRawText", "invalid_type", "Packaged weight source text must be string or null."));
  if (!isSupplierReviewStatus(value.packagedWeightReviewStatus)) issues.push(issue("$.packagedWeightReviewStatus", "invalid_value", "Packaged weight review status is invalid."));
  if (!isProductionDays(value.minProductionBusinessDays)) issues.push(issue("$.minProductionBusinessDays", "invalid_value", "Minimum production days are invalid."));
  if (!isProductionDays(value.maxProductionBusinessDays)) issues.push(issue("$.maxProductionBusinessDays", "invalid_value", "Maximum production days are invalid."));
  if (isNonNegativeInteger(value.minProductionBusinessDays) && isNonNegativeInteger(value.maxProductionBusinessDays) && value.minProductionBusinessDays > value.maxProductionBusinessDays) issues.push(issue("$.minProductionBusinessDays", "invalid_value", "Minimum production days cannot exceed maximum."));
  if (value.dimensionsCm !== null) issues.push(issue("$.dimensionsCm", "invalid_value", "Dimensions must remain null when not source-backed."));
  if (!isNonEmptyString(value.rawSourceValue, 500)) issues.push(issue("$.rawSourceValue", "required", "Raw source value is required."));
  if (!isSupplierReviewStatus(value.reviewStatus)) issues.push(issue("$.reviewStatus", "invalid_value", "Variant review status is invalid."));
  if (!Array.isArray(value.provenance)) issues.push(issue("$.provenance", "invalid_type", "Variant provenance must be an array."));
  if (issues.length > 0) return failure(...issues);
  return success(value as unknown as SupplierOfferVariant);
}

export function validateSupplierDomainDataset(value: unknown): SupplierValidationResult<SupplierDomainDataset> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier domain dataset must be an object."));
  const issues: SupplierValidationIssue[] = [];
  if (!Array.isArray(value.suppliers)) issues.push(issue("$.suppliers", "invalid_type", "Suppliers must be an array."));
  if (!Array.isArray(value.offers)) issues.push(issue("$.offers", "invalid_type", "Offers must be an array."));
  if (!Array.isArray(value.variants)) issues.push(issue("$.variants", "invalid_type", "Variants must be an array."));
  if (issues.length > 0) return failure(...issues);
  const suppliers = value.suppliers as readonly unknown[];
  const offers = value.offers as readonly unknown[];
  const variants = value.variants as readonly unknown[];
  const supplierIds = new Set<string>();
  const offerIds = new Set<string>();
  const variantIds = new Set<string>();
  const parsedSuppliers: Supplier[] = [];
  const parsedOffers: SupplierOffer[] = [];
  const parsedVariants: SupplierOfferVariant[] = [];
  suppliers.forEach((entry, index) => {
    const parsed = validateSupplier(entry);
    if (!parsed.ok) issues.push(...parsed.issues.map((current) => ({ ...current, path: `$.suppliers[${index}]${current.path.slice(1)}` })));
    else if (supplierIds.has(parsed.value.supplierId)) issues.push(issue(`$.suppliers[${index}].supplierId`, "duplicate", "Supplier identity is duplicated."));
    else { supplierIds.add(parsed.value.supplierId); parsedSuppliers.push(parsed.value); }
  });
  offers.forEach((entry, index) => {
    const parsed = validateSupplierOffer(entry);
    if (!parsed.ok) issues.push(...parsed.issues.map((current) => ({ ...current, path: `$.offers[${index}]${current.path.slice(1)}` })));
    else if (offerIds.has(parsed.value.offerId)) issues.push(issue(`$.offers[${index}].offerId`, "duplicate", "Offer identity is duplicated."));
    else { offerIds.add(parsed.value.offerId); parsedOffers.push(parsed.value); }
  });
  variants.forEach((entry, index) => {
    const parsed = validateSupplierOfferVariant(entry);
    if (!parsed.ok) issues.push(...parsed.issues.map((current) => ({ ...current, path: `$.variants[${index}]${current.path.slice(1)}` })));
    else if (variantIds.has(parsed.value.supplierOfferVariantId)) issues.push(issue(`$.variants[${index}].supplierOfferVariantId`, "duplicate", "Supplier Offer Variant identity is duplicated."));
    else { variantIds.add(parsed.value.supplierOfferVariantId); parsedVariants.push(parsed.value); }
  });
  const supplierById = new Set(parsedSuppliers.map((entry) => entry.supplierId));
  const offerById = new Set(parsedOffers.map((entry) => entry.offerId));
  parsedOffers.forEach((entry) => { if (!supplierById.has(entry.supplierId)) issues.push(issue(`$.offers.${entry.offerId}.supplierId`, "ownership", "Offer references an unknown Supplier.")); });
  parsedVariants.forEach((entry) => { if (!offerById.has(entry.offerId)) issues.push(issue(`$.variants.${entry.supplierOfferVariantId}.offerId`, "ownership", "Variant references an unknown SupplierOffer.")); });
  return issues.length > 0
    ? failure(...issues)
    : success(deepFreeze({ suppliers: parsedSuppliers, offers: parsedOffers, variants: parsedVariants }));
}

export function normalizeSupplierFixture(source: LocalSupplierFixture): Supplier {
  return deepFreeze({
    kind: "supplier" as const,
    supplierId: source.supplierId,
    displayName: source.displayName,
    platform: source.platform,
    sourceUrl: source.sourceUrl,
    status: source.status,
    canShipToShanghaiWarehouse: source.canShipToShanghaiWarehouse,
    videoCapability: source.videoCapability,
    returnReworkPolicy: source.returnReworkPolicy,
    notes: source.notes,
    provenance: source.provenance.map(cloneProvenance),
  });
}

function sourceActiveStatus(value: boolean | null): SupplierOperationalStatus {
  return value === true ? "active" : value === false ? "inactive" : "unknown";
}

export function normalizeSupplierOfferFixture(source: SupplierOfferFixture): SupplierOffer {
  const mapping = source.catalogMapping;
  return deepFreeze({
    kind: "supplier_offer" as const,
    offerId: source.offerId,
    supplierId: source.supplierId,
    sourceProductLabel: source.sourceProductLabel,
    fulfillmentType: source.fulfillmentType,
    status: sourceActiveStatus(source.isActive),
    catalogMapping: {
      status: mapping.status,
      productId: mapping.productId ?? null,
      productSlug: mapping.productSlug,
      catalogVariantId: mapping.catalogVariantId ?? null,
      skuCode: mapping.skuCode,
      selectedOptions: mapping.selectedOptions ?? null,
      supplierOfferId: mapping.supplierOfferId ?? null,
      supplierOfferVariantId: mapping.supplierOfferVariantId ?? null,
      mappingKey: mapping.mappingKey,
      reason: mapping.reason,
    },
    minProductionBusinessDays: source.minProductionBusinessDays,
    maxProductionBusinessDays: source.maxProductionBusinessDays,
    canShipToShanghaiWarehouse: source.canShipToShanghaiWarehouse,
    sourcePackagedWeightText: source.sourcePackagedWeightText,
    notes: source.notes,
    provenance: source.provenance.map(cloneProvenance),
  });
}

export function normalizeSupplierOfferVariantFixture(source: SupplierOfferVariantFixture): SupplierOfferVariant {
  const quoted = source.supplierQuotedAmount;
  return deepFreeze({
    kind: "supplier_offer_variant" as const,
    supplierOfferVariantId: source.variantId,
    offerId: source.offerId,
    supplierSpecificationKey: source.variantKey,
    label: source.label,
    // The Batch A source contract has no independent variant active flag;
    // unknown is preserved and therefore cannot pass eligible matching.
    status: "unknown" as const,
    supplierCostCents: quoted.amountCents,
    currency: quoted.currency,
    pricingBasis: quoted.pricingBasis,
    priceUnit: quoted.priceUnit,
    optionSurchargeCents: source.optionSurchargeCents,
    packagedWeightGrams: source.packagedWeightGrams,
    packagedWeightRawText: source.packagedWeightRawText,
    packagedWeightReviewStatus: source.packagedWeightReviewStatus,
    minProductionBusinessDays: source.minProductionBusinessDays,
    maxProductionBusinessDays: source.maxProductionBusinessDays,
    dimensionsCm: null,
    rawSourceValue: source.sourceVariantText,
    reviewStatus: quoted.reviewStatus,
    provenance: source.provenance.map(cloneProvenance),
  });
}

export function normalizeLocalSupplierSourceFixtures(source: SupplierSourceFixtureDataset): SupplierValidationResult<SupplierDomainDataset> {
  return validateSupplierDomainDataset({
    suppliers: source.suppliers.map(normalizeSupplierFixture),
    offers: source.offers.map(normalizeSupplierOfferFixture),
    variants: source.variants.map(normalizeSupplierOfferVariantFixture),
  });
}

function sameProductionUnit(left: SupplierProductionUnitIdentity, right: SupplierProductionUnitIdentity): boolean {
  return left.canonicalOrder.internalOrderId === right.canonicalOrder.internalOrderId
    && left.canonicalOrder.publicReference === right.canonicalOrder.publicReference
    && left.orderItemId === right.orderItemId;
}

function sameCandidateIdentity(left: SupplierCandidateIdentity, right: SupplierCandidateIdentity): boolean {
  return left.supplierId === right.supplierId && left.offerId === right.offerId && left.supplierOfferVariantId === right.supplierOfferVariantId;
}

function candidateFrom(
  input: SupplierCandidateInput,
  supplier: Supplier,
  offer: SupplierOffer,
  variant: SupplierOfferVariant,
): SupplierCandidate {
  return deepFreeze({
    kind: "supplier_candidate" as const,
    supplierId: supplier.supplierId,
    offerId: offer.offerId,
    supplierOfferVariantId: variant.supplierOfferVariantId,
    productionUnit: {
      canonicalOrder: {
        internalOrderId: input.selection.internalOrderId,
        publicReference: input.selection.publicOrderReference,
      },
      orderItemId: input.selection.orderItemId,
    },
    selection: input.selection,
    productId: input.selection.productId,
    productSlug: input.selection.productSlug,
    catalogVariantId: input.selection.catalogVariantId,
    skuCode: input.selection.skuCode,
    selectedOptions: input.selection.selectedOptions.map((entry) => ({ ...entry })),
    quantity: input.selection.quantity,
    fulfillmentType: input.selection.fulfillmentType,
    supplierSpecificationKey: variant.supplierSpecificationKey,
    supplierDisplayName: supplier.displayName,
    sourceProductLabel: offer.sourceProductLabel,
    supplierCostCents: variant.supplierCostCents,
    currency: variant.currency,
    pricingBasis: variant.pricingBasis,
    priceUnit: variant.priceUnit,
    optionSurchargeCents: variant.optionSurchargeCents,
    packagedWeightGrams: variant.packagedWeightGrams,
    packagedWeightRawText: variant.packagedWeightRawText,
    packagedWeightReviewStatus: variant.packagedWeightReviewStatus,
    minProductionBusinessDays: variant.minProductionBusinessDays ?? offer.minProductionBusinessDays,
    maxProductionBusinessDays: variant.maxProductionBusinessDays ?? offer.maxProductionBusinessDays,
    canShipToShanghaiWarehouse: offer.canShipToShanghaiWarehouse,
    reviewStatus: variant.reviewStatus,
    provenance: [
      ...supplier.provenance.map(cloneProvenance),
      ...offer.provenance.map(cloneProvenance),
      ...variant.provenance.map(cloneProvenance),
    ],
  });
}

export function matchSupplierCandidates(
  inputValue: unknown,
  datasetValue: unknown,
): SupplierCandidateMatchResult {
  const input = validateSupplierCandidateInput(inputValue);
  if (!input.ok) return { status: "invalid", issues: input.issues };
  const dataset = validateSupplierDomainDataset(datasetValue);
  if (!dataset.ok) return { status: "invalid", issues: dataset.issues };
  if (input.value.selection.fulfillmentType === "digital") {
    return {
      status: "no_eligible_candidates",
      input: input.value,
      candidates: [],
      issues: [issue("$.selection.fulfillmentType", "unsupported", "Supplier operations cover physical fulfillment only.")],
    };
  }

  const supplierById = new Map(dataset.value.suppliers.map((entry) => [entry.supplierId, entry]));
  const variantsByOfferId = new Map<string, SupplierOfferVariant[]>();
  dataset.value.variants.forEach((entry) => {
    const variants = variantsByOfferId.get(entry.offerId) ?? [];
    variants.push(entry);
    variantsByOfferId.set(entry.offerId, variants);
  });
  const candidates: SupplierCandidate[] = [];
  const reviewIssues: SupplierValidationIssue[] = [];
  let unresolvedMappingSeen = false;

  for (const offer of dataset.value.offers) {
    if (offer.catalogMapping.status !== "approved") {
      unresolvedMappingSeen = true;
      continue;
    }
    const selection = input.value.selection;
    const mapping = offer.catalogMapping;
    if (mapping.productId !== selection.productId
      || mapping.productSlug !== selection.productSlug
      || mapping.catalogVariantId !== selection.catalogVariantId
      || mapping.skuCode !== selection.skuCode
      || mapping.supplierOfferId !== offer.offerId
      || !sameSupplierSelectedOptions(mapping.selectedOptions ?? [], selection.selectedOptions)) continue;
    const variant = (variantsByOfferId.get(offer.offerId) ?? []).find((candidate) =>
      candidate.supplierOfferVariantId === mapping.supplierOfferVariantId,
    );
    if (!variant) {
      reviewIssues.push(issue("$.catalogMapping.supplierOfferVariantId", "ownership", "Approved mapping references an unavailable Supplier Offer Variant."));
      continue;
    }
    const expectedMappingKey = makeSupplierCatalogMappingKey({
      productId: selection.productId,
      productSlug: selection.productSlug,
      catalogVariantId: selection.catalogVariantId,
      skuCode: selection.skuCode,
      selectedOptions: selection.selectedOptions,
      supplierOfferId: offer.offerId,
      supplierOfferVariantId: variant.supplierOfferVariantId,
    });
    if (mapping.mappingKey !== expectedMappingKey) {
      reviewIssues.push(issue("$.catalogMapping.mappingKey", "conflict", "Approved mapping key does not match its exact identities."));
      continue;
    }
    const supplier = supplierById.get(offer.supplierId);
    if (!supplier) {
      reviewIssues.push(issue("$.supplierId", "ownership", "Offer Supplier identity is unavailable."));
      continue;
    }
    if (supplier.status !== "active") {
      reviewIssues.push(issue("$.supplierId", supplier.status === "unknown" ? "review_required" : "inactive", "Supplier operational eligibility is not approved."));
      continue;
    }
    if (offer.status !== "active") {
      reviewIssues.push(issue("$.offerId", offer.status === "unknown" ? "review_required" : "inactive", "Supplier offer is not active."));
      continue;
    }
    if (offer.fulfillmentType !== "physical") {
      reviewIssues.push(issue("$.fulfillmentType", "unsupported", "Supplier candidate must be physical."));
      continue;
    }
    if (input.value.shanghaiWarehouseRequired
      && (supplier.canShipToShanghaiWarehouse !== true || offer.canShipToShanghaiWarehouse !== true)) {
      reviewIssues.push(issue("$.warehouse", supplier.canShipToShanghaiWarehouse === false || offer.canShipToShanghaiWarehouse === false ? "warehouse_ineligible" : "review_required", "Shanghai warehouse eligibility is not explicitly supported."));
      continue;
    }
    if (variant.status !== "active") {
      reviewIssues.push(issue("$.supplierOfferVariantId", variant.status === "unknown" ? "review_required" : "inactive", "Supplier variant is not active."));
      continue;
    }
    if (variant.reviewStatus !== "approved") {
      reviewIssues.push(issue("$.supplierOfferVariantId", "review_required", "Supplier variant evidence is not approved."));
      continue;
    }
    candidates.push(candidateFrom(input.value, supplier, offer, variant));
  }
  if (candidates.length > 0) return { status: "eligible", input: input.value, candidates };
  if (reviewIssues.length > 0 || unresolvedMappingSeen) {
    return {
      status: "review_required",
      input: input.value,
      candidates: [],
      issues: reviewIssues.length > 0 ? reviewIssues : [issue("$.catalogMapping", "missing_mapping", "No approved explicit Product/SKU/specification mapping exists.")],
    };
  }
  return {
    status: "no_eligible_candidates",
    input: input.value,
    candidates: [],
    issues: [issue("$.candidate", "unavailable", "No active exact supplier candidate is available.")],
  };
}

export function validateSupplierAssignmentRequest(value: unknown): SupplierValidationResult<SupplierAssignmentRequest> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Supplier assignment request must be an object."));
  const issues: SupplierValidationIssue[] = [];
  if (typeof value.assignmentActionId !== "string" || !ACTION_ID_PATTERN.test(value.assignmentActionId)) issues.push(issue("$.assignmentActionId", "invalid_format", "Assignment action identity is invalid."));
  const productionUnit = validateSupplierProductionUnitIdentity(value.productionUnit);
  if (!productionUnit.ok) issues.push(...productionUnit.issues);
  if (!isSupplierOperatorAuthority(value.operatorAuthority)) issues.push(issue("$.operatorAuthority", "unauthorized", "Separate operator authority is required."));
  if (!isRecord(value.selectedCandidate)) issues.push(issue("$.selectedCandidate", "invalid_type", "Selected candidate identity is required."));
  else {
    if (!isIdentifier(value.selectedCandidate.supplierId)) issues.push(issue("$.selectedCandidate.supplierId", "invalid_format", "Selected Supplier identity is invalid."));
    if (!isIdentifier(value.selectedCandidate.offerId)) issues.push(issue("$.selectedCandidate.offerId", "invalid_format", "Selected offer identity is invalid."));
    if (!isIdentifier(value.selectedCandidate.supplierOfferVariantId)) issues.push(issue("$.selectedCandidate.supplierOfferVariantId", "invalid_format", "Selected Supplier Offer Variant identity is invalid."));
  }
  if (!isRecord(value.candidateResult) || !["eligible", "no_eligible_candidates", "review_required", "invalid"].includes(value.candidateResult.status as string)) {
    issues.push(issue("$.candidateResult", "invalid_type", "Candidate result is invalid."));
  }
  if (issues.length > 0 || !productionUnit.ok || !isRecord(value.selectedCandidate) || !isRecord(value.candidateResult)) return failure(...issues);
  return success({
    assignmentActionId: value.assignmentActionId as string,
    productionUnit: productionUnit.value,
    operatorAuthority: value.operatorAuthority as SupplierOperatorAuthority,
    candidateResult: value.candidateResult as SupplierCandidateMatchResult,
    selectedCandidate: {
      supplierId: value.selectedCandidate.supplierId as string,
      offerId: value.selectedCandidate.offerId as string,
      supplierOfferVariantId: value.selectedCandidate.supplierOfferVariantId as string,
    },
  });
}

export function buildSupplierAssignmentFromCandidate(
  assignmentId: string,
  input: SupplierAssignmentRequest,
  candidate: SupplierCandidate,
  assignedAt: string,
): SupplierAssignment {
  return deepFreeze({
    kind: "supplier_assignment" as const,
    assignmentId,
    assignmentActionId: input.assignmentActionId,
    productionUnit: {
      canonicalOrder: { ...input.productionUnit.canonicalOrder },
      orderItemId: input.productionUnit.orderItemId,
    },
    snapshot: {
      productId: candidate.productId,
      productSlug: candidate.productSlug,
      catalogVariantId: candidate.catalogVariantId,
      skuCode: candidate.skuCode,
      selectedOptions: candidate.selectedOptions.map((entry) => ({ ...entry })),
      supplierId: candidate.supplierId,
      offerId: candidate.offerId,
      supplierOfferVariantId: candidate.supplierOfferVariantId,
      supplierSpecificationKey: candidate.supplierSpecificationKey,
      supplierCostCents: candidate.supplierCostCents,
      currency: candidate.currency,
      pricingBasis: candidate.pricingBasis,
      priceUnit: candidate.priceUnit,
      optionSurchargeCents: candidate.optionSurchargeCents,
      packagedWeightGrams: candidate.packagedWeightGrams,
      packagedWeightRawText: candidate.packagedWeightRawText,
      packagedWeightReviewStatus: candidate.packagedWeightReviewStatus,
      minProductionBusinessDays: candidate.minProductionBusinessDays,
      maxProductionBusinessDays: candidate.maxProductionBusinessDays,
      canShipToShanghaiWarehouse: candidate.canShipToShanghaiWarehouse,
      reviewStatus: candidate.reviewStatus,
      assignedAt,
      provenance: candidate.provenance.map(cloneProvenance),
    },
    assignedByActorContextId: input.operatorAuthority.actorContextId,
  });
}

export function isSupplierAssignmentActionId(value: unknown): value is string {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value);
}

export function sameSupplierProductionUnit(left: SupplierProductionUnitIdentity, right: SupplierProductionUnitIdentity): boolean {
  return sameProductionUnit(left, right);
}

export function sameSupplierCandidateIdentity(left: SupplierCandidateIdentity, right: SupplierCandidateIdentity): boolean {
  return sameCandidateIdentity(left, right);
}

export function supplierAssignmentIssue(code: SupplierValidationCode, message: string): SupplierValidationIssue {
  return issue("$", code, message);
}
