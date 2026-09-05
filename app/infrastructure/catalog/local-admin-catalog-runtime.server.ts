import type {
  ProductAssetWriteRepository,
  ProductAssetWriteResult,
} from "../../application/admin-product-assets.ts";
import type {
  ProductFulfillmentWriteRepository,
  ProductFulfillmentWriteResult,
} from "../../application/admin-product-fulfillment.ts";
import type {
  CatalogLifecycleIntent,
  CatalogLifecycleMutationValue,
  CatalogLifecycleRejectionReason,
  CatalogLifecycleWriteRepository,
  CatalogLifecycleWriteResult,
} from "../../application/admin-catalog-lifecycle.ts";
import type {
  ProductSkuGraph,
  ProductSkuGraphWriteRepository,
} from "../../application/admin-sku-graph.ts";
import {
  CatalogRepositoryService,
  type CatalogAdminCommandRepository,
  type CatalogAdminCommandResult,
  type CatalogAdminReadRepository,
  type CatalogDataSource,
  type CatalogRepositoryResult,
} from "../../application/catalog-repository.ts";
import {
  catalogGraphForProduct,
  sortCatalogDataSet,
  validateCatalogDataSet,
  type CatalogDataSet,
} from "../../application/catalog-data-set.ts";
import { evaluatePublicEligibility } from "../../domain/catalog/eligibility.ts";
import {
  parseCatalogProduct,
  parseCategory,
  parseProductAsset,
  parseProductFulfillmentConfig,
  parseProductOption,
  parseProductOptionValue,
  parseProductVariant,
  validateProductFulfillmentConfig,
  validateVariantCombinations,
  type CatalogProduct,
  type Category,
  type CatalogValidationIssue,
  type ProductAsset,
  type ProductFulfillmentConfig,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "../../domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "./development-catalog-fixtures.ts";
type ParsedEntity<T> = { ok: true; value: T } | { ok: false; issues: readonly CatalogValidationIssue[] };

function cloneCategory(category: Category): Category {
  return { ...category, seo: { ...category.seo } };
}

function cloneProduct(product: CatalogProduct): CatalogProduct {
  return { ...product, seo: { ...product.seo } };
}

function cloneOption(option: ProductOption): ProductOption {
  return { ...option };
}

function cloneOptionValue(value: ProductOptionValue): ProductOptionValue {
  return { ...value };
}

function cloneVariant(variant: ProductVariant): ProductVariant {
  return {
    ...variant,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
  };
}

function cloneAsset(asset: ProductAsset): ProductAsset {
  return {
    ...asset,
    source: { ...asset.source },
  };
}

function cloneFulfillmentConfig(config: ProductFulfillmentConfig): ProductFulfillmentConfig {
  return { ...config, leadTime: { ...config.leadTime } };
}

function cloneCatalogDataSet(dataSet: CatalogDataSet): CatalogDataSet {
  return {
    categories: dataSet.categories.map(cloneCategory),
    products: dataSet.products.map(cloneProduct),
    options: dataSet.options.map(cloneOption),
    optionValues: dataSet.optionValues.map(cloneOptionValue),
    variants: dataSet.variants.map(cloneVariant),
    assets: dataSet.assets.map(cloneAsset),
    fulfillmentConfigs: dataSet.fulfillmentConfigs.map(cloneFulfillmentConfig),
  };
}

function replaceById<T extends { id: string }>(values: readonly T[], candidate: T): T[] {
  return values.some((value) => value.id === candidate.id)
    ? values.map((value) => value.id === candidate.id ? candidate : value)
    : [...values, candidate];
}

function issue(path: string, code: CatalogValidationIssue["code"], message: string): CatalogValidationIssue {
  return { path, code, message };
}

function invalidConfiguration<T>(issues: readonly CatalogValidationIssue[]): CatalogAdminCommandResult<T> {
  return { status: "invalid_configuration", issues };
}

function parseResult<T>(parsed: ParsedEntity<T>):
  | { status: "parsed"; value: T }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] } {
  return parsed.ok
    ? { status: "parsed", value: parsed.value }
    : { status: "invalid_configuration", issues: parsed.issues };
}

function catalogCommit<T>(
  state: LocalAdminCatalogState,
  candidate: CatalogDataSet,
  value: T,
  cloneValue: (value: T) => T,
): CatalogAdminCommandResult<T> {
  const validation = state.commitCatalog(candidate);
  return validation.ok
    ? { status: "applied", value: cloneValue(value) }
    : invalidConfiguration(validation.issues);
}

