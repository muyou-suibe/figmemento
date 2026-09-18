import { createHash } from "node:crypto";
import {
  normalizeAdminCustomizationFieldConfiguration,
  type ProductCustomizationFieldConfiguration,
} from "../../application/customization-field-repository.ts";
import type {
  AdminCustomizationFieldReplacement,
  AdminCustomizationFieldWriteResult,
  AdminCustomizationNewFieldIdMapping,
  CustomizationFieldAdminReadRepository,
  CustomizationFieldAtomicPublicationRepository,
  ReplaceCustomizationConfigurationIntent,
  AdminCustomizationFieldConfiguration,
  AdminCustomizationIdentityReadResult,
  AdminCustomizationFieldReadResult,
} from "../../application/admin-customization-field-boundary.ts";
import {
  createLocalAdminCatalogRuntimeFromState,
  getSharedLocalCatalogAdminRuntime,
  resetSharedLocalCatalogAdminRuntimeForTests,
  type LocalAdminCatalogRuntime as CatalogRuntime,
  type LocalAdminCatalogStateOptions as CatalogStateOptions,
  type LocalAdminSharedCapabilityState,
  LocalAdminCatalogState as CatalogState,
} from "./local-admin-catalog-runtime.server.ts";
import { createDevelopmentCustomizationFieldFixtures } from "../customization/development-customization-field-fixtures.ts";
import type { CatalogValidationIssue } from "../../domain/catalog/index.ts";
import { parseCustomizationField, type CustomizationField, type SingleSelectCustomizationFieldConstraints, type MultiSelectCustomizationFieldConstraints } from "../../domain/customization-field.ts";

export { LocalAdminCatalogState } from "./local-admin-catalog-runtime.server.ts";

export interface LocalAdminCatalogStateOptions extends CatalogStateOptions {
  readonly customizationConfigurations?: readonly ProductCustomizationFieldConfiguration[];
}

function issue(path: string, code: CatalogValidationIssue["code"], message: string): CatalogValidationIssue {
  return { path, code, message };
}

class LocalAdminCustomizationState implements LocalAdminSharedCapabilityState {
  private readonly initialCustomizationConfigurations: readonly ProductCustomizationFieldConfiguration[];
  private readonly initialChoiceIdentityHistory: Map<string, Map<string, string>>;
  private readonly customizationConfigurations: Map<string, ProductCustomizationFieldConfiguration>;
  private readonly choiceIdentityHistory: Map<string, Map<string, string>>;
  private customizationRevisionCounter = 0;

  constructor(configurations: readonly ProductCustomizationFieldConfiguration[]) {
    this.initialCustomizationConfigurations = configurations.map(cloneCustomizationConfiguration);
    this.initialChoiceIdentityHistory = choiceIdentityHistoryFrom(this.initialCustomizationConfigurations);
    this.customizationConfigurations = new Map(
      this.initialCustomizationConfigurations.map((configuration) => [
        configuration.productId,
        cloneCustomizationConfiguration(configuration),
      ]),
    );
    this.choiceIdentityHistory = cloneChoiceIdentityHistory(this.initialChoiceIdentityHistory);
  }

  snapshotCustomization(productId: string): ProductCustomizationFieldConfiguration | undefined {
    const configuration = this.customizationConfigurations.get(productId);
    return configuration ? cloneCustomizationConfiguration(configuration) : undefined;
  }

  commitCustomization(configuration: ProductCustomizationFieldConfiguration): void {
    this.customizationConfigurations.set(
      configuration.productId,
      cloneCustomizationConfiguration(configuration),
    );
    registerChoiceIdentityHistory(this.choiceIdentityHistory, configuration);
  }

  choiceIdentityBindings(productId: string, fieldId: string): ReadonlyMap<string, string> {
    return this.choiceIdentityHistory.get(choiceIdentityHistoryKey(productId, fieldId)) ?? new Map();
  }

