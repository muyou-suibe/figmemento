import type {
  AdminSettingsRepository,
  AdminSettingsRepositoryReadResult,
  AdminSettingsRepositoryUpdateResult,
} from "../../application/admin-settings-boundary.server.ts";
import {
  createLocalPersistentSupabaseAdapter,
  type LocalPersistentAdminSettingsValue,
} from "./local-persistent-supabase-adapter.server.ts";

export type LocalPersistentAdminSettingsRepositoryResult =
  | { readonly status: "ready"; readonly repository: AdminSettingsRepository }
  | { readonly status: "unavailable" };

function safeValue(value: LocalPersistentAdminSettingsValue) {
  return {
    supportEmail: value.supportEmail,
    version: value.version,
    updatedAt: value.updatedAt,
  } as const;
}

export async function createLocalPersistentAdminSettingsRepository(
  environment: Record<string, string | undefined> = process.env,
): Promise<LocalPersistentAdminSettingsRepositoryResult> {
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready") return { status: "unavailable" };
  const { projectId, markerDigest } = connection.composition;
  const repository: AdminSettingsRepository = {
    async read(): Promise<AdminSettingsRepositoryReadResult> {
      const result = await connection.adapter.readAdminSettings({
        p_project_id: projectId,
        p_marker_digest: markerDigest,
      });
      return result.status === "found"
        ? { status: "found", value: safeValue(result.value) }
        : { status: "unavailable" };
    },
    async update(input): Promise<AdminSettingsRepositoryUpdateResult> {
      const result = await connection.adapter.updateAdminSettings({
        p_project_id: projectId,
        p_marker_digest: markerDigest,
        p_actor_kind: "admin",
        p_actor_id: "configured-admin",
        p_action_key_digest: input.actionKeyDigest,
        p_context_digest: input.contextDigest,
        p_expected_version: input.expectedVersion,
        p_support_email: input.supportEmail,
      });
      if (result.status !== "found") return { status: "unavailable" };
      if (result.value.status === "conflict") {
        return {
          status: "conflict",
          reason: result.value.reason === "version_mismatch" ? "version_mismatch" : "idempotency_mismatch",
        };
      }
      if (result.value.status === "invalid_request") {
        return { status: "invalid_request", reason: result.value.reason };
      }
      return { status: "found", replayed: result.value.replayed, value: safeValue(result.value.value) };
    },
  };
  return { status: "ready", repository };
}