function sameAsset(left: ProductAsset, right: ProductAsset): boolean {
  return left.id === right.id
    && left.productId === right.productId
    && left.variantId === right.variantId
    && left.mediaType === right.mediaType
    && left.role === right.role
    && left.position === right.position
    && left.altText === right.altText
    && left.title === right.title
    && left.width === right.width
    && left.height === right.height
    && left.visibility === right.visibility
    && left.source.kind === right.source.kind
    && left.source.value === right.source.value;
}

function sameFulfillmentConfig(
  left: ProductFulfillmentConfig,
  right: ProductFulfillmentConfig,
): boolean {
  return left.id === right.id
    && left.productId === right.productId
    && left.fulfillmentType === right.fulfillmentType
    && left.requiresShipping === right.requiresShipping
    && left.productionMode === right.productionMode
    && left.leadTime.minBusinessDays === right.leadTime.minBusinessDays
    && left.leadTime.maxBusinessDays === right.leadTime.maxBusinessDays;
}

export interface LocalAdminSharedCapabilityState {
  resetForTest?: () => void;
}

export interface LocalAdminCatalogStateOptions {
  readonly catalog?: CatalogDataSet;
  readonly sharedCapabilityState?: LocalAdminSharedCapabilityState;
}

/**
 * One development/test-only Catalog state graph. The optional shared capability
 * slot is intentionally opaque: capability-specific adapters may attach their
 * own resettable state without making this Catalog module depend on them.
 */
export class LocalAdminCatalogState {
  private readonly initialCatalog: CatalogDataSet;
  private catalog: CatalogDataSet;
  private sharedCapabilityState: LocalAdminSharedCapabilityState | undefined;

  constructor(options: LocalAdminCatalogStateOptions = {}) {
    this.initialCatalog = cloneCatalogDataSet(options.catalog ?? createDevelopmentCatalogFixtures());
    this.catalog = cloneCatalogDataSet(this.initialCatalog);
    this.sharedCapabilityState = options.sharedCapabilityState;
  }

  snapshotCatalog(): CatalogDataSet {
    return cloneCatalogDataSet(this.catalog);
  }

  commitCatalog(candidate: CatalogDataSet): { ok: true; value: true } | { ok: false; issues: readonly CatalogValidationIssue[] } {
    const validation = validateCatalogDataSet(candidate);
    if (!validation.ok) return validation;
    this.catalog = sortCatalogDataSet(cloneCatalogDataSet(candidate));
    return { ok: true, value: true };
  }

  /** Test-only reset seam; there is intentionally no HTTP reset endpoint. */
  resetForTest(): void {
    this.catalog = cloneCatalogDataSet(this.initialCatalog);
    this.sharedCapabilityState?.resetForTest?.();
  }

  /** Test-only injection seam used for deterministic invalid-graph cases. */
  injectCatalogForTest(catalog: CatalogDataSet): void {
    this.catalog = cloneCatalogDataSet(catalog);
  }

  getSharedCapabilityState<T extends LocalAdminSharedCapabilityState>(): T | undefined {
    return this.sharedCapabilityState as T | undefined;
  }

  setSharedCapabilityState(state: LocalAdminSharedCapabilityState): void {
    this.sharedCapabilityState = state;
  }
}

class LocalCatalogDataSource implements CatalogDataSource {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async loadCatalogDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    return { status: "found", value: this.state.snapshotCatalog() };
  }
}

export class LocalAdminCatalogReadRepository extends CatalogRepositoryService {
  constructor(state: LocalAdminCatalogState) {
    super(new LocalCatalogDataSource(state));
  }
}

class LocalAdminCatalogCommandRepository implements CatalogAdminCommandRepository {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async saveCategory(category: Category): Promise<CatalogAdminCommandResult<Category>> {
    const parsed = parseResult(parseCategory(category));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    const candidate = { ...current, categories: replaceById(current.categories, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneCategory);
  }

  async saveProduct(product: CatalogProduct): Promise<CatalogAdminCommandResult<CatalogProduct>> {
    const parsed = parseResult(parseCatalogProduct(product));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    const candidate = { ...current, products: replaceById(current.products, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneProduct);
  }

  async saveOption(option: ProductOption): Promise<CatalogAdminCommandResult<ProductOption>> {
    const parsed = parseResult(parseProductOption(option));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === parsed.value.productId)) return { status: "not_found" };
    const existing = current.options.find((candidate) => candidate.id === parsed.value.id);
    if (existing && existing.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.productId", "ownership", "Option identity belongs to another Product.")]);
    }
    const candidate = { ...current, options: replaceById(current.options, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneOption);
  }