  resetForTest(): void {
    this.customizationConfigurations.clear();
    for (const configuration of this.initialCustomizationConfigurations) {
      this.customizationConfigurations.set(
        configuration.productId,
        cloneCustomizationConfiguration(configuration),
      );
    }
    this.choiceIdentityHistory.clear();
    for (const [key, bindings] of this.initialChoiceIdentityHistory) {
      this.choiceIdentityHistory.set(key, new Map(bindings));
    }
    this.customizationRevisionCounter = 0;
  }

  nextCustomizationRevision(productId: string): string {
    this.customizationRevisionCounter += 1;
    return `local-customization-revision-${productId}-${this.customizationRevisionCounter}`;
  }
}

function customizationStateFor(
  state: CatalogState,
  configurations: readonly ProductCustomizationFieldConfiguration[] = createDevelopmentCustomizationFieldFixtures(),
): LocalAdminCustomizationState {
  const existing = state.getSharedCapabilityState<LocalAdminCustomizationState>();
  if (existing instanceof LocalAdminCustomizationState) return existing;
  const created = new LocalAdminCustomizationState(configurations);
  state.setSharedCapabilityState(created);
  return created;
}

function choiceIdentityHistoryKey(productId: string, fieldId: string): string {
  return `${productId}\u0000${fieldId}`;
}

function choiceIdentityHistoryFrom(
  configurations: readonly ProductCustomizationFieldConfiguration[],
): Map<string, Map<string, string>> {
  const history = new Map<string, Map<string, string>>();
  for (const configuration of configurations) {
    registerChoiceIdentityHistory(history, configuration);
  }
  return history;
}

