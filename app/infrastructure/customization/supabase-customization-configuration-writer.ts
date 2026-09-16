import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCustomizationFieldConfiguration,
  AdminCustomizationFieldReplacement,
  AdminCustomizationFieldWriteResult,
  AdminCustomizationNewFieldIdMapping,
  CustomizationFieldAtomicPublicationRepository,
  ReplaceCustomizationConfigurationIntent,
} from "../../application/admin-customization-field-boundary.ts";
import {
  isIdentifier,
  isRecord,
  type CatalogValidationCode,
  type CatalogValidationIssue,
} from "../../domain/catalog/validation.ts";
import {
  parseCustomizationField,
  type CustomizationField,
} from "../../domain/customization-field.ts";

export const PUBLISH_CUSTOMIZATION_CONFIGURATION_RPC =
  "publish_product_customization_configuration" as const;

export interface PublishCustomizationConfigurationRpcArguments {
  p_product_id: string;
  p_expected_current_revision_id: string | null;
  p_fields: readonly AdminCustomizationFieldReplacement[];
}

export interface SupabaseCustomizationConfigurationRpcResult {
  data: unknown;
  error: unknown;
}

/** A narrow injected capability keeps adapter tests offline. */
export interface CustomizationConfigurationRpcClient {
  publishCustomizationConfiguration(
    arguments_: PublishCustomizationConfigurationRpcArguments,
  ): Promise<SupabaseCustomizationConfigurationRpcResult>;
}

const VALIDATION_CODES: readonly CatalogValidationCode[] = [
  "duplicate",
  "incomplete",
  "invalid_format",
  "invalid_type",
  "invalid_value",
  "ownership",
  "required",
  "unavailable",
  "unknown_field",
];

function sourceFailure(): AdminCustomizationFieldWriteResult {
  return { status: "source_failure", operation: "admin_customization_field_command" };
}

function fieldsMatch(
  returned: CustomizationField,
  submitted: AdminCustomizationFieldReplacement,
): boolean {
  return returned.code === submitted.identity.code
    && returned.label === submitted.label
    && returned.kind === submitted.kind
    && returned.required === submitted.required
    && returned.isActive === submitted.isActive
    && returned.position === submitted.position
    && JSON.stringify(returned.constraints) === JSON.stringify(submitted.constraints);
}

function parseAppliedConfiguration(
  value: unknown,
  intent: ReplaceCustomizationConfigurationIntent,
): AdminCustomizationFieldConfiguration | null {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !["productId", "configurationRevision", "fields"].includes(key))
    || value.productId !== intent.productId
    || !isIdentifier(value.configurationRevision)
    || !Array.isArray(value.fields)) {
    return null;
  }

  const fields: CustomizationField[] = [];
  const byPosition = new Map(intent.fields.map((field) => [field.position, field]));
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const seenPositions = new Set<number>();

  for (const candidate of value.fields) {
    const parsed = parseCustomizationField(candidate);
    if (!parsed.ok
      || parsed.value.productId !== intent.productId
      || parsed.value.configurationRevision !== value.configurationRevision
      || seenIds.has(parsed.value.id)
      || seenCodes.has(parsed.value.code)
      || seenPositions.has(parsed.value.position)) {
      return null;
    }
    const submitted = byPosition.get(parsed.value.position);
    if (!submitted || !fieldsMatch(parsed.value, submitted)) return null;
    if (submitted.identity.kind === "existing" && parsed.value.id !== submitted.identity.id) return null;
    seenIds.add(parsed.value.id);
    seenCodes.add(parsed.value.code);
    seenPositions.add(parsed.value.position);
    fields.push(parsed.value);
  }

  if (fields.length !== intent.fields.length || fields.length !== byPosition.size) return null;
  return {
    productId: intent.productId,
    configurationRevision: value.configurationRevision,
    fields: fields.toSorted((left, right) => left.position - right.position),
  };
}

function parseSafeIssues(value: unknown): readonly CatalogValidationIssue[] | null {
  if (!Array.isArray(value)) return null;
  const issues: CatalogValidationIssue[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)
      || Object.keys(candidate).some((key) => !["path", "code", "message"].includes(key))
      || typeof candidate.path !== "string"
      || typeof candidate.message !== "string"
      || !VALIDATION_CODES.includes(candidate.code as CatalogValidationCode)) {
      return null;
    }
    issues.push({
      path: candidate.path,
      code: candidate.code as CatalogValidationCode,
      message: candidate.message,
    });
  }
  return issues;
}

