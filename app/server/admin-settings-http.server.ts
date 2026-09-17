import type {
  AdminAuthorizationResult,
  AdminSessionVerifier,
} from "../application/admin-catalog-boundary.ts";
import {
  composeAdminSettingsProjection,
  parseAdminSettingsActionKey,
  parseAdminSettingsPatch,
  verifyAdminBeforeRepository,
  type AdminSettingsProjection,
  type AdminSettingsRepository,
} from "../application/admin-settings-boundary.server.ts";
import { readAdminAcceptanceConfiguration } from "../config/admin-acceptance-runtime.server.ts";
import { composeServerRuntimeConfiguration, resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";
import type { RuntimeEnvironment } from "../config/server.ts";
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";
import {
  createLocalPersistentAdminSettingsRepository,
  type LocalPersistentAdminSettingsRepositoryResult,
} from "../infrastructure/local-commerce/local-persistent-admin-settings-repository.server.ts";

export interface AdminSettingsHttpDependencies {
  readonly environment?: RuntimeEnvironment;
  readonly verifier?: AdminSessionVerifier;
  readonly createRepository?: () => Promise<LocalPersistentAdminSettingsRepositoryResult>;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function authorized(value: AdminAuthorizationResult): value is Extract<AdminAuthorizationResult, { status: "authorized" }> {
  return value.status === "authorized" && value.principal.role === "admin" && value.principal.identity === "configured-admin";
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 16_384) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function projectReadOnly(environment: RuntimeEnvironment): AdminSettingsProjection["readOnly"] | null {
  const runtime = composeServerRuntimeConfiguration(environment);
  if (runtime.status !== "ready") return null;
  return {
    brandName: runtime.value.public.brandName,
    siteOrigin: runtime.value.public.siteUrl,
    deploymentEnvironment: runtime.value.public.deploymentEnvironment,
    providerActivation: "inactive",
    digitalDeliveryPolicy: { status: "local_policy", durationDays: 30, maxDownloads: 5 },
  };
}

function invalidSource(environment: RuntimeEnvironment): boolean {
  const source = readAdminAcceptanceConfiguration(environment, environment.NODE_ENV);
  return source.status !== "local_persistent" || resolveCanonicalLocalCommerceCapability("admin", environment) !== "selected";
}

async function repositoryFor(
  dependencies: AdminSettingsHttpDependencies,
): Promise<AdminSettingsRepository | null> {
  const result = await (dependencies.createRepository ?? (() => createLocalPersistentAdminSettingsRepository(dependencies.environment ?? process.env)))();
  return result.status === "ready" ? result.repository : null;
}

export async function handleAdminSettings(
  request: Request,
  dependencies: AdminSettingsHttpDependencies = {},
): Promise<Response> {
  const environment = dependencies.environment ?? process.env;
  let authorization: AdminAuthorizationResult;
  try {
    authorization = await verifyAdminBeforeRepository(dependencies.verifier ?? createExistingAdminMutationVerifier(request));
  } catch {
    return json({ status: "unauthorized" }, 401);
  }
  if (!authorized(authorization)) return json({ status: "unauthorized" }, 401);

  if (request.method !== "GET" && request.method !== "PATCH") return json({ status: "unavailable" }, 405);
  if (request.method === "PATCH") {
    if (!isSameOriginAdminMutation(request)) return json({ status: "forbidden" }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ status: "invalid_request", issues: [{ path: "$", message: "JSON request required." }] }, 400);
    }
  }
  if (invalidSource(environment)) return json({ status: "unavailable" }, 503);

  const readOnly = projectReadOnly(environment);
  if (!readOnly) return json({ status: "unavailable" }, 503);
  const repository = await repositoryFor(dependencies);
  if (!repository) return json({ status: "unavailable" }, 503);

  if (request.method === "GET") {
    const result = await repository.read();
    if (result.status !== "found") return json({ status: "unavailable" }, 503);
    return json({ status: "found", value: composeAdminSettingsProjection(result.value, readOnly) });
  }

  const body = await readBoundedJson(request);
  const patch = parseAdminSettingsPatch(body);
  if (patch.status !== "valid") return json({ status: "invalid_request", issues: patch.issues }, 400);
  const actionKey = parseAdminSettingsActionKey(request.headers.get("idempotency-key"));
  if (actionKey.status !== "valid") {
    return json({ status: "invalid_request", issues: [{ path: "$.headers.Idempotency-Key", message: "A bounded idempotency key is required." }] }, 400);
  }
  const actionKeyDigest = await sha256(`h19.action:${actionKey.value}`);
  const contextDigest = await sha256(JSON.stringify([
    "h19.set_support_email",
    authorization.principal.identity,
    patch.value.expectedVersion,
    patch.value.supportEmail,
  ]));
  const result = await repository.update({
    actionKeyDigest,
    contextDigest,
    expectedVersion: patch.value.expectedVersion,
    supportEmail: patch.value.supportEmail,
  });
  if (result.status === "unavailable") return json({ status: "unavailable" }, 503);
  if (result.status === "invalid_request") return json({ status: "invalid_request", issues: [{ path: "$", message: "The settings update is invalid." }] }, 400);
  if (result.status === "conflict") {
    return json({ status: result.reason === "version_mismatch" ? "stale" : "conflict" }, 409);
  }
  return json({
    status: result.replayed ? "replayed" : "updated",
    replayed: result.replayed,
    value: composeAdminSettingsProjection(result.value, readOnly),
  });
}
