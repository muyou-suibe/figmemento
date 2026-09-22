import { randomUUID } from "node:crypto";
import type { RuntimeEnvironment } from "../../config/server.ts";
import type {
  AdminCustomizationFieldReadResult,
  AdminCustomizationSurchargeRule,
  AdminCustomizationFieldWriteResult,
  AdminCustomizationStableFieldIdentity,
  CustomizationFieldAdminReadRepository,
  CustomizationFieldAtomicPublicationRepository,
  ReplaceCustomizationConfigurationIntent,
  RestoreCustomizationConfigurationIntent,
} from "../../application/admin-customization-field-boundary.ts";
import { parseCustomizationSurchargeRuleRow } from "../../application/customization-surcharge-pricing.ts";
import type { AdminPrincipal } from "../../application/admin-catalog-boundary.ts";
import { normalizeAdminCustomizationFieldConfiguration } from "../../application/customization-field-repository.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { isRecord } from "../../domain/catalog/validation.ts";
import { parseCustomizationField, type CustomizationField, type CustomizationFieldRules, type CustomizationPredicate, type MultiSelectCustomizationFieldConstraints, type SingleSelectCustomizationFieldConstraints } from "../../domain/customization-field.ts";
import { validateCustomizationRuleGraph } from "../../domain/customization-validation.ts";
import { createLocalPersistentSupabaseAdapter } from "./local-persistent-supabase-adapter.server.ts";

type ReadResult = { status: "found"; current: Record<string, unknown> | null; history: readonly Record<string, unknown>[]; surchargeRules: readonly Record<string, unknown>[]; surchargeHistory: readonly Record<string, unknown>[] };
type AdminRepository = CustomizationFieldAdminReadRepository & CustomizationFieldAtomicPublicationRepository;

function invalid(message: string): AdminCustomizationFieldWriteResult {
  return { status: "invalid_configuration", issues: [{ path: "$.fields", code: "invalid_value", message }] };
}

function safeHistory(value: unknown, productId: string, projectId: string): ReadResult | null {
  if (!isRecord(value) || value.status !== "found" || !Array.isArray(value.history)
    || !Array.isArray(value.surchargeRules) || !Array.isArray(value.surchargeHistory)
    || (value.current !== null && !isRecord(value.current))) return null;
  const history: Record<string, unknown>[] = [];
  for (const row of value.history) {
    if (!isRecord(row) || row.project_id !== projectId || row.product_id !== productId
      || !Number.isSafeInteger(row.revision) || !isRecord(row.definition)) return null;
    history.push(row);
  }
  const current = value.current;
  const surchargeRules = value.surchargeRules.filter(isRecord);
  const surchargeHistory = value.surchargeHistory.filter(isRecord);
  if (surchargeRules.length !== value.surchargeRules.length || surchargeHistory.length !== value.surchargeHistory.length) return null;
  if (current && (current.project_id !== projectId || current.product_id !== productId
    || current.configuration_status !== "active" || !history.some((row) => row.revision === current.revision))) return null;
  return { status: "found", current, history, surchargeRules, surchargeHistory };
}

function projectSurcharges(result: ReadResult, projectId: string): AdminCustomizationSurchargeRule[] | null {
  const rules: AdminCustomizationSurchargeRule[] = [];
  for (const row of result.surchargeRules) {
    const parsed = parseCustomizationSurchargeRuleRow(row, projectId);
    if (!parsed || row.project_id !== projectId || parsed.configurationRevision !== String(result.current?.revision ?? "")) return null;
    rules.push({ ruleKey: parsed.ruleKey, expectedRevision: parsed.ruleRevision,
      fieldId: parsed.selector.fieldId, amountCents: parsed.amountCents, currency: "USD" });
  }
  return rules;
}

function allHistoricalFields(history: ReadResult["history"], productId: string): CustomizationField[] | null {
  const result: CustomizationField[] = [];
  for (const row of history) {
    const normalized = normalizeAdminCustomizationFieldConfiguration(productId, row.definition);
    if (normalized.status !== "found") return null;
    result.push(...normalized.value.fields);
  }
  return result;
}