  async saveOptionValue(value: ProductOptionValue): Promise<CatalogAdminCommandResult<ProductOptionValue>> {
    const parsed = parseResult(parseProductOptionValue(value));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    const option = current.options.find((candidate) => candidate.id === parsed.value.optionId);
    if (!current.products.some((product) => product.id === parsed.value.productId)) return { status: "not_found" };
    if (!option || option.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.optionId", "ownership", "Option Value must reference an Option on the same Product.")]);
    }
    const existing = current.optionValues.find((candidate) => candidate.id === parsed.value.id);
    if (existing && existing.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.productId", "ownership", "Option Value identity belongs to another Product.")]);
    }
    const candidate = { ...current, optionValues: replaceById(current.optionValues, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneOptionValue);
  }

  async saveVariant(variant: ProductVariant): Promise<CatalogAdminCommandResult<ProductVariant>> {
    const parsed = parseResult(parseProductVariant(variant));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === parsed.value.productId)) return { status: "not_found" };
    const existing = current.variants.find((candidate) => candidate.id === parsed.value.id);
    if (existing && existing.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.productId", "ownership", "Variant identity belongs to another Product.")]);
    }
    const candidate = { ...current, variants: replaceById(current.variants, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneVariant);
  }

  async saveAsset(asset: ProductAsset): Promise<CatalogAdminCommandResult<ProductAsset>> {
    const parsed = parseResult(parseProductAsset(asset));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === parsed.value.productId)) return { status: "not_found" };
    const existing = current.assets.find((candidate) => candidate.id === parsed.value.id);
    if (existing && existing.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.productId", "ownership", "ProductAsset identity belongs to another Product.")]);
    }
    const candidate = { ...current, assets: replaceById(current.assets, parsed.value) };
    return catalogCommit(this.state, candidate, parsed.value, cloneAsset);
  }

  async saveFulfillmentConfig(config: ProductFulfillmentConfig): Promise<CatalogAdminCommandResult<ProductFulfillmentConfig>> {
    const parsed = parseResult(parseProductFulfillmentConfig(config));
    if (parsed.status !== "parsed") return invalidConfiguration(parsed.issues);
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === parsed.value.productId)) return { status: "not_found" };
    const existing = current.fulfillmentConfigs.find((candidate) => candidate.id === parsed.value.id);
    if (existing && existing.productId !== parsed.value.productId) {
      return invalidConfiguration([issue("$.productId", "ownership", "FulfillmentConfig identity belongs to another Product.")]);
    }
    const productConfig = current.fulfillmentConfigs.find(
      (candidate) => candidate.productId === parsed.value.productId,
    );
    if (productConfig && productConfig.id !== parsed.value.id && !sameFulfillmentConfig(productConfig, parsed.value)) {
      return invalidConfiguration([issue("$.productId", "duplicate", "Product already has a different FulfillmentConfig.")]);
    }
    const candidate = {
      ...current,
      fulfillmentConfigs: replaceById(current.fulfillmentConfigs, parsed.value),
    };
    return catalogCommit(this.state, candidate, parsed.value, cloneFulfillmentConfig);
  }
}

