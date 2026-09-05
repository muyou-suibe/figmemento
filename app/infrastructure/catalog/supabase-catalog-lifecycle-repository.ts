import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogLifecycleAction,
  CatalogLifecycleIntent,
  CatalogLifecycleMutationValue,
  CatalogLifecycleRejectionReason,
  CatalogLifecycleTargetType,
  CatalogLifecycleWriteRepository,
  CatalogLifecycleWriteResult,
} from "../../application/admin-catalog-lifecycle.ts";
import { isRecord, type CatalogLifecycle } from "../../domain/catalog/index.ts";

export interface CatalogLifecycleRpcResult {
  data: unknown;
  error: unknown;
}

export interface CatalogLifecycleRpcWriter {
  applyLifecycleIntent(intent: CatalogLifecycleIntent): Promise<CatalogLifecycleRpcResult>;
}

export class SupabaseCatalogLifecycleRpcWriter implements CatalogLifecycleRpcWriter {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async applyLifecycleIntent(intent: CatalogLifecycleIntent): Promise<CatalogLifecycleRpcResult> {
    return this.client
      .rpc("transition_catalog_lifecycle", {
        p_target_type: intent.targetType,
        p_target_id: intent.targetId,
        p_action: intent.action,
        p_actor_boundary: intent.actorBoundary,
        p_actor_identifier: intent.actorIdentifier,
      })
      .maybeSingle();
  }
}

const TARGET_TYPES: readonly CatalogLifecycleTargetType[] = ["category", "product"];
const ACTIONS: readonly CatalogLifecycleAction[] = [
  "publish",
  "unpublish",
  "retire",
  "destructive_state_mutation_attempt",
];
const LIFECYCLES: readonly CatalogLifecycle[] = ["draft", "published", "retired"];
const REJECTION_REASONS: readonly CatalogLifecycleRejectionReason[] = [
  "invalid_current_lifecycle",
  "category_not_published",
  "fulfillment_missing",
  "fulfillment_invalid",
  "invalid_variant_graph",
  "no_eligible_variant",
  "destructive_mutation_forbidden",
];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function appliedValue(row: Record<string, unknown>): CatalogLifecycleMutationValue | null {
  if (
    !includes(TARGET_TYPES, row.target_type)
    || typeof row.target_id !== "string"
    || !includes(ACTIONS, row.action)
    || !includes(LIFECYCLES, row.previous_lifecycle)
    || !includes(LIFECYCLES, row.current_lifecycle)
    || typeof row.changed !== "boolean"
  ) return null;
  return {
    targetType: row.target_type,
    targetId: row.target_id,
    action: row.action,
    previousLifecycle: row.previous_lifecycle,
    currentLifecycle: row.current_lifecycle,
    changed: row.changed,
  };
}

function mapRpcRow(row: unknown): CatalogLifecycleWriteResult {
  if (!isRecord(row) || typeof row.result_status !== "string") {
    return { status: "source_failure", operation: "catalog.admin.lifecycle" };
  }
  if (row.result_status === "not_found") return { status: "not_found" };
  if (row.result_status === "rejected" && includes(REJECTION_REASONS, row.reason_code)) {
    return { status: "rejected", reason: row.reason_code };
  }
  if (row.result_status === "applied") {
    const value = appliedValue(row);
    return value
      ? { status: "applied", value }
      : { status: "source_failure", operation: "catalog.admin.lifecycle" };
  }
  return { status: "source_failure", operation: "catalog.admin.lifecycle" };
}

export class SupabaseCatalogLifecycleRepository implements CatalogLifecycleWriteRepository {
  private readonly writer: CatalogLifecycleRpcWriter;

  constructor(writer: CatalogLifecycleRpcWriter) {
    this.writer = writer;
  }

  static fromClient(client: SupabaseClient): SupabaseCatalogLifecycleRepository {
    return new SupabaseCatalogLifecycleRepository(new SupabaseCatalogLifecycleRpcWriter(client));
  }

  async applyLifecycleIntent(intent: CatalogLifecycleIntent): Promise<CatalogLifecycleWriteResult> {
    const result = await this.writer.applyLifecycleIntent(intent);
    if (result.error || result.data === null) {
      return { status: "source_failure", operation: "catalog.admin.lifecycle" };
    }
    return mapRpcRow(result.data);
  }
}