function remapPredicate(predicate: CustomizationPredicate, fieldIds: ReadonlyMap<string, string>, choiceIds: ReadonlyMap<string, string>): CustomizationPredicate {
  if (predicate.kind === "all" || predicate.kind === "any") return { ...predicate, predicates: predicate.predicates.map((child) => remapPredicate(child, fieldIds, choiceIds)) };
  if (predicate.kind === "not") return { ...predicate, predicate: remapPredicate(predicate.predicate, fieldIds, choiceIds) };
  return predicate.kind === "field_present"
    ? { ...predicate, fieldId: fieldIds.get(predicate.fieldId) ?? predicate.fieldId }
    : { ...predicate, fieldId: fieldIds.get(predicate.fieldId) ?? predicate.fieldId, choiceId: choiceIds.get(`${predicate.fieldId}:${predicate.choiceId}`) ?? predicate.choiceId };
}

function remapRules(rules: CustomizationFieldRules | undefined, fieldIds: ReadonlyMap<string, string>, choiceIds: ReadonlyMap<string, string>): CustomizationFieldRules | undefined {
  if (!rules) return undefined;
  return {
    ...(rules.requiredWhen ? { requiredWhen: remapPredicate(rules.requiredWhen, fieldIds, choiceIds) } : {}),
    ...(rules.visibleWhen ? { visibleWhen: remapPredicate(rules.visibleWhen, fieldIds, choiceIds) } : {}),
  };
}

/** This repository never consults Admin process memory. Each call verifies the
 * exact local project/marker and uses the same DB as LocalCatalogAuthority. */