function cloneChoiceIdentityHistory(
  history: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Map<string, Map<string, string>> {
  return new Map([...history].map(([key, bindings]) => [key, new Map(bindings)]));
}

function registerChoiceIdentityHistory(
  history: Map<string, Map<string, string>>,
  configuration: ProductCustomizationFieldConfiguration,
): void {
  for (const field of configuration.fields) {
    if (field.kind !== "single_select" && field.kind !== "multi_select") continue;
    const key = choiceIdentityHistoryKey(configuration.productId, field.id);
    const bindings = history.get(key) ?? new Map<string, string>();
    for (const choice of field.constraints.choices) bindings.set(choice.id, choice.code);
    history.set(key, bindings);
  }
}

function cloneCustomizationField(field: CustomizationField): CustomizationField {
  return {
    ...field,
    constraints: field.kind === "image"
      ? {
          ...field.constraints,
          allowedMimeTypes: [...field.constraints.allowedMimeTypes],
          minDimensions: { ...field.constraints.minDimensions },
          ...(field.constraints.recommendedDimensions
            ? { recommendedDimensions: { ...field.constraints.recommendedDimensions } }
            : {}),
        }
      : field.kind === "single_select" || field.kind === "multi_select"
        ? { ...field.constraints, choices: field.constraints.choices.map((choice) => ({ ...choice })) }
        : { ...field.constraints },
    ...(field.rules ? { rules: { ...field.rules } } : {}),
  } as CustomizationField;
}

function materializeChoiceConstraints(
  replacement: AdminCustomizationFieldReplacement,
  productId: string,
  fieldId: string,
  configurationRevision: string,
  currentField: CustomizationField | undefined,
  historicalBindings: ReadonlyMap<string, string>,
): AdminCustomizationFieldReplacement | null {
  if (replacement.kind !== "single_select" && replacement.kind !== "multi_select") return replacement;
  const choiceSelect = replacement.constraints as SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints;
  const currentChoices = currentField?.kind === "single_select" || currentField?.kind === "multi_select"
    ? new Map(currentField.constraints.choices.map((choice) => [choice.id, choice]))
    : new Map();
  const historicalIdsByCode = new Map([...historicalBindings].map(([id, code]) => [code, id]));
  const seenIds = new Set<string>();
  const choices = choiceSelect.choices.map((choice) => {
    if (choice.id.startsWith("new:")) {
      if (historicalIdsByCode.has(choice.code)) return null;
      const generatedId = `local-customization-choice-${createHash("sha256")
        .update(`${productId}\u0000${fieldId}\u0000${configurationRevision}\u0000${choice.id}`)
        .digest("hex")
        .slice(0, 32)}`;
      if (historicalBindings.has(generatedId)) return null;
      return {
        ...choice,
        id: generatedId,
      };
    }
    const historicalCode = historicalBindings.get(choice.id);
    if ((historicalCode && historicalCode !== choice.code)
      || (historicalIdsByCode.has(choice.code) && historicalIdsByCode.get(choice.code) !== choice.id)) return null;
    const current = currentChoices.get(choice.id);
    if ((!current && !historicalCode) || (current && current.code !== choice.code)) return null;
    return { ...choice };
  });
  if (choices.some((choice) => choice === null)) return null;
  const materialized = choices as Array<SingleSelectCustomizationFieldConstraints["choices"][number]>;
  if (materialized.some((choice) => seenIds.has(choice.id))) return null;
  materialized.forEach((choice) => seenIds.add(choice.id));
  return {
    ...replacement,
    constraints: { ...replacement.constraints, choices: materialized },
  };
}

function cloneCustomizationConfiguration(
  configuration: ProductCustomizationFieldConfiguration,
): ProductCustomizationFieldConfiguration {
  return {
    productId: configuration.productId,
    configurationRevision: configuration.configurationRevision,
    fields: configuration.fields.map(cloneCustomizationField),
  };
}

function customizationFieldFromReplacement(
  replacement: AdminCustomizationFieldReplacement,
  productId: string,
  configurationRevision: string,
  fieldId: string,
): CustomizationField | null {
  const parsed = parseCustomizationField({
    id: fieldId,
    productId,
    code: replacement.identity.code,
    label: replacement.label,
    kind: replacement.kind,
    required: replacement.required,
    isActive: replacement.isActive,
    position: replacement.position,
    configurationRevision,
    constraints: replacement.constraints,
    rules: replacement.rules,
  });
  return parsed.ok ? parsed.value : null;
}

class LocalAdminCustomizationRepository
  implements CustomizationFieldAdminReadRepository, CustomizationFieldAtomicPublicationRepository {
  private readonly state: CatalogState;

  constructor(state: CatalogState) {
    this.state = state;
  }

  async getCurrentConfigurationForAdmin(productId: string): Promise<AdminCustomizationFieldReadResult> {
    if (!this.state.snapshotCatalog().products.some((product) => product.id === productId)) return { status: "not_found" };
    const configuration = customizationStateFor(this.state).snapshotCustomization(productId);
    return configuration
      ? { status: "found", value: { ...configuration, fields: configuration.fields.map(cloneCustomizationField) } }
      : { status: "not_configured" };
  }

  async getStableFieldIdentitiesForAdmin(
    productId: string,
    stableFieldIds: readonly string[],
  ): Promise<AdminCustomizationIdentityReadResult> {
    const configuration = customizationStateFor(this.state).snapshotCustomization(productId);
    if (!configuration) return { status: "found", value: [] };
    const requested = new Set(stableFieldIds);
    return {
      status: "found",
      value: configuration.fields
        .filter((field) => requested.has(field.id))
        .map((field) => ({ id: field.id, productId: field.productId, code: field.code })),
    };
  }

  async publishCustomizationConfiguration(
    intent: ReplaceCustomizationConfigurationIntent,
  ): Promise<AdminCustomizationFieldWriteResult> {
    const products = this.state.snapshotCatalog().products;
    if (!products.some((product) => product.id === intent.productId)) return { status: "not_found" };
    const current = customizationStateFor(this.state).snapshotCustomization(intent.productId);
    const currentRevision = current?.configurationRevision ?? null;
    if (currentRevision !== intent.expectedCurrentRevision) return { status: "stale_revision" };
    const configurationRevision = customizationStateFor(this.state).nextCustomizationRevision(intent.productId);
    const currentFields = new Map(current?.fields.map((field) => [field.id, field]) ?? []);
    const seenIds = new Set<string>();
    const newFieldIdMappings: AdminCustomizationNewFieldIdMapping[] = [];
    const fields: CustomizationField[] = [];
    for (const replacement of intent.fields) {
      let fieldId: string;
      if (replacement.identity.kind === "existing") {
        const existing = currentFields.get(replacement.identity.id);
        if (!existing || existing.code !== replacement.identity.code) {
          return {
            status: "invalid_configuration",
            issues: [issue("$.fields.identity", "ownership", "Stable customization field identity is unavailable for this Product.")],
          };
        }
        fieldId = existing.id;
      } else {
        fieldId = `local-customization-field-${intent.productId}-${replacement.identity.draftId.slice(4)}`;
        newFieldIdMappings.push({ draftId: replacement.identity.draftId, stableFieldId: fieldId });
      }
      if (seenIds.has(fieldId)) {
        return { status: "invalid_configuration", issues: [issue("$.fields", "duplicate", "Customization field identity is duplicated.")] };
      }
      const materializedReplacement = materializeChoiceConstraints(
        replacement,
        intent.productId,
        fieldId,
        configurationRevision,
        currentFields.get(fieldId),
        customizationStateFor(this.state).choiceIdentityBindings(intent.productId, fieldId),
      );
      if (!materializedReplacement) {
        return {
          status: "invalid_configuration",
          issues: [issue("$.fields.constraints.choices", "ownership", "Choice identity is unavailable or has been rebound.")],
        };
      }
      const field = customizationFieldFromReplacement(
        materializedReplacement,
        intent.productId,
        configurationRevision,
        fieldId,
      );
      if (!field) return { status: "invalid_configuration", issues: [issue("$.fields", "invalid_value", "Customization field definition is invalid.")] };
      seenIds.add(fieldId);
      fields.push(field);
    }
    const normalized = normalizeAdminCustomizationFieldConfiguration(intent.productId, {
      productId: intent.productId,
      configurationRevision,
      fields,
    });
    if (normalized.status !== "found") {
      return {
        status: "invalid_configuration",
        issues: "issues" in normalized
          ? normalized.issues
          : [issue("$.fields", "invalid_value", "Customization field configuration is invalid.")],
      };
    }
    customizationStateFor(this.state).commitCustomization(normalized.value);
    const value: AdminCustomizationFieldConfiguration = {
      productId: normalized.value.productId,
      configurationRevision: normalized.value.configurationRevision,
      fields: normalized.value.fields.map(cloneCustomizationField),
    };
    return { status: "applied", value, newFieldIdMappings };
  }
}

export interface LocalAdminCatalogRuntime extends CatalogRuntime {
  readonly customizationRepository: LocalAdminCustomizationRepository;
}

export function createLocalAdminCatalogRuntime(
  options: LocalAdminCatalogStateOptions = {},
): LocalAdminCatalogRuntime {
  const state = new CatalogState({ catalog: options.catalog });
  customizationStateFor(
    state,
    options.customizationConfigurations ?? createDevelopmentCustomizationFieldFixtures(),
  );
  const catalogRuntime = createLocalAdminCatalogRuntimeFromState(state);
  return {
    ...catalogRuntime,
    customizationRepository: new LocalAdminCustomizationRepository(state),
  };
}

/**
 * The Catalog and Customization local views intentionally share the same
 * process-memory Catalog state. Customization-specific state is attached as an
 * opaque capability slot rather than imported by the Catalog source module.
 */
let sharedLocalAdminCatalogRuntime: LocalAdminCatalogRuntime | null = null;

export function getSharedLocalAdminCatalogRuntime(): LocalAdminCatalogRuntime {
  sharedLocalAdminCatalogRuntime ??= (() => {
    const catalogRuntime = getSharedLocalCatalogAdminRuntime();
    customizationStateFor(catalogRuntime.state);
    return {
      ...catalogRuntime,
      customizationRepository: new LocalAdminCustomizationRepository(catalogRuntime.state),
    };
  })();
  return sharedLocalAdminCatalogRuntime;
}

export function resetSharedLocalAdminCatalogRuntimeForTests(): void {
  sharedLocalAdminCatalogRuntime = null;
  resetSharedLocalCatalogAdminRuntimeForTests();
}
