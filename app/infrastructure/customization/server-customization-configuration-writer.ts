import type { CustomizationFieldAtomicPublicationRepository } from "../../application/admin-customization-field-boundary.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { SupabaseCustomizationConfigurationWriter } from "./supabase-customization-configuration-writer.ts";

/**
 * Server-only factory for future protected admin routes. The caller remains
 * responsible for completing admin authorization before constructing it.
 */
export function createProductionCustomizationConfigurationWriter(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): CustomizationFieldAtomicPublicationRepository {
  return SupabaseCustomizationConfigurationWriter.fromClient(createSupabaseClient());
}
