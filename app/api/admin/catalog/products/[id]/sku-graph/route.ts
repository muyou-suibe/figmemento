import { createExistingAdminMutationVerifier } from "../../../../../../server/admin-catalog-http.server.ts";
import { handleAdminSkuGraphMutation } from "../../../../../../server/admin-sku-graph-http.server.ts";
import { createAdminSkuGraphRepositories } from "../../../../../../server/admin-catalog-source.server.ts";

interface AdminSkuGraphRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: AdminSkuGraphRouteContext) {
  const { id } = await context.params;
  return handleAdminSkuGraphMutation(request, id, {
    verifier: createExistingAdminMutationVerifier(request),
    createRepositories: createAdminSkuGraphRepositories,
  });
}