function parseNewFieldIdMappings(
  value: unknown,
  intent: ReplaceCustomizationConfigurationIntent,
  configuration: AdminCustomizationFieldConfiguration,
): readonly AdminCustomizationNewFieldIdMapping[] | null {
  if (!Array.isArray(value)) return null;
  const expected = intent.fields
    .filter((field): field is AdminCustomizationFieldReplacement & {
      identity: Extract<AdminCustomizationFieldReplacement["identity"], { kind: "new" }>;
    } => field.identity.kind === "new")
    .toSorted((left, right) => left.position - right.position);
  if (value.length !== expected.length) return null;

  const configurationById = new Map(configuration.fields.map((field) => [field.id, field]));
  const existingIds = new Set(intent.fields.flatMap((field) =>
    field.identity.kind === "existing" ? [field.identity.id] : []
  ));
  const stableIds = new Set<string>();
  const mappings: AdminCustomizationNewFieldIdMapping[] = [];
  for (const [index, candidate] of value.entries()) {
    const submitted = expected[index];
    if (!isRecord(candidate)
      || Object.keys(candidate).some((key) => !["draftId", "stableFieldId"].includes(key))
      || candidate.draftId !== submitted.identity.draftId
      || !isIdentifier(candidate.stableFieldId)
      || stableIds.has(candidate.stableFieldId)
      || existingIds.has(candidate.stableFieldId)) {
      return null;
    }
    const field = configurationById.get(candidate.stableFieldId);
    if (!field || field.code !== submitted.identity.code) return null;
    stableIds.add(candidate.stableFieldId);
    mappings.push({
      draftId: candidate.draftId as string,
      stableFieldId: candidate.stableFieldId,
    });
  }
  return mappings;
}

function mapRpcResult(
  result: SupabaseCustomizationConfigurationRpcResult,
  intent: ReplaceCustomizationConfigurationIntent,
): AdminCustomizationFieldWriteResult {
  if (result.error || !isRecord(result.data)
    || Object.keys(result.data).some((key) => ![
      "result_status",
      "product_id",
      "configuration_revision_id",
      "configuration",
      "new_field_id_mappings",
      "safe_issues",
    ].includes(key))
    || typeof result.data.result_status !== "string") {
    return sourceFailure();
  }

  switch (result.data.result_status) {
    case "not_found":
      return result.data.product_id === intent.productId
        ? { status: "not_found" }
        : sourceFailure();
    case "stale_revision":
      return result.data.product_id === intent.productId
        ? { status: "stale_revision" }
        : sourceFailure();
    case "invalid_configuration": {
      const issues = parseSafeIssues(result.data.safe_issues);
      return issues ? { status: "invalid_configuration", issues } : sourceFailure();
    }
    case "applied": {
      if (result.data.product_id !== intent.productId
        || result.data.configuration_revision_id === null
        || result.data.configuration_revision_id === undefined) return sourceFailure();
      const configuration = parseAppliedConfiguration(result.data.configuration, intent);
      if (!configuration || configuration.configurationRevision !== result.data.configuration_revision_id) {
        return sourceFailure();
      }
      const newFieldIdMappings = parseNewFieldIdMappings(
        result.data.new_field_id_mappings,
        intent,
        configuration,
      );
      return newFieldIdMappings
        ? { status: "applied", value: configuration, newFieldIdMappings }
        : sourceFailure();
    }
    default:
      return sourceFailure();
  }
}

function toRpcArguments(
  intent: ReplaceCustomizationConfigurationIntent,
): PublishCustomizationConfigurationRpcArguments {
  return {
    p_product_id: intent.productId,
    p_expected_current_revision_id: intent.expectedCurrentRevision,
    p_fields: intent.fields,
  };
}

/**
 * Server-side concrete implementation of the provider-neutral atomic writer
 * port. It performs one RPC only; database transaction ownership remains in
 * the approved publication primitive.
 */
export class SupabaseCustomizationConfigurationWriter
  implements CustomizationFieldAtomicPublicationRepository
{
  private readonly client: CustomizationConfigurationRpcClient;

  constructor(client: CustomizationConfigurationRpcClient) {
    this.client = client;
  }

  static fromClient(client: SupabaseClient): SupabaseCustomizationConfigurationWriter {
    return new SupabaseCustomizationConfigurationWriter({
      async publishCustomizationConfiguration(arguments_) {
        return await client
          .rpc(PUBLISH_CUSTOMIZATION_CONFIGURATION_RPC, arguments_)
          .maybeSingle();
      },
    });
  }

  async publishCustomizationConfiguration(
    intent: ReplaceCustomizationConfigurationIntent,
  ): Promise<AdminCustomizationFieldWriteResult> {
    try {
      return mapRpcResult(
        await this.client.publishCustomizationConfiguration(toRpcArguments(intent)),
        intent,
      );
    } catch {
      return sourceFailure();
    }
  }
}
