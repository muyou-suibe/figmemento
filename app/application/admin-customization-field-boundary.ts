import {
  isCode,
  isIdentifier,
  isRecord,
  unknownFieldIssues,
  validationIssue,
  type CatalogValidationIssue,
} from "../domain/catalog/validation.ts";
import {
  parseCustomizationFieldDefinition,
  type CustomizationField,
  type CustomizationFieldDefinition,
} from "../domain/customization-field.ts";
import { validateCustomizationRuleGraph } from "../domain/customization-validation.ts";
import type {
  AdminAuthorizationResult,
  AdminPrincipal,
  AdminSessionVerifier,
  SafeCatalogValidationIssue,
} from "./admin-catalog-boundary.ts";
import {
  adminAcceptanceConfigurationIssue,
  isAdminAcceptanceConfigurationError,
} from "../config/admin-acceptance-runtime.server.ts";

export interface AdminCustomizationFieldConfiguration {
  productId: string;
  configurationRevision: string;
  fields: readonly CustomizationField[];
  surchargeRules?: readonly AdminCustomizationSurchargeRule[];
  historicalRevisions?: readonly number[];
}

export interface RestoreCustomizationConfigurationIntent {
  productId: string;
  expectedCurrentRevision: string;
  restoreFromRevision: number;
}

export interface AdminCustomizationSurchargeRule {
  ruleKey: string;
  expectedRevision: number | null;
  fieldId: string;
  amountCents: number;
  currency: "USD";
}

export interface AdminCustomizationStableFieldIdentity {
  id: string;
  productId: string;
  code: string;
}

export type AdminCustomizationFieldReadResult =
  | { status: "found"; value: AdminCustomizationFieldConfiguration }
  | { status: "not_configured"; surchargeRules?: readonly AdminCustomizationSurchargeRule[] }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: string };

export type AdminCustomizationIdentityReadResult =
  | { status: "found"; value: readonly AdminCustomizationStableFieldIdentity[] }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: string };

export interface CustomizationFieldAdminReadRepository {
  getCurrentConfigurationForAdmin(productId: string): Promise<AdminCustomizationFieldReadResult>;
  getStableFieldIdentitiesForAdmin(
    productId: string,
    stableFieldIds: readonly string[],
  ): Promise<AdminCustomizationIdentityReadResult>;
}

export type AdminCustomizationFieldIdentityIntent =
  | { kind: "existing"; id: string; code: string }
  | { kind: "new"; draftId: string; code: string };

export interface AdminCustomizationFieldReplacement extends Omit<CustomizationFieldDefinition, "code"> {
  identity: AdminCustomizationFieldIdentityIntent;
}

export interface ReplaceCustomizationConfigurationIntent {
  productId: string;
  expectedCurrentRevision: string | null;
  fields: readonly AdminCustomizationFieldReplacement[];
  surchargeRules?: readonly AdminCustomizationSurchargeRule[];
}

/**
 * A request-local draft correlation token reconciled with the stable identity
 * allocated by the atomic publication primitive. It is not a definition-row
 * ID and it is never persisted as browser authority.
 */
export interface AdminCustomizationNewFieldIdMapping {
  draftId: string;
  stableFieldId: string;
}

export type AdminCustomizationFieldWriteResult =
  | {
      status: "applied";
      value: AdminCustomizationFieldConfiguration;
      newFieldIdMappings: readonly AdminCustomizationNewFieldIdMapping[];
    }
  | { status: "not_found" }
  | { status: "stale_revision" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: string };

/**
 * The concrete persistence implementation must publish the entire new revision
 * atomically. It owns server-side stable-ID allocation for `kind: "new"`.
 */
export interface CustomizationFieldAtomicPublicationRepository {
  publishCustomizationConfiguration(
    intent: ReplaceCustomizationConfigurationIntent,
    actor: AdminPrincipal,
  ): Promise<AdminCustomizationFieldWriteResult>;
  restoreCustomizationConfiguration?(
    intent: RestoreCustomizationConfigurationIntent,
    actor: AdminPrincipal,
  ): Promise<AdminCustomizationFieldWriteResult>;
}

export interface PrivilegedAdminCustomizationFieldRepositories {
  reader: CustomizationFieldAdminReadRepository;
  writer: CustomizationFieldAtomicPublicationRepository;
}

