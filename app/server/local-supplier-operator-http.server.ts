import { readTrustedLocalSupplierConfig } from "../config/local-supplier-runtime.ts";
import {
  LocalSupplierOperatorService,
  type LocalSupplierOperatorResult,
} from "../application/local-supplier-operator-service.ts";
import { createLocalSupplierDevelopmentOperatorVerifier } from "./local-supplier-development-operator.server.ts";
import { getSharedLocalSupplierRuntime } from "./local-supplier-runtime.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import { resolveLocalSupplierOperatorAuthority } from "./local-supplier-operator.server.ts";
import { hasLocalPersistentSourceSelection } from "../application/local-persistent-commerce-composition.server.ts";
import type { RuntimeEnvironment } from "../config/server.ts";

const MAX_BODY_BYTES = 32 * 1024;

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function unavailable(): Response {
  return json({
    status: "unavailable",
    issues: [{ code: "LOCAL_SUPPLIER_UNAVAILABLE", message: "Local Supplier Operations are unavailable." }],
  }, 404);
}

function persistentSupplierUnsupported(): Response {
  return json({
    status: "unavailable",
    issues: [{
      code: "LOCAL_PERSISTENT_SUPPLIER_UNSUPPORTED",
      message: "Supplier Operations are not available for local persistent commerce.",
    }],
  }, 503);
}

function invalid(message = "Supplier operator input is invalid."): Response {
  return json({
    status: "blocked",
    issues: [{ code: "INVALID_LOCAL_SUPPLIER_INPUT", message }],
  }, 400);
}

function mapResult(result: LocalSupplierOperatorResult): Response {
  if (result.status === "found") return json(result.value, 200);
  if (result.status === "committed" || result.status === "replayed") return json(result, 200);
  if (result.status === "unavailable") return unavailable();
  if (result.status === "invalid") return invalid();
  if (result.status === "conflict") {
    return json({ status: "blocked", issues: [{ code: "LOCAL_SUPPLIER_CONFLICT", message: "This supplier operation conflicts with an earlier request." }] }, 409);
  }
  return json({ status: "blocked", issues: [{ code: "LOCAL_SUPPLIER_REJECTED", message: "This supplier operation was rejected." }] }, 409);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > MAX_BODY_BYTES) throw new Error("body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function createDefaultService(): LocalSupplierOperatorService | null {
  try {
    const configuration = readTrustedLocalSupplierConfig();
    const verifier = createLocalSupplierDevelopmentOperatorVerifier();
    // Keep privileged repository construction after the server-only authority check.
    if (resolveLocalSupplierOperatorAuthority(configuration, verifier).status !== "authorized") return null;
    return new LocalSupplierOperatorService({ runtime: getSharedLocalSupplierRuntime(), verifier });
  } catch {
    return null;
  }
}

export interface LocalSupplierOperatorHttpHandlerDependencies {
  readonly createService?: () => LocalSupplierOperatorService | null;
  readonly environment?: RuntimeEnvironment;
}

export function createLocalSupplierOperatorHttpHandler(
  overrides: LocalSupplierOperatorHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  return async function handleLocalSupplierOperatorHttp(request: Request): Promise<Response> {
    if (!isSameOriginLocalFulfillmentRequest(request)) {
      return json({ status: "blocked", issues: [{ code: "LOCAL_SUPPLIER_UNAVAILABLE", message: "Supplier request was not allowed." }] }, 403);
    }
    // Persistent Supplier Operations are intentionally unsupported in this
    // change. Reject from server-owned source configuration before any
    // local_fake service or memory repository can be constructed.
    if (hasLocalPersistentSourceSelection(overrides.environment ?? process.env)) {
      return persistentSupplierUnsupported();
    }
    const createService = overrides.createService ?? createDefaultService;
    const service = createService();
    if (!service) return unavailable();
    if (request.method === "GET") {
      try { return mapResult(service.read()); } catch { return unavailable(); }
    }
    if (request.method !== "POST") return json({ status: "blocked", issues: [{ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }] }, 405);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return invalid("JSON request required.");
    let body: unknown;
    try { body = await readBoundedJson(request); } catch { return invalid(); }
    try { return mapResult(await service.execute(body)); } catch { return unavailable(); }
  };
}