class LocalAdminProductSkuGraphRepository implements ProductSkuGraphWriteRepository {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async saveProductSkuGraph(graph: ProductSkuGraph): Promise<{
    status: "applied";
    value: ProductSkuGraph;
  } | {
    status: "not_found";
  } | {
    status: "invalid_configuration";
    issues: readonly CatalogValidationIssue[];
  } | {
    status: "source_failure";
    operation: "catalog.admin.sku_graph";
  }> {
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === graph.productId)) return { status: "not_found" };
    const ownershipIssues: CatalogValidationIssue[] = [];
    graph.options.forEach((option, index) => {
      if (option.productId !== graph.productId) ownershipIssues.push(issue(`$.options[${index}].productId`, "ownership", "Option belongs to another Product."));
    });
    graph.optionValues.forEach((value, index) => {
      if (value.productId !== graph.productId) ownershipIssues.push(issue(`$.optionValues[${index}].productId`, "ownership", "Option Value belongs to another Product."));
    });
    graph.variants.forEach((variant, index) => {
      if (variant.productId !== graph.productId) ownershipIssues.push(issue(`$.variants[${index}].productId`, "ownership", "Variant belongs to another Product."));
    });
    if (ownershipIssues.length > 0) return { status: "invalid_configuration", issues: ownershipIssues };

    const parsedOptions = graph.options.map((option) => parseProductOption(option));
    const parsedValues = graph.optionValues.map((value) => parseProductOptionValue(value));
    const parsedVariants = graph.variants.map((variant) => parseProductVariant(variant));
    const parseIssues = [
      ...parsedOptions.flatMap((parsed) => parsed.ok ? [] : parsed.issues),
      ...parsedValues.flatMap((parsed) => parsed.ok ? [] : parsed.issues),
      ...parsedVariants.flatMap((parsed) => parsed.ok ? [] : parsed.issues),
    ];
    if (parseIssues.length > 0) return { status: "invalid_configuration", issues: parseIssues };
    const normalized: ProductSkuGraph = {
      productId: graph.productId,
      options: parsedOptions.flatMap((parsed) => parsed.ok ? [parsed.value] : []),
      optionValues: parsedValues.flatMap((parsed) => parsed.ok ? [parsed.value] : []),
      variants: parsedVariants.flatMap((parsed) => parsed.ok ? [parsed.value] : []),
    };
    const proposed: CatalogDataSet = {
      ...current,
      options: [...current.options.filter((item) => item.productId !== graph.productId), ...normalized.options],
      optionValues: [...current.optionValues.filter((item) => item.productId !== graph.productId), ...normalized.optionValues],
      variants: [...current.variants.filter((item) => item.productId !== graph.productId), ...normalized.variants],
    };
    const validation = validateCatalogDataSet(proposed);
    if (!validation.ok) return { status: "invalid_configuration", issues: validation.issues };
    const committed = this.state.commitCatalog(proposed);
    if (!committed.ok) return { status: "invalid_configuration", issues: committed.issues };
    return {
      status: "applied",
      value: {
        productId: normalized.productId,
        options: normalized.options.map(cloneOption),
        optionValues: normalized.optionValues.map(cloneOptionValue),
        variants: normalized.variants.map(cloneVariant),
      },
    };
  }
}

class LocalAdminProductAssetRepository implements ProductAssetWriteRepository {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async createProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === asset.productId)) return { status: "not_found" };
    const existing = current.assets.find((candidate) => candidate.id === asset.id);
    if (existing) {
      return existing.productId === asset.productId && sameAsset(existing, asset)
        ? { status: "applied", value: cloneAsset(existing) }
        : { status: "invalid_configuration", issues: [issue("$.id", "duplicate", "ProductAsset identity is already in use.")] };
    }
    const candidate = { ...current, assets: [...current.assets, cloneAsset(asset)] };
    const committed = this.state.commitCatalog(candidate);
    return committed.ok
      ? { status: "applied", value: cloneAsset(asset) }
      : { status: "invalid_configuration", issues: committed.issues };
  }

  async updateProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const current = this.state.snapshotCatalog();
    const existing = current.assets.find((candidate) => candidate.id === asset.id);
    if (!existing) return { status: "not_found" };
    if (existing.productId !== asset.productId) {
      return { status: "invalid_configuration", issues: [issue("$.productId", "ownership", "ProductAsset belongs to another Product.")] };
    }
    const committed = this.state.commitCatalog({ ...current, assets: replaceById(current.assets, cloneAsset(asset)) });
    return committed.ok
      ? { status: "applied", value: cloneAsset(asset) }
      : { status: "invalid_configuration", issues: committed.issues };
  }

  async removeProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const current = this.state.snapshotCatalog();
    const existing = current.assets.find((candidate) => candidate.id === asset.id);
    if (!existing) return { status: "not_found" };
    if (existing.productId !== asset.productId) {
      return { status: "invalid_configuration", issues: [issue("$.productId", "ownership", "ProductAsset belongs to another Product.")] };
    }
    if (current.categories.some((category) => category.seo.imageAssetId === asset.id)
      || current.products.some((product) => product.seo.imageAssetId === asset.id)) {
      return { status: "invalid_configuration", issues: [issue("$.id", "ownership", "ProductAsset is still referenced by SEO metadata.")] };
    }
    const committed = this.state.commitCatalog({
      ...current,
      assets: current.assets.filter((candidate) => candidate.id !== asset.id),
    });
    return committed.ok
      ? { status: "applied", value: cloneAsset(existing) }
      : { status: "invalid_configuration", issues: committed.issues };
  }
}

