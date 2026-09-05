import {
  createExistingAdminMutationVerifier,
  handleAdminCatalogContentMutation,
} from "../../../../../server/admin-catalog-http.server.ts";
import { createAdminCatalogRepositories } from "../../../../../server/admin-catalog-source.server.ts";

interface AdminCatalogMutationRouteContext {
  params: Promise<{ resource: string; id: string }>;
}

export async function POST(request: Request, context: AdminCatalogMutationRouteContext) {
  const { resource, id } = await context.params;
  return handleAdminCatalogContentMutation(
    request,
    resource,
    id,
    {
      verifier: createExistingAdminMutationVerifier(request),
      createRepositories: createAdminCatalogRepositories,
    },
  );
}