export type AdminCustomizationReadModel =
  | {
      status: "configured";
      productId: string;
      configurationRevision: string;
      fields: readonly CustomizationField[];
      surchargeRules?: readonly AdminCustomizationSurchargeRule[];
      historicalRevisions?: readonly number[];
    }
  | { status: "not_configured"; productId: string; surchargeRules?: readonly AdminCustomizationSurchargeRule[] };

export type AdminCustomizationFieldBoundaryResult<T> =
  | { status: "found"; value: T; principal: AdminPrincipal }
  | {
      status: "applied";
      value: T;
      newFieldIdMappings: readonly AdminCustomizationNewFieldIdMapping[];
      principal: AdminPrincipal;
    }
  | { status: "unauthorized" }
  | { status: "authentication_failure" }
  | { status: "invalid_request"; issues: readonly SafeCatalogValidationIssue[] }
  | { status: "stale_revision" }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly SafeCatalogValidationIssue[] }
  | { status: "source_failure"; operation: "admin_customization_field_query" | "admin_customization_field_command" };

const NEW_DRAFT_ID_PATTERN = /^new:[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;

function safeIssues(issues: readonly CatalogValidationIssue[]): readonly SafeCatalogValidationIssue[] {
  return issues.map(({ path, code, message }) => ({ path, code, message }));
}

function prefixIssues(
  issues: readonly CatalogValidationIssue[],
  prefix: string,
): readonly CatalogValidationIssue[] {
  return issues.map((entry) => ({
    ...entry,
    path: entry.path === "$" ? prefix : `${prefix}${entry.path.slice(1)}`,
  }));
}

async function authorize(
  verifier: AdminSessionVerifier,
): Promise<AdminAuthorizationResult | { status: "authentication_failure" }> {
  try {
    return await verifier.verifyAdminSession();
  } catch {
    return { status: "authentication_failure" };
  }
}

function parseAdminProductQuery(
  value: unknown,
): { ok: true; productId: string } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return { ok: false, issues: [validationIssue("$", "invalid_type", "Customization admin query must be an object.")] };
  }
  const issues = unknownFieldIssues(value, ["productId"]);
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, productId: value.productId as string };
}

function parseIdentity(
  value: unknown,
  path: string,
): { ok: true; value: AdminCustomizationFieldIdentityIntent } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return { ok: false, issues: [validationIssue(path, "invalid_type", "Field identity must be an object.")] };
  }
  const kind = value.kind;
  const allowed = kind === "existing" ? ["kind", "id", "code"] : kind === "new" ? ["kind", "draftId", "code"] : ["kind"];
  const issues = unknownFieldIssues(value, allowed, path);
  if (kind !== "existing" && kind !== "new") {
    issues.push(validationIssue(`${path}.kind`, "invalid_value", "Field identity kind must be existing or new."));
  }
  if (!isCode(value.code)) {
    issues.push(validationIssue(`${path}.code`, "invalid_format", "Field code is invalid."));
  }
  if (kind === "existing" && !isIdentifier(value.id)) {
    issues.push(validationIssue(`${path}.id`, "invalid_format", "Existing stable field ID is invalid."));
  }
  if (kind === "new" && (typeof value.draftId !== "string" || !NEW_DRAFT_ID_PATTERN.test(value.draftId))) {
    issues.push(validationIssue(`${path}.draftId`, "invalid_format", "New fields require a temporary new: draft ID."));
  }
  if (issues.length > 0 || !isCode(value.code)) return { ok: false, issues };
  return kind === "existing"
    ? { ok: true, value: { kind, id: value.id as string, code: value.code } }
    : { ok: true, value: { kind: "new", draftId: value.draftId as string, code: value.code } };
}