class LocalAdminProductFulfillmentRepository implements ProductFulfillmentWriteRepository {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async createProductFulfillmentConfig(config: ProductFulfillmentConfig): Promise<ProductFulfillmentWriteResult> {
    const current = this.state.snapshotCatalog();
    if (!current.products.some((product) => product.id === config.productId)) return { status: "not_found" };
    const existingForProduct = current.fulfillmentConfigs.find((candidate) => candidate.productId === config.productId);
    if (existingForProduct) {
      return sameFulfillmentConfig(existingForProduct, config)
        ? { status: "applied", value: cloneFulfillmentConfig(existingForProduct) }
        : { status: "invalid_configuration", issues: [issue("$.productId", "duplicate", "Product already has a FulfillmentConfig.")] };
    }
    const identityCollision = current.fulfillmentConfigs.find((candidate) => candidate.id === config.id);
    if (identityCollision) return { status: "invalid_configuration", issues: [issue("$.id", "ownership", "FulfillmentConfig identity belongs to another Product.")] };
    const committed = this.state.commitCatalog({
      ...current,
      fulfillmentConfigs: [...current.fulfillmentConfigs, cloneFulfillmentConfig(config)],
    });
    return committed.ok
      ? { status: "applied", value: cloneFulfillmentConfig(config) }
      : { status: "invalid_configuration", issues: committed.issues };
  }

  async updateProductFulfillmentConfig(config: ProductFulfillmentConfig): Promise<ProductFulfillmentWriteResult> {
    const current = this.state.snapshotCatalog();
    const existing = current.fulfillmentConfigs.find((candidate) => candidate.id === config.id);
    if (!existing) return { status: "not_found" };
    if (existing.productId !== config.productId) return { status: "invalid_configuration", issues: [issue("$.productId", "ownership", "FulfillmentConfig belongs to another Product.")] };
    const committed = this.state.commitCatalog({
      ...current,
      fulfillmentConfigs: replaceById(current.fulfillmentConfigs, cloneFulfillmentConfig(config)),
    });
    return committed.ok
      ? { status: "applied", value: cloneFulfillmentConfig(config) }
      : { status: "invalid_configuration", issues: committed.issues };
  }
}

function lifecycleTargetLifecycle(action: CatalogLifecycleIntent["action"]): "draft" | "published" | "retired" | null {
  switch (action) {
    case "publish": return "published";
    case "unpublish": return "draft";
    case "retire": return "retired";
    case "destructive_state_mutation_attempt": return null;
  }
}

function lifecycleRejection(reason: CatalogLifecycleRejectionReason): CatalogLifecycleWriteResult {
  return { status: "rejected", reason };
}

class LocalAdminCatalogLifecycleRepository implements CatalogLifecycleWriteRepository {
  private readonly state: LocalAdminCatalogState;

  constructor(state: LocalAdminCatalogState) {
    this.state = state;
  }

