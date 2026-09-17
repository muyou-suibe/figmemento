import { getSupportContactText, getPublicSiteConfig } from "../config/public.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import type { RuntimeEnvironment } from "../config/server.ts";

export type SupportContactResolution =
  | { readonly status: "persistent"; readonly supportEmail: string | null }
  | { readonly status: "environment"; readonly supportEmail: string | undefined }
  | { readonly status: "unavailable" };

/**
 * The H19 setting becomes the sole support-email authority only when the
 * explicitly selected local_persistent Admin composition is valid. Any
 * other source keeps the established environment-backed behavior; a selected
 * but unavailable persistent source fails closed instead of falling back.
 */
export async function resolveSupportContact(
  environment: RuntimeEnvironment = process.env,
): Promise<SupportContactResolution> {
  if (environment.ADMIN_ACCEPTANCE_SOURCE?.trim() !== "local_persistent") {
    try {
      return { status: "environment", supportEmail: getPublicSiteConfig().supportEmail };
    } catch {
      return { status: "environment", supportEmail: undefined };
    }
  }

  const composition = resolveLocalPersistentComposition(environment);
  if (composition.status !== "ready") return { status: "unavailable" };
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready"
    || connection.composition.projectId !== composition.value.projectId
    || connection.composition.markerDigest !== composition.value.markerDigest) {
    return { status: "unavailable" };
  }
  const settings = await connection.adapter.readAdminSettings({
    p_project_id: composition.value.projectId,
    p_marker_digest: composition.value.markerDigest,
  });
  if (settings.status !== "found") return { status: "unavailable" };
  return { status: "persistent", supportEmail: settings.value.supportEmail };
}

export async function getSupportContactTextFromAuthority(
  environment: RuntimeEnvironment = process.env,
): Promise<string> {
  const result = await resolveSupportContact(environment);
  return getSupportContactText(result.status === "persistent" || result.status === "environment"
    ? result.supportEmail ?? undefined
    : undefined);
}