export function parseReplaceCustomizationConfigurationIntent(
  value: unknown,
): { ok: true; value: ReplaceCustomizationConfigurationIntent } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return { ok: false, issues: [validationIssue("$", "invalid_type", "Customization configuration replacement must be an object.")] };
  }
  const issues = unknownFieldIssues(value, ["productId", "expectedCurrentRevision", "fields", "surchargeRules"]);
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (value.expectedCurrentRevision !== null && !isIdentifier(value.expectedCurrentRevision)) {
    issues.push(validationIssue("$.expectedCurrentRevision", "invalid_format", "Expected configuration revision is invalid."));
  }
  if (!Array.isArray(value.fields)) {
    issues.push(validationIssue("$.fields", "invalid_type", "Replacement fields must be an array."));
  }
  if (issues.length > 0 || !Array.isArray(value.fields) || !isIdentifier(value.productId)) {
    return { ok: false, issues };
  }

  const fields: AdminCustomizationFieldReplacement[] = [];
  const codes = new Set<string>();
  const positions = new Set<number>();
  const existingIds = new Set<string>();
  const newDraftIds = new Set<string>();
  value.fields.forEach((candidate, index) => {
    const path = `$.fields[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(validationIssue(path, "invalid_type", "Replacement field must be an object."));
      return;
    }
    issues.push(...unknownFieldIssues(candidate, ["identity", "label", "kind", "required", "isActive", "position", "constraints", "rules"], path));
    const identity = parseIdentity(candidate.identity, `${path}.identity`);
    if (!identity.ok) issues.push(...identity.issues);
    const definition = parseCustomizationFieldDefinition({
      code: isRecord(candidate.identity) ? candidate.identity.code : undefined,
      label: candidate.label,
      kind: candidate.kind,
      required: candidate.required,
      isActive: candidate.isActive,
      position: candidate.position,
      constraints: candidate.constraints,
      rules: candidate.rules,
    });
    if (!definition.ok) issues.push(...prefixIssues(definition.issues, path));
    if (!identity.ok || !definition.ok) return;
    if (codes.has(definition.value.code)) {
      issues.push(validationIssue(`${path}.identity.code`, "duplicate", "Field codes must be unique within a Product."));
    }
    if (positions.has(definition.value.position)) {
      issues.push(validationIssue(`${path}.position`, "duplicate", "Field positions must be unique within a configuration."));
    }
    if (identity.value.kind === "existing" && existingIds.has(identity.value.id)) {
      issues.push(validationIssue(`${path}.identity.id`, "duplicate", "Existing stable field IDs may appear only once."));
    }
    if (identity.value.kind === "new" && newDraftIds.has(identity.value.draftId)) {
      issues.push(validationIssue(`${path}.identity.draftId`, "duplicate", "New field draft IDs may appear only once."));
    }
    codes.add(definition.value.code);
    positions.add(definition.value.position);
    if (identity.value.kind === "existing") existingIds.add(identity.value.id);
    else newDraftIds.add(identity.value.draftId);
    fields.push({ ...definition.value, identity: identity.value });
  });
  const surchargeRules: AdminCustomizationSurchargeRule[] = [];
  if (value.surchargeRules !== undefined) {
    if (!Array.isArray(value.surchargeRules) || value.surchargeRules.length > 100) {
      issues.push(validationIssue("$.surchargeRules", "invalid_value", "Surcharge replacement must be a bounded array."));
    } else {
      const ruleKeys = new Set<string>();
      const selectors = new Set<string>();
      value.surchargeRules.forEach((candidate, index) => {
        const path = `$.surchargeRules[${index}]`;
        if (!isRecord(candidate)) { issues.push(validationIssue(path, "invalid_type", "Surcharge must be an object.")); return; }
        issues.push(...unknownFieldIssues(candidate, ["ruleKey", "expectedRevision", "fieldId", "amountCents", "currency"], path));
        if (!isIdentifier(candidate.ruleKey) || !isIdentifier(candidate.fieldId)
          || candidate.currency !== "USD" || !Number.isSafeInteger(candidate.amountCents)
          || Number(candidate.amountCents) < 0 || Number(candidate.amountCents) > 2_147_483_647
          || (candidate.expectedRevision !== null && (!Number.isSafeInteger(candidate.expectedRevision) || Number(candidate.expectedRevision) < 1))) {
          issues.push(validationIssue(path, "invalid_value", "Surcharge must be fixed USD cents on one approved field.")); return;
        }
        const target = fields.find((field) => (field.identity.kind === "existing" ? field.identity.id : field.identity.draftId) === candidate.fieldId);
        if (!target || !target.isActive || !["image", "short_text", "long_text", "single_select", "multi_select", "numeric", "generic_file"].includes(target.kind)
          || ruleKeys.has(candidate.ruleKey) || selectors.has(candidate.fieldId)) {
          issues.push(validationIssue(path, "invalid_value", "Surcharge selector or rule identity is invalid.")); return;
        }
        ruleKeys.add(candidate.ruleKey as string);
        selectors.add(candidate.fieldId as string);
        surchargeRules.push(candidate as unknown as AdminCustomizationSurchargeRule);
      });
    }
  }
  if (issues.length === 0) {
    const graph = validateCustomizationRuleGraph(fields.map((field) => ({
      ...field,
      id: field.identity.kind === "existing" ? field.identity.id : field.identity.draftId,
      code: field.identity.code,
      productId: value.productId as string,
      configurationRevision: "pending-publication",
    })) as CustomizationField[]);
    if (!graph.ok) issues.push(...graph.issues.map((entry) => validationIssue(entry.path, "invalid_value", entry.message)));
  }
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          productId: value.productId,
          expectedCurrentRevision: value.expectedCurrentRevision as string | null,
          fields,
          ...(value.surchargeRules !== undefined ? { surchargeRules } : {}),
        },
      };
}

export function parseRestoreCustomizationConfigurationIntent(value: unknown):
  { ok: true; value: RestoreCustomizationConfigurationIntent } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) return { ok: false, issues: [validationIssue("$", "invalid_type", "Restore request must be an object.")] };
  const issues = unknownFieldIssues(value, ["productId", "expectedCurrentRevision", "restoreFromRevision"]);
  if (!isIdentifier(value.productId)) issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  if (!isIdentifier(value.expectedCurrentRevision)) issues.push(validationIssue("$.expectedCurrentRevision", "invalid_format", "Current revision is required."));
  if (!Number.isSafeInteger(value.restoreFromRevision) || Number(value.restoreFromRevision) < 1) issues.push(validationIssue("$.restoreFromRevision", "invalid_value", "Historical revision is invalid."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as RestoreCustomizationConfigurationIntent };
}

export class AdminCustomizationFieldRestoreBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminCustomizationFieldRepositories;
  constructor(verifier: AdminSessionVerifier, createRepositories: () => PrivilegedAdminCustomizationFieldRepositories) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
  }

  async execute(request: unknown): Promise<AdminCustomizationFieldBoundaryResult<AdminCustomizationFieldConfiguration>> {
    const authorization = await authorize(this.verifier);
    if (authorization.status !== "authorized") return authorization;
    const parsed = parseRestoreCustomizationConfigurationIntent(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    try {
      const writer = this.createRepositories().writer;
      if (!writer.restoreCustomizationConfiguration) return { status: "source_failure", operation: "admin_customization_field_command" };
      const saved = await writer.restoreCustomizationConfiguration(parsed.value, authorization.principal);
      if (saved.status !== "applied") return writeFailure(saved);
      if (saved.value.productId !== parsed.value.productId) return { status: "source_failure", operation: "admin_customization_field_command" };
      return { status: "applied", value: saved.value, newFieldIdMappings: saved.newFieldIdMappings, principal: authorization.principal };
    } catch {
      return { status: "source_failure", operation: "admin_customization_field_command" };
    }
  }
}

function readFailure(
  result: Exclude<AdminCustomizationFieldReadResult, { status: "found" | "not_configured" }>,
  operation: "admin_customization_field_query" | "admin_customization_field_command",
): AdminCustomizationFieldBoundaryResult<never> {
  switch (result.status) {
    case "not_found": return { status: "not_found" };
    case "invalid_configuration": return { status: "invalid_configuration", issues: safeIssues(result.issues) };
    case "source_failure": return { status: "source_failure", operation };
  }
}

function identityReadFailure(
  result: Exclude<AdminCustomizationIdentityReadResult, { status: "found" }>,
): AdminCustomizationFieldBoundaryResult<never> {
  return result.status === "invalid_configuration"
    ? { status: "invalid_configuration", issues: safeIssues(result.issues) }
    : { status: "source_failure", operation: "admin_customization_field_command" };
}

function currentRevisionMatches(
  expected: string | null,
  current: AdminCustomizationFieldReadResult,
): boolean {
  return current.status === "found"
    ? expected === current.value.configurationRevision
    : current.status === "not_configured" && expected === null;
}

function validateExistingIdentityOwnership(
  intent: ReplaceCustomizationConfigurationIntent,
  identities: readonly AdminCustomizationStableFieldIdentity[],
): readonly CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  const byId = new Map<string, AdminCustomizationStableFieldIdentity>();
  for (const identity of identities) {
    if (!isIdentifier(identity.id) || !isIdentifier(identity.productId) || typeof identity.code !== "string") {
      issues.push(validationIssue("$.stableFieldIdentities", "invalid_value", "Stable field identity data is malformed."));
      continue;
    }
    if (byId.has(identity.id)) {
      issues.push(validationIssue("$.stableFieldIdentities", "duplicate", "Stable field identity data is ambiguous."));
      continue;
    }
    byId.set(identity.id, identity);
  }
  intent.fields.forEach((field, index) => {
    if (field.identity.kind !== "existing") return;
    const persisted = byId.get(field.identity.id);
    if (!persisted || persisted.productId !== intent.productId) {
      issues.push(validationIssue(`$.fields[${index}].identity.id`, "ownership", "Stable field identity belongs to another Product or is unavailable."));
    } else if (persisted.code !== field.identity.code) {
      issues.push(validationIssue(`$.fields[${index}].identity.code`, "invalid_value", "Stable field codes are immutable."));
    }
  });
  return issues;
}

function writeFailure(
  result: Exclude<AdminCustomizationFieldWriteResult, { status: "applied" }>,
): AdminCustomizationFieldBoundaryResult<never> {
  switch (result.status) {
    case "not_found": return { status: "not_found" };
    case "stale_revision": return { status: "stale_revision" };
    case "invalid_configuration": return { status: "invalid_configuration", issues: safeIssues(result.issues) };
    case "source_failure": return { status: "source_failure", operation: "admin_customization_field_command" };
  }
}

export class AdminCustomizationFieldQueryBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createReader: () => CustomizationFieldAdminReadRepository;

  constructor(
    verifier: AdminSessionVerifier,
    createReader: () => CustomizationFieldAdminReadRepository,
  ) {
    this.verifier = verifier;
    this.createReader = createReader;
  }

  async execute(request: unknown): Promise<AdminCustomizationFieldBoundaryResult<AdminCustomizationReadModel>> {
    const authorization = await authorize(this.verifier);
    if (authorization.status !== "authorized") return authorization;
    const parsed = parseAdminProductQuery(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    try {
      const result = await this.createReader().getCurrentConfigurationForAdmin(parsed.productId);
      if (result.status === "found") {
        if (result.value.productId !== parsed.productId) {
          return { status: "invalid_configuration", issues: safeIssues([validationIssue("$.productId", "ownership", "Customization configuration belongs to another Product.")]) };
        }
        return { status: "found", principal: authorization.principal, value: { status: "configured", ...result.value } };
      }
      if (result.status === "not_configured") {
        return { status: "found", principal: authorization.principal, value: { status: "not_configured", productId: parsed.productId, ...(result.surchargeRules ? { surchargeRules: result.surchargeRules } : {}) } };
      }
      return readFailure(result, "admin_customization_field_query");
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_customization_field_query" };
    }
  }
}

export class AdminCustomizationFieldCommandBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminCustomizationFieldRepositories;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: () => PrivilegedAdminCustomizationFieldRepositories,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
  }

  async execute(
    request: unknown,
  ): Promise<AdminCustomizationFieldBoundaryResult<AdminCustomizationFieldConfiguration>> {
    const authorization = await authorize(this.verifier);
    if (authorization.status !== "authorized") return authorization;
    const parsed = parseReplaceCustomizationConfigurationIntent(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };

    try {
      const repositories = this.createRepositories();
      const current = await repositories.reader.getCurrentConfigurationForAdmin(parsed.value.productId);
      if (current.status !== "found" && current.status !== "not_configured") {
        return readFailure(current, "admin_customization_field_command");
      }
      if (current.status === "found" && current.value.productId !== parsed.value.productId) {
        return {
          status: "invalid_configuration",
          issues: safeIssues([
            validationIssue("$.productId", "ownership", "Customization configuration belongs to another Product."),
          ]),
        };
      }
      if (!currentRevisionMatches(parsed.value.expectedCurrentRevision, current)) {
        return { status: "stale_revision" };
      }
      const existingIds = parsed.value.fields.flatMap((field) =>
        field.identity.kind === "existing" ? [field.identity.id] : []
      );
      const identities = await repositories.reader.getStableFieldIdentitiesForAdmin(
        parsed.value.productId,
        existingIds,
      );
      if (identities.status !== "found") return identityReadFailure(identities);
      const ownershipIssues = validateExistingIdentityOwnership(parsed.value, identities.value);
      if (ownershipIssues.length > 0) return { status: "invalid_request", issues: safeIssues(ownershipIssues) };

      const saved = await repositories.writer.publishCustomizationConfiguration(parsed.value, authorization.principal);
      if (saved.status !== "applied") return writeFailure(saved);
      if (saved.value.productId !== parsed.value.productId) {
        return {
          status: "invalid_configuration",
          issues: safeIssues([
            validationIssue("$.productId", "ownership", "Published configuration belongs to another Product."),
          ]),
        };
      }
      return {
        status: "applied",
        value: saved.value,
        newFieldIdMappings: saved.newFieldIdMappings,
        principal: authorization.principal,
      };
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_customization_field_command" };
    }
  }
}
