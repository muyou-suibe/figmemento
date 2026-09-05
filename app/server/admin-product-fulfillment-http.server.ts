import {
  AdminProductFulfillmentBoundary,
  type PrivilegedAdminProductFulfillmentRepositories,
} from "../application/admin-product-fulfillment.ts";
import type {
  AdminAuthorizationResult,
  AdminCatalogBoundaryResult,
  AdminSessionVerifier,
} from "../application/admin-catalog-boundary.ts";
import type { ProductFulfillmentConfig } from "../domain/catalog/index.ts";
import { isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";

export interface AdminProductFulfillmentMutationDependencies {
  verifier: AdminSessionVerifier;
  createRepositories: () => PrivilegedAdminProductFulfillmentRepositories;
}

function staticVerifier(authorization: AdminAuthorizationResult): AdminSessionVerifier {
  return { async verifyAdminSession() { return authorization; } };
}

function responseForResult(
  result: AdminCatalogBoundaryResult<ProductFulfillmentConfig>,
): Response {
  switch (result.status) {
    case "applied":
      return Response.json({ status: "applied", value: result.value });
    case "invalid_request":
      return Response.json({ status: "invalid_request", issues: result.issues }, { status: 400 });
    case "not_found":
      return Response.json({ status: "not_found" }, { status: 404 });
    case "unavailable":
      return Response.json({ status: "unavailable" }, { status: 409 });
    case "invalid_configuration":
      return Response.json({ status: "invalid_configuration", issues: result.issues }, { status: 409 });
    case "unauthorized":
    case "authentication_failure":
      return Response.json({ status: "unauthorized" }, { status: 401 });
    case "source_failure":
      return Response.json(
        { status: "source_failure", message: "FulfillmentConfig update is temporarily unavailable." },
        { status: 503 },
      );
    case "found":
      return Response.json({ status: "source_failure" }, { status: 500 });
  }
}

export async function handleAdminProductFulfillmentMutation(
  request: Request,
  routeProductId: string,
  dependencies: AdminProductFulfillmentMutationDependencies,
): Promise<Response> {
  let authorization: AdminAuthorizationResult;
  try {
    authorization = await dependencies.verifier.verifyAdminSession();
  } catch {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  if (authorization.status !== "authorized") {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  if (!isSameOriginAdminMutation(request)) {
    return Response.json({ status: "forbidden", message: "Same-origin request required." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ status: "invalid_request", message: "JSON request required." }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  const boundary = new AdminProductFulfillmentBoundary(
    staticVerifier(authorization),
    dependencies.createRepositories,
  );
  return responseForResult(await boundary.execute(routeProductId, body));
}
