import {
  AdminCatalogLifecycleBoundary,
  type CatalogLifecycleMutationValue,
  type PrivilegedAdminCatalogLifecycleRepositories,
} from "../application/admin-catalog-lifecycle.ts";
import type {
  AdminAuthorizationResult,
  AdminCatalogBoundaryResult,
  AdminSessionVerifier,
} from "../application/admin-catalog-boundary.ts";
import { isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";

export interface AdminCatalogLifecycleMutationDependencies {
  verifier: AdminSessionVerifier;
  createRepositories: () => PrivilegedAdminCatalogLifecycleRepositories;
}

function staticVerifier(authorization: AdminAuthorizationResult): AdminSessionVerifier {
  return { async verifyAdminSession() { return authorization; } };
}

function responseForResult(
  result: AdminCatalogBoundaryResult<CatalogLifecycleMutationValue>,
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
        { status: "source_failure", message: "Catalog lifecycle update is temporarily unavailable." },
        { status: 503 },
      );
    case "found":
      return Response.json({ status: "source_failure" }, { status: 500 });
  }
}

function lifecycleTarget(resource: string): "category" | "product" | null {
  if (resource === "categories") return "category";
  if (resource === "products") return "product";
  return null;
}

export async function handleAdminCatalogLifecycleMutation(
  request: Request,
  routeResource: string,
  routeTargetId: string,
  dependencies: AdminCatalogLifecycleMutationDependencies,
  providedBody?: unknown,
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

  const targetType = lifecycleTarget(routeResource);
  if (!targetType) return Response.json({ status: "not_found" }, { status: 404 });

  let body = providedBody;
  if (body === undefined) {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ status: "invalid_request", message: "JSON request required." }, { status: 400 });
    }
    body = await request.json().catch(() => null);
  }

  const boundary = new AdminCatalogLifecycleBoundary(
    staticVerifier(authorization),
    dependencies.createRepositories,
  );
  return responseForResult(await boundary.execute(targetType, routeTargetId, body));
}
