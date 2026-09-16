import {
  createAdminCustomizationFieldReader,
  createAdminCustomizationFieldRepositories,
} from "../../../../../../server/admin-customization-source.server.ts";
import { createExistingAdminMutationVerifier } from "../../../../../../server/admin-catalog-http.server.ts";
import {
  handleAdminCustomizationFieldMutation,
  handleAdminCustomizationFieldQuery,
} from "../../../../../../server/admin-customization-field-http.server.ts";

interface AdminCustomizationFieldRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: AdminCustomizationFieldRouteContext) {
  const { id } = await context.params;
  return handleAdminCustomizationFieldQuery(id, {
    verifier: createExistingAdminMutationVerifier(_request),
    createReader: createAdminCustomizationFieldReader,
    createRepositories: createAdminCustomizationFieldRepositories,
  });
}

export async function POST(request: Request, context: AdminCustomizationFieldRouteContext) {
  const { id } = await context.params;
  return handleAdminCustomizationFieldMutation(request, id, {
    verifier: createExistingAdminMutationVerifier(request),
    createReader: createAdminCustomizationFieldReader,
    createRepositories: createAdminCustomizationFieldRepositories,
  });
}
