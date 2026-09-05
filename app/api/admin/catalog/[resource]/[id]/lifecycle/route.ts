import { createExistingAdminMutationVerifier } from "../../../../../../server/admin-catalog-http.server.ts";
import { handleAdminCatalogLifecycleMutation } from "../../../../../../server/admin-catalog-lifecycle-http.server.ts";
import { createAdminCatalogLifecycleRepositories } from "../../../../../../server/admin-catalog-source.server.ts";

interface AdminCatalogLifecycleRouteContext {
  params: Promise<{ resource: string; id: string }>;
}

export async function POST(request: Request, context: AdminCatalogLifecycleRouteContext) {
  const { resource, id } = await context.params;
  return handleAdminCatalogLifecycleMutation(request, resource, id, {
    verifier: createExistingAdminMutationVerifier(request),
    createRepositories: createAdminCatalogLifecycleRepositories,
  });
}

export async function DELETE(request: Request, context: AdminCatalogLifecycleRouteContext) {
  const { resource, id } = await context.params;
  return handleAdminCatalogLifecycleMutation(
    request,
    resource,
    id,
    {
      verifier: createExistingAdminMutationVerifier(request),
      createRepositories: createAdminCatalogLifecycleRepositories,
    },
    { action: "delete" },
  );
}
