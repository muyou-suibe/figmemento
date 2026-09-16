import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomizationFieldAdminReadRepository,
  PrivilegedAdminCustomizationFieldRepositories,
} from "../../application/admin-customization-field-boundary.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { createProductionCustomizationConfigurationWriter } from "./server-customization-configuration-writer.ts";
import { SupabaseAdminCustomizationFieldRepository } from "./supabase-admin-customization-field-repository.ts";

/** Called only by protected server boundaries after administrator authorization. */
export function createProductionAdminCustomizationFieldReader(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): CustomizationFieldAdminReadRepository {
  return SupabaseAdminCustomizationFieldRepository.fromClient(createSupabaseClient());
}

/** Called only by protected server mutation boundaries after authorization. */
export function createProductionAdminCustomizationFieldRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminCustomizationFieldRepositories {
  const client = createSupabaseClient();
  return {
    reader: SupabaseAdminCustomizationFieldRepository.fromClient(client),
    writer: createProductionCustomizationConfigurationWriter(() => client),
  };
}
