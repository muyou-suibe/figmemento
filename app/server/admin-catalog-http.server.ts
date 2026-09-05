import {
  AdminCatalogCommandBoundary,
  type AdminAuthorizationResult,
  type AdminCatalogBoundaryResult,
  type AdminCatalogCommandValue,
  type AdminSessionVerifier,
  type PrivilegedAdminCatalogRepositories,
} from "../application/admin-catalog-boundary.ts";
import { getSessionCookieName } from "../lib/admin-auth.ts";
import { ExistingAdminSessionVerifier } from "./admin-catalog-session.server.ts";

export type AdminCatalogEditableResource = "categories" | "products";

export interface AdminCatalogMutationDependencies {
  verifier: AdminSessionVerifier;
  createRepositories: () => PrivilegedAdminCatalogRepositories;
}

export function readRequestCookie(request: Request, name: string): string | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

export function isSameOriginAdminMutation(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    const destination = new URL(request.url);
    if (origin.origin !== destination.origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === null || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

function staticVerifier(authorization: AdminAuthorizationResult): AdminSessionVerifier {
  return { async verifyAdminSession() { return authorization; } };
}

function responseForResult(
  result: AdminCatalogBoundaryResult<AdminCatalogCommandValue>,
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
        { status: "source_failure", message: "Catalog update is temporarily unavailable." },
        { status: 503 },
      );
    case "found":
      return Response.json({ status: "source_failure" }, { status: 500 });
  }
}

export async function handleAdminCatalogContentMutation(
  request: Request,
  resource: string,
  resourceId: string,
  dependencies: AdminCatalogMutationDependencies,
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
  if (resource !== "categories" && resource !== "products") {
    return Response.json({ status: "not_found" }, { status: 404 });
  }

  const body: unknown = await request.json().catch(() => null);
  const editableResource: AdminCatalogEditableResource = resource;
  const kind = editableResource === "categories" ? "save_category" : "save_product";
  const boundary = new AdminCatalogCommandBoundary(
    staticVerifier(authorization),
    dependencies.createRepositories,
  );
  return responseForResult(await boundary.execute(body, {
    allowedKinds: [kind],
    existingResourceId: resourceId,
    preserveLifecycle: true,
  }));
}

export function createExistingAdminMutationVerifier(request: Request): ExistingAdminSessionVerifier {
  return new ExistingAdminSessionVerifier(
    readRequestCookie(request, getSessionCookieName()),
  );
}