  async applyLifecycleIntent(intent: CatalogLifecycleIntent): Promise<CatalogLifecycleWriteResult> {
    if (intent.actorBoundary !== "configured_admin_session" || intent.actorIdentifier.trim() === "") {
      return { status: "source_failure", operation: "catalog.admin.lifecycle" };
    }
    if (intent.action === "destructive_state_mutation_attempt") return lifecycleRejection("destructive_mutation_forbidden");
    const targetLifecycle = lifecycleTargetLifecycle(intent.action);
    if (!targetLifecycle) return lifecycleRejection("destructive_mutation_forbidden");
    const current = this.state.snapshotCatalog();
    const target = intent.targetType === "category"
      ? current.categories.find((category) => category.id === intent.targetId)
      : intent.targetType === "product"
        ? current.products.find((product) => product.id === intent.targetId)
        : undefined;
    if (!target) return { status: "not_found" };
    if (target.lifecycle !== "draft" && target.lifecycle !== "published" && target.lifecycle !== "retired") {
      return lifecycleRejection("invalid_current_lifecycle");
    }
    if (target.lifecycle === targetLifecycle) {
      return {
        status: "applied",
        value: {
          targetType: intent.targetType,
          targetId: intent.targetId,
          action: intent.action,
          previousLifecycle: target.lifecycle,
          currentLifecycle: target.lifecycle,
          changed: false,
        },
      };
    }

    let candidate = current;
    if (intent.targetType === "category") {
      candidate = {
        ...current,
        categories: current.categories.map((category) => category.id === intent.targetId
          ? { ...category, lifecycle: targetLifecycle }
          : category),
      };
    } else if (intent.targetType === "product") {
      const product = current.products.find((entry) => entry.id === intent.targetId);
      if (!product) return { status: "not_found" };
      if (intent.action === "publish") {
        const category = current.categories.find((entry) => entry.id === product.categoryId);
        if (!category || category.lifecycle !== "published") return lifecycleRejection("category_not_published");
        const fulfillment = current.fulfillmentConfigs.filter((entry) => entry.productId === product.id);
        if (fulfillment.length === 0) return lifecycleRejection("fulfillment_missing");
        if (fulfillment.length !== 1 || !validateProductFulfillmentConfig(fulfillment[0]).ok) {
          return lifecycleRejection("fulfillment_invalid");
        }
        const proposedProduct = { ...product, lifecycle: "published" as const };
        const graph = catalogGraphForProduct({ ...current, products: [proposedProduct] }, proposedProduct);
        if (!graph.ok) return lifecycleRejection("invalid_variant_graph");
        const combinations = validateVariantCombinations({
          productId: product.id,
          options: graph.value.options,
          optionValues: graph.value.optionValues,
          variants: graph.value.variants,
          catalogVariants: current.variants,
        });
        if (!combinations.ok) return lifecycleRejection("invalid_variant_graph");
        const eligibility = evaluatePublicEligibility({ ...graph.value, product: proposedProduct });
        if (!eligibility.eligible) return lifecycleRejection("no_eligible_variant");
      }
      candidate = {
        ...current,
        products: current.products.map((entry) => entry.id === intent.targetId
          ? { ...entry, lifecycle: targetLifecycle }
          : entry),
      };
    } else {
      return lifecycleRejection("invalid_current_lifecycle");
    }

    const committed = this.state.commitCatalog(candidate);
    if (!committed.ok) return { status: "source_failure", operation: "catalog.admin.lifecycle" };
    const value: CatalogLifecycleMutationValue = {
      targetType: intent.targetType,
      targetId: intent.targetId,
      action: intent.action,
      previousLifecycle: target.lifecycle,
      currentLifecycle: targetLifecycle,
      changed: true,
    };
    return { status: "applied", value };
  }
}

export interface LocalAdminCatalogRuntime {
  readonly state: LocalAdminCatalogState;
  readonly reader: CatalogAdminReadRepository;
  readonly commandRepository: CatalogAdminCommandRepository;
  readonly skuGraphRepository: ProductSkuGraphWriteRepository;
  readonly assetRepository: ProductAssetWriteRepository;
  readonly fulfillmentRepository: ProductFulfillmentWriteRepository;
  readonly lifecycleRepository: CatalogLifecycleWriteRepository;
}

export function createLocalAdminCatalogRuntimeFromState(
  state: LocalAdminCatalogState,
): LocalAdminCatalogRuntime {
  return {
    state,
    reader: new LocalAdminCatalogReadRepository(state),
    commandRepository: new LocalAdminCatalogCommandRepository(state),
    skuGraphRepository: new LocalAdminProductSkuGraphRepository(state),
    assetRepository: new LocalAdminProductAssetRepository(state),
    fulfillmentRepository: new LocalAdminProductFulfillmentRepository(state),
    lifecycleRepository: new LocalAdminCatalogLifecycleRepository(state),
  };
}

export function createLocalAdminCatalogRuntime(
  options: LocalAdminCatalogStateOptions = {},
): LocalAdminCatalogRuntime {
  return createLocalAdminCatalogRuntimeFromState(new LocalAdminCatalogState(options));
}

let sharedLocalCatalogRuntime: LocalAdminCatalogRuntime | null = null;

/**
 * The local Catalog graph is created only when an already-authorized caller
 * resolves the local source. One process-memory Catalog graph is shared by all
 * capability-specific local views.
 */
export function getSharedLocalCatalogAdminRuntime(): LocalAdminCatalogRuntime {
  sharedLocalCatalogRuntime ??= createLocalAdminCatalogRuntime();
  return sharedLocalCatalogRuntime;
}

export function resetSharedLocalCatalogAdminRuntimeForTests(): void {
  sharedLocalCatalogRuntime = null;
}

/**
 * Batch A can inject this deferred factory into its server-only source policy.
 * One invocation returns one coherent runtime; no route is wired here until
 * the later route-integration tasks are approved.
 */
export function createLocalAdminCatalogSourceFactory(
  options: LocalAdminCatalogStateOptions = {},
): () => LocalAdminCatalogRuntime {
  const runtime = createLocalAdminCatalogRuntime(options);
  return () => runtime;
}
