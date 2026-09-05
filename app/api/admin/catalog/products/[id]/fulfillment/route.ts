import { createExistingAdminMutationVerifier } from "../../../../../../server/admin-catalog-http.server.ts";
import { handleAdminProductFulfillmentMutation } from "../../../../../../server/admin-product-fulfillment-http.server.ts";
import { createAdminProductFulfillmentRepositories } from "../../../../../../server/admin-catalog-source.server.ts";

interface AdminProductFulfillmentRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: AdminProductFulfillmentRouteContext) {
  const { id } = await context.params;
  return handleAdminProductFulfillmentMutation(request, id, {
    verifier: createExistingAdminMutationVerifier(request),
    createRepositories: createAdminProductFulfillmentRepositories,
  });
}