export function createLocalPersistentAdminCustomizationRepository(
  environment: RuntimeEnvironment = process.env,
): AdminRepository {
  async function read(productId: string): Promise<ReadResult | "not_found" | null> {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin", "catalog"] });
    if (composition.status !== "ready") return null;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return null;
    const result = await connection.adapter.callRestrictedRpc<unknown>("admin_customization_read", {
      p_project_id: composition.value.projectId,
      p_marker_digest: composition.value.markerDigest,
      p_product_id: productId,
    });
    if (result.status !== "found") return null;
    if (isRecord(result.value) && result.value.status === "not_found") return "not_found";
    return safeHistory(result.value, productId, composition.value.projectId);
  }

  return {
    async getCurrentConfigurationForAdmin(productId): Promise<AdminCustomizationFieldReadResult> {
      const result = await read(productId);
      if (result === "not_found") return { status: "not_found" };
      if (!result) return { status: "source_failure", operation: "admin_customization.read" };
      if (!result.current) return result.surchargeRules.length === 0
        ? { status: "not_configured", surchargeRules: [] }
        : { status: "source_failure", operation: "admin_customization.read" };
      const configuration = normalizeAdminCustomizationFieldConfiguration(productId, result.current.definition);
      const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin", "catalog"] });
      if (composition.status !== "ready") return { status: "source_failure", operation: "admin_customization.read" };
      const surchargeRules = projectSurcharges(result, composition.value.projectId);
      if (!surchargeRules) return { status: "source_failure", operation: "admin_customization.read" };
      return configuration.status === "found"
        ? { status: "found", value: { ...configuration.value, surchargeRules, historicalRevisions: result.history.map((row) => Number(row.revision)) } }
        : { status: "invalid_configuration", issues: configuration.status === "invalid_configuration" ? configuration.issues : [] };
    },
    async getStableFieldIdentitiesForAdmin(productId, stableFieldIds) {
      const result = await read(productId);
      if (!result || result === "not_found") return { status: "source_failure", operation: "admin_customization.identities" };
      const historical = allHistoricalFields(result.history, productId);
      if (!historical) return { status: "source_failure", operation: "admin_customization.identities" };
      const byId = new Map<string, AdminCustomizationStableFieldIdentity>();
      for (const field of historical) {
        const prior = byId.get(field.id);
        if (prior && prior.code !== field.code) return { status: "invalid_configuration", issues: [{ path: "$.fields", code: "invalid_value", message: "Historical field identity was rebound." }] };
        byId.set(field.id, { id: field.id, productId, code: field.code });
      }
      return { status: "found", value: stableFieldIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []) };
    },
    async publishCustomizationConfiguration(intent: ReplaceCustomizationConfigurationIntent, actor: AdminPrincipal): Promise<AdminCustomizationFieldWriteResult> {
      if (actor.role !== "admin" || actor.identity !== "configured-admin") return { status: "source_failure", operation: "admin_customization.write" };
      const result = await read(intent.productId);
      if (result === "not_found") return { status: "not_found" };
      if (!result) return { status: "source_failure", operation: "admin_customization.write" };
      const expected = result.current?.revision ?? null;
      if (String(expected) !== String(intent.expectedCurrentRevision)) return { status: "stale_revision" };
      const previous = allHistoricalFields(result.history, intent.productId);
      if (!previous) return invalid("Historical customization configuration is invalid.");
      const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin", "catalog"] });
      if (composition.status !== "ready") return { status: "source_failure", operation: "admin_customization.write" };
      const currentSurcharges = projectSurcharges(result, composition.value.projectId);
      if (!currentSurcharges || (intent.surchargeRules === undefined && currentSurcharges.length > 0)) return invalid("Explicit current surcharge replacement is required.");
      const currentRules = new Map(currentSurcharges.map((rule) => [rule.ruleKey, rule]));
      const previousById = new Map(previous.map((field) => [field.id, field]));
      const newRevision = Number(expected ?? 0) + 1;
      const fields: CustomizationField[] = [];
      const newFieldIdMappings: Array<{ draftId: string; stableFieldId: string }> = [];
      const fieldIds = new Map<string, string>();
      const choiceIds = new Map<string, string>();
      for (const replacement of intent.fields) {
        const sourceId = replacement.identity.kind === "existing" ? replacement.identity.id : replacement.identity.draftId;
        const stableId = replacement.identity.kind === "existing" ? sourceId : randomUUID();
        fieldIds.set(sourceId, stableId);
        if (replacement.identity.kind === "new") newFieldIdMappings.push({ draftId: sourceId, stableFieldId: stableId });
        if (replacement.kind !== "single_select" && replacement.kind !== "multi_select") continue;
        const known = previous.filter((field) => field.id === stableId && (field.kind === "single_select" || field.kind === "multi_select"))
          .flatMap((field) => (field.constraints as SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints).choices);
        for (const choice of (replacement.constraints as SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints).choices) {
          if (choice.id.startsWith("new:")) {
            if (known.some((old) => old.code === choice.code)) return invalid("Historical choice code cannot be rebound.");
            choiceIds.set(`${sourceId}:${choice.id}`, randomUUID());
          } else if (!known.some((old) => old.id === choice.id && old.code === choice.code)) {
            return invalid("Stable choice identity is unavailable or rebound.");
          }
        }
      }
      for (const replacement of intent.fields) {
        const sourceId = replacement.identity.kind === "existing" ? replacement.identity.id : replacement.identity.draftId;
        const id = fieldIds.get(sourceId)!;
        if (replacement.identity.kind === "existing") {
          const historical = previousById.get(id);
          if (!historical || historical.code !== replacement.identity.code) return invalid("Stable field identity is unavailable.");
        }
        const constraints = replacement.kind === "single_select" || replacement.kind === "multi_select"
          ? { ...replacement.constraints, choices: (replacement.constraints as SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints).choices.map((choice) => ({ ...choice, id: choiceIds.get(`${sourceId}:${choice.id}`) ?? choice.id })) }
          : replacement.constraints;
        const parsed = parseCustomizationField({
          id, productId: intent.productId, code: replacement.identity.code,
          label: replacement.label, kind: replacement.kind, required: replacement.required,
          isActive: replacement.isActive, position: replacement.position,
          configurationRevision: String(newRevision), constraints, rules: remapRules(replacement.rules, fieldIds, choiceIds),
        });
        if (!parsed.ok) return { status: "invalid_configuration", issues: parsed.issues };
        fields.push(parsed.value);
      }
      const graph = validateCustomizationRuleGraph(fields);
      if (!graph.ok) return { status: "invalid_configuration", issues: graph.issues.map((item) => ({ ...item, code: "invalid_value" as const })) };
      const surchargeRules: AdminCustomizationSurchargeRule[] = [];
      for (const rule of intent.surchargeRules ?? []) {
        const current = currentRules.get(rule.ruleKey);
        if (rule.ruleKey.startsWith("new:")) {
          if (rule.expectedRevision !== null) return invalid("New surcharge cannot claim a revision.");
        } else if (!current || current.expectedRevision !== rule.expectedRevision) {
          return { status: "stale_revision" };
        }
        const stableFieldId = fieldIds.get(rule.fieldId);
        const target = fields.find((field) => field.id === stableFieldId);
        if (!target || !target.isActive || !["image", "short_text", "long_text", "single_select", "multi_select", "numeric", "generic_file"].includes(target.kind)) return invalid("Surcharge field is unavailable.");
        surchargeRules.push({ ...rule, fieldId: stableFieldId!, ruleKey: rule.ruleKey.startsWith("new:") ? `customization-surcharge-${randomUUID()}` : rule.ruleKey });
      }
      const connection = await createLocalPersistentSupabaseAdapter(environment);
      if (connection.status !== "ready") return { status: "source_failure", operation: "admin_customization.write" };
      const published = await connection.adapter.callRestrictedRpc<unknown>("admin_customization_publish", {
        p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
        p_product_id: intent.productId, p_expected_revision: expected as number | null,
        p_actor_id: actor.identity, p_fields: fields, p_surcharges: surchargeRules, p_restored_from_revision: null,
      });
      if (published.status !== "found" || !isRecord(published.value)) return { status: "source_failure", operation: "admin_customization.write" };
      if (published.value.status === "stale_revision") return { status: "stale_revision" };
      if (published.value.status === "not_found") return { status: "not_found" };
      if (published.value.status === "invalid_configuration") return invalid("Persistent customization publication was rejected.");
      if (published.value.status !== "applied") return { status: "source_failure", operation: "admin_customization.write" };
      const configuration = normalizeAdminCustomizationFieldConfiguration(intent.productId, published.value.configuration);
      if (configuration.status !== "found" || configuration.value.configurationRevision !== String(newRevision)) return { status: "source_failure", operation: "admin_customization.write" };
      return { status: "applied", value: { ...configuration.value,
        surchargeRules: surchargeRules.map((rule) => ({ ...rule, expectedRevision: (rule.expectedRevision ?? 0) + 1 })),
        historicalRevisions: [...result.history.map((row) => Number(row.revision)), newRevision] }, newFieldIdMappings };
    },
    async restoreCustomizationConfiguration(intent: RestoreCustomizationConfigurationIntent, actor: AdminPrincipal): Promise<AdminCustomizationFieldWriteResult> {
      if (actor.role !== "admin" || actor.identity !== "configured-admin") return { status: "source_failure", operation: "admin_customization.restore" };
      const result = await read(intent.productId);
      if (result === "not_found") return { status: "not_found" };
      if (!result) return { status: "source_failure", operation: "admin_customization.restore" };
      if (!result.current || String(result.current.revision) !== intent.expectedCurrentRevision) return { status: "stale_revision" };
      const source = result.history.find((row) => row.revision === intent.restoreFromRevision);
      if (!source) return invalid("Historical revision is unavailable.");
      const historical = normalizeAdminCustomizationFieldConfiguration(intent.productId, source.definition);
      if (historical.status !== "found") return invalid("Historical revision no longer passes approved validation.");
      const nextRevision = Number(result.current.revision) + 1;
      const fields: CustomizationField[] = [];
      for (const field of historical.value.fields) {
        const parsed = parseCustomizationField({ ...field, configurationRevision: String(nextRevision) });
        if (!parsed.ok) return { status: "invalid_configuration", issues: parsed.issues };
        fields.push(parsed.value);
      }
      const graph = validateCustomizationRuleGraph(fields);
      if (!graph.ok) return { status: "invalid_configuration", issues: graph.issues.map((entry) => ({ ...entry, code: "invalid_value" as const })) };
      const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin", "catalog"] });
      if (composition.status !== "ready") return { status: "source_failure", operation: "admin_customization.restore" };
      const active = projectSurcharges(result, composition.value.projectId);
      if (!active) return { status: "source_failure", operation: "admin_customization.restore" };
      const activeByKey = new Map(active.map((rule) => [rule.ruleKey, rule]));
      const surcharges: AdminCustomizationSurchargeRule[] = [];
      const keys = new Set<string>();
      const selectors = new Set<string>();
      for (const row of result.surchargeHistory) {
        if (row.project_id !== composition.value.projectId || !isRecord(row.definition)) return invalid("Historical surcharge authority is invalid.");
        const definition = row.definition;
        if (definition.configurationRevision !== String(intent.restoreFromRevision)) continue;
        if (definition.kind !== "customization_surcharge" || definition.productId !== intent.productId
          || definition.currency !== "USD" || !Number.isSafeInteger(definition.amountCents)
          || Number(definition.amountCents) < 0 || Number(definition.amountCents) > 2_147_483_647
          || !isRecord(definition.selector) || definition.selector.kind !== "field_present"
          || typeof definition.selector.fieldId !== "string" || typeof row.rule_key !== "string"
          || keys.has(row.rule_key) || selectors.has(definition.selector.fieldId)) return invalid("Historical surcharge authority is ambiguous.");
        const selector = definition.selector as Record<string, unknown>;
        const target = fields.find((field) => field.id === selector.fieldId);
        if (!target || !target.isActive || !["image", "short_text", "long_text", "single_select", "multi_select", "numeric", "generic_file"].includes(target.kind)) return invalid("Historical surcharge no longer satisfies the current contract.");
        keys.add(row.rule_key);
        selectors.add(selector.fieldId as string);
        surcharges.push({ ruleKey: row.rule_key, expectedRevision: activeByKey.get(row.rule_key)?.expectedRevision ?? null,
          fieldId: selector.fieldId as string, amountCents: Number(definition.amountCents), currency: "USD" });
      }
      const connection = await createLocalPersistentSupabaseAdapter(environment);
      if (connection.status !== "ready") return { status: "source_failure", operation: "admin_customization.restore" };
      const published = await connection.adapter.callRestrictedRpc<unknown>("admin_customization_publish", {
        p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
        p_product_id: intent.productId, p_expected_revision: Number(result.current.revision),
        p_actor_id: actor.identity, p_fields: fields, p_surcharges: surcharges,
        p_restored_from_revision: intent.restoreFromRevision,
      });
      if (published.status !== "found" || !isRecord(published.value)) return { status: "source_failure", operation: "admin_customization.restore" };
      if (published.value.status === "stale_revision") return { status: "stale_revision" };
      if (published.value.status === "invalid_configuration") return invalid("Historical restoration was rejected.");
      if (published.value.status !== "applied") return { status: "source_failure", operation: "admin_customization.restore" };
      const configuration = normalizeAdminCustomizationFieldConfiguration(intent.productId, published.value.configuration);
      if (configuration.status !== "found" || configuration.value.configurationRevision !== String(nextRevision)) return { status: "source_failure", operation: "admin_customization.restore" };
      return { status: "applied", value: { ...configuration.value,
        surchargeRules: surcharges.map((rule) => ({ ...rule, expectedRevision: (rule.expectedRevision ?? 0) + 1 })),
        historicalRevisions: [...result.history.map((row) => Number(row.revision)), nextRevision] }, newFieldIdMappings: [] };
    },
  };
}
