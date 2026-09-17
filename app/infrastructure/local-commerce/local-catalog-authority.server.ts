import type { RuntimeEnvironment } from "../../config/server.ts";
import { CatalogRepositoryService, type CatalogDataSource, type CatalogRepositoryResult } from "../../application/catalog-repository.ts";
import { validateCatalogDataSet, type CatalogDataSet } from "../../application/catalog-data-set.ts";
import { normalizeCustomizationFieldConfiguration, customizationFieldSourceFailure, type CustomizationFieldReadRepository } from "../../application/customization-field-repository.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { isRecord, parseCategory, parseCatalogProduct, parseProductOption, parseProductOptionValue, parseProductVariant, parseProductAsset, type CatalogValidationResult } from "../../domain/catalog/index.ts";
import { persistentBaseFulfillment } from "../../application/local-persistent-fulfillment-authority.server.ts";
import { createLocalPersistentSupabaseAdapter, type LocalPersistentSupabaseClientFactory } from "./local-persistent-supabase-adapter.server.ts";
import {
  calculateCustomizationPricing,
  parseCustomizationSurchargeRuleRow,
  type CustomizationPricingResult,
} from "../../application/customization-surcharge-pricing.ts";
import type { CustomizationPricingResolver } from "../../application/shopping-cart-service.ts";

type Row = Record<string, unknown>;
export interface LocalCatalogSnapshot {
  readonly projectId: string;
  readonly dataSet: CatalogDataSet;
  readonly configurations: readonly Row[];
  readonly rules: readonly Row[];
  readonly versions: Readonly<Record<string, number>>;
  readonly purchasedFulfillments: Readonly<Record<string, unknown>>;
}
function failure(): CatalogRepositoryResult<never> {
  return { status: "source_failure", operation: "local_catalog.read" };
}
function parsed<T>(value: unknown, parser: (value: unknown) => CatalogValidationResult<T>): T {
  const result = parser(value);
  if (!result.ok) throw new Error("Invalid local catalog definition");
  return result.value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid local catalog collection");
  return value;
}

/** Request-scoped, read-only adapter. No memory Catalog, seed, cache, or writer. */
export class LocalCatalogAuthority implements CatalogDataSource, CustomizationFieldReadRepository {
  readonly repository = new CatalogRepositoryService(this);
  private readonly environment: RuntimeEnvironment;
  private readonly clientFactory?: LocalPersistentSupabaseClientFactory;
  constructor(
    environment: RuntimeEnvironment,
    clientFactory?: LocalPersistentSupabaseClientFactory,
  ) { this.environment = environment; this.clientFactory = clientFactory; }

