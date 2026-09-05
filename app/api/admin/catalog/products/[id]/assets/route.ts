import { createExistingAdminMutationVerifier } from "../../../../../../server/admin-catalog-http.server.ts";
import { handleAdminProductAssetMutation } from "../../../../../../server/admin-product-assets-http.server.ts";
import { createAdminProductAssetRepositories } from "../../../../../../server/admin-catalog-source.server.ts";

interface AdminProductAssetRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: AdminProductAssetRouteContext) {
  const { id } = await context.params;
  return handleAdminProductAssetMutation(request, id, {
    verifier: createExistingAdminMutationVerifier(request),
    createRepositories: createAdminProductAssetRepositories,
  });
}
