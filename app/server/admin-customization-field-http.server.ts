import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
  type AdminCustomizationFieldBoundaryResult,
  type AdminCustomizationFieldConfiguration,
  type AdminCustomizationReadModel,
  type CustomizationFieldAdminReadRepository,
  type PrivilegedAdminCustomizationFieldRepositories,
} from "../application/admin-customization-field-boundary.ts";
import type {
  AdminAuthorizationResult,
  AdminSessionVerifier,
} from "../application/admin-catalog-boundary.ts";
import { isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";

export interface AdminCustomizationFieldDependencies {
  verifier: AdminSessionVerifier;
  createReader: () => CustomizationFieldAdminReadRepository;
  createRepositories: () => PrivilegedAdminCustomizationFieldRepositories;
}

function staticVerifier(authorization: AdminAuthorizationResult): AdminSessionVerifier {
  return { async verifyAdminSession() { return authorization; } };
}

function responseForQuery(
  result: AdminCustomizationFieldBoundaryResult<AdminCustomizationReadModel>,
): Response {
  switch (result.status) {
    case "found": return Response.json({ status: "found", value: result.value });
    case "not_found": return Response.json({ status: "not_found" }, { status: 404 });
    case "invalid_request": return Response.json({ status: "invalid_request", issues: result.issues }, { status: 400 });
    case "invalid_configuration": return Response.json({ status: "invalid_configuration", issues: result.issues }, { status: 409 });
    case "unauthorized":
    case "authentication_failure": return Response.json({ status: "unauthorized" }, { status: 401 });
    case "source_failure": return Response.json({ status: "source_failure", message: "Customization configuration is temporarily unavailable." }, { status: 503 });
    case "applied": return Response.json({ status: "source_failure" }, { status: 500 });
    case "stale_revision": return Response.json({ status: "source_failure" }, { status: 500 });
  }
}

function responseForCommand(
  result: AdminCustomizationFieldBoundaryResult<AdminCustomizationFieldConfiguration>,
): Response {
  switch (result.status) {
    case "applied": return Response.json({
      status: "applied",
      value: result.value,
      newFieldIdMappings: result.newFieldIdMappings,
    });
    case "stale_revision": return Response.json({ status: "stale_revision" }, { status: 409 });
    case "not_found": return Response.json({ status: "not_found" }, { status: 404 });
    case "invalid_request": return Response.json({ status: "invalid_request", issues: result.issues }, { status: 400 });
    case "invalid_configuration": return Response.json({ status: "invalid_configuration", issues: result.issues }, { status: 409 });
    case "unauthorized":
    case "authentication_failure": return Response.json({ status: "unauthorized" }, { status: 401 });
    case "source_failure": return Response.json({ status: "source_failure", message: "Customization configuration could not be saved." }, { status: 503 });
    case "found": return Response.json({ status: "source_failure" }, { status: 500 });
  }
}

export async function handleAdminCustomizationFieldQuery(
  productId: string,
  dependencies: AdminCustomizationFieldDependencies,
): Promise<Response> {
  const boundary = new AdminCustomizationFieldQueryBoundary(
    dependencies.verifier,
    dependencies.createReader,
  );
  return responseForQuery(await boundary.execute({ productId }));
}

export async function handleAdminCustomizationFieldMutation(
  request: Request,
  productId: string,
  dependencies: AdminCustomizationFieldDependencies,
): Promise<Response> {
  let authorization: AdminAuthorizationResult;
  try {
    authorization = await dependencies.verifier.verifyAdminSession();
  } catch {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  if (authorization.status !== "authorized") return Response.json({ status: "unauthorized" }, { status: 401 });
  if (!isSameOriginAdminMutation(request)) {
    return Response.json({ status: "forbidden", message: "Same-origin request required." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ status: "invalid_request", message: "JSON request required." }, { status: 400 });
  }
  const body: unknown = await request.json().catch(() => null);
  const boundary = new AdminCustomizationFieldCommandBoundary(
    staticVerifier(authorization),
    dependencies.createRepositories,
  );
  return responseForCommand(await boundary.execute({
    ...(typeof body === "object" && body !== null ? body : {}),
    productId,
  }));
}