  async readSnapshot(expectedVersions: Readonly<Record<string, number>> = {}): Promise<CatalogRepositoryResult<LocalCatalogSnapshot>> {
    try {
      const composition = resolveLocalPersistentComposition(this.environment, { requiredCapabilities: ["catalog"] });
      if (composition.status !== "ready") return failure();
      // Fake Admin Catalog is deliberately independent. Other explicitly enabled
      // commerce sources cannot supply authority to this persistent journey.
      for (const key of ["CUSTOMER_AUTH_SOURCE", "CART_SOURCE", "LOCAL_CHECKOUT_SOURCE", "CUSTOMER_UPLOAD_SOURCE", "LOCAL_ORDER_SOURCE"]) {
        const source = this.environment[key]?.trim();
        if (source && source !== "disabled" && source !== "local_persistent") return failure();
      }
      const connection = await createLocalPersistentSupabaseAdapter(this.environment, { clientFactory: this.clientFactory });
      if (connection.status !== "ready") return failure();
      const projectId = composition.value.projectId;
      const loaded = await connection.adapter.callRestrictedRpc<unknown>("read_catalog_authority", {
        p_project_id: projectId, p_marker_digest: composition.value.markerDigest,
      });
      if (loaded.status !== "found" || !isRecord(loaded.value) || loaded.value.projectId !== projectId) return failure();
      const versions: Record<string, number> = {};
      const rows = (key: string): Row[] => array(loaded.value && (loaded.value as Row)[key]).map((value) => {
        if (!isRecord(value) || value.project_id !== projectId || typeof value.id !== "string"
          || !Number.isSafeInteger(value.version) || (value.version as number) < 1 || value.lifecycle !== "active") throw new Error("Invalid local catalog ownership/version");
        const versionKey = `${key}:${value.id}`;
        if (versionKey in versions) throw new Error("Duplicate local catalog identity");
        versions[versionKey] = value.version as number;
        return value;
      });
      const categories = rows("categories");
      const products = rows("products");
      const variants = rows("variants");
      const configurations = rows("configurations");
      const rules = rows("rules");
      const dataSet: CatalogDataSet = {
        categories: categories.map(c => parsed({ id:c.id,slug:c.slug,name:c.name,description:c.description,seo:{},lifecycle:c.publication_status },parseCategory)),
        products: products.map(p => parsed({ id:p.id,slug:p.slug,name:p.name,description:p.description,categoryId:p.category_id,seo:{},lifecycle:p.publication_status },parseCatalogProduct)),
        options: products.flatMap(p => array(p.option_definitions).map(o => {
          const result = parsed(o,parseProductOption);
          if (result.productId !== p.id) throw new Error("Option ownership mismatch");
          return result;
        })),
        optionValues: products.flatMap(p => array(p.option_value_definitions).map(o => {
          const result = parsed(o,parseProductOptionValue);
          if (result.productId !== p.id) throw new Error("Option value ownership mismatch");
          return result;
        })),
        assets: products.flatMap(p => array(p.asset_definitions).map(o => {
          const result = parsed(o,parseProductAsset);
          if (result.productId !== p.id) throw new Error("Asset ownership mismatch");
          return result;
        })),
        fulfillmentConfigs: products.map(p => {
          const result = parsed(p.fulfillment_definition,persistentBaseFulfillment);
          if(result.productId !== p.id) throw new Error("Fulfillment ownership mismatch");
          return result;
        }),
        variants: variants.map(v => parsed({
          id:v.id,productId:v.product_id,skuCode:v.sku_code,selectedOptions:v.selected_options,
          priceCents:v.price_cents,currency:v.currency,weightGrams:v.weight_grams,isDefault:v.is_default,supplyMethod:v.supply_method,
          isActive:true,isAvailable:v.availability === "available" && products.some(p => p.id === v.product_id && p.availability === "available"),
        },parseProductVariant)),
      };
      if (!validateCatalogDataSet(dataSet).ok) return failure();
      const seen = new Set<unknown>();
      for(const c of configurations) {
        if(!Number.isSafeInteger(c.revision) || (c.revision as number)<1 || c.configuration_status!=="active" || seen.has(c.product_id)
          || !products.some(p=>p.id===c.product_id) || !isRecord(c.definition) || c.definition.configurationRevision!==String(c.revision)) return failure();
        seen.add(c.product_id);
        if(normalizeCustomizationFieldConfiguration(String(c.product_id),c.definition).status!=="found") return failure();
      }
      const ruleKeys = new Set<unknown>();
      for(const r of rules) {
        if(typeof r.rule_key!=="string" || ruleKeys.has(r.rule_key) || !Number.isSafeInteger(r.revision) || (r.revision as number)<1 || r.rule_status!=="active") return failure();
        ruleKeys.add(r.rule_key);
      }
      if(Object.entries(expectedVersions).some(([key,version])=>versions[key]!==version)) return failure();
      return {status:"found",value:{projectId, dataSet,configurations,rules,versions,
        purchasedFulfillments:Object.fromEntries(products.map(p=>[String(p.id),structuredClone(p.fulfillment_definition)]))}};
    } catch { return failure(); }
  }

  async loadCatalogDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    const result = await this.readSnapshot();
    return result.status === "found" ? {status:"found",value:result.value.dataSet} : result;
  }
  async getCustomizationFieldsForProduct(productId: string) {
    const result = await this.readSnapshot();
    if(result.status!=="found") return customizationFieldSourceFailure();
    const config = result.value.configurations.find(c=>c.product_id===productId);
    if(!config) return {status:"not_found" as const};
    return normalizeCustomizationFieldConfiguration(productId,config.definition);
  }

  /**
   * C03 read-only pricing authority. It reuses the same request-scoped Catalog
   * snapshot as the storefront and never accepts a browser price.
   */
  async resolveCustomizationPricing(input: Parameters<CustomizationPricingResolver>[0]): Promise<CustomizationPricingResult> {
    const snapshot = await this.readSnapshot();
    if (snapshot.status !== "found") return { status: "unavailable", reason: "catalog_unavailable" };
    const rows = snapshot.value.rules.filter((row) =>
      isRecord(row.definition) && row.definition.kind === "customization_surcharge",
    );
    const rules = rows.map((row) => parseCustomizationSurchargeRuleRow(row, snapshot.value.projectId));
    if (rules.some((rule) => rule === null)) return { status: "unavailable", reason: "invalid_pricing_rule" };
    return calculateCustomizationPricing({
      productId: input.productId,
      variant: input.variant,
      configuration: input.configuration,
      handoff: input.handoff,
      rules: rules.filter((rule): rule is NonNullable<typeof rule> => rule !== null),
    });
  }
}
