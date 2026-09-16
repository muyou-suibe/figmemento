import {
  LocalFulfillmentOperatorService,
  parseLocalFulfillmentOperatorActionInput,
  type LocalFulfillmentOperatorServiceResult,
} from "../application/local-fulfillment-operator-service.ts";
import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import { getSharedLocalFulfillmentRuntime } from "./local-fulfillment-runtime.server.ts";
import { createLocalFulfillmentDevelopmentOperatorVerifier } from "./local-fulfillment-development-operator.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import { persistentFulfillmentOperator } from "./local-persistent-fulfillment.server.ts";
import { parsePersistentLifecycleAction, persistentFulfillmentLifecycle } from "./local-persistent-fulfillment-lifecycle.server.ts";
import { parsePersistentPhotoReviewDecision, persistentPhotoReviewDecision } from "./local-persistent-photo-review-decision.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const MAX_OPERATOR_FULFILLMENT_BODY_BYTES = 16 * 1024;

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function unavailable(): Response {
  return jsonResponse({
    status: "unavailable",
    issues: [{ code: "LOCAL_FULFILLMENT_UNAVAILABLE", message: "Fulfillment is unavailable." }],
  }, 404);
}

function invalid(message = "Fulfillment input is invalid."): Response {
  return jsonResponse({
    status: "blocked",
    issues: [{ code: "INVALID_FULFILLMENT_INPUT", message }],
  }, 400);
}

function mapResult(result: LocalFulfillmentOperatorServiceResult): Response {
  if (result.status === "found") return jsonResponse(result.value, 200);
  if (result.status === "committed" || result.status === "replayed") {
    return jsonResponse({ status: result.status, result: result.result, fulfillment: result.projection }, 200);
  }
  if (result.status === "unavailable") return unavailable();
  if (result.status === "conflict") {
    return jsonResponse({
      status: "blocked",
      issues: [{ code: "LOCAL_FULFILLMENT_CONFLICT", message: "This Fulfillment action conflicts with an earlier request." }],
    }, 409);
  }
  if (result.status === "rejected") {
    const safeIssue = result.issues[0];
    return jsonResponse({
      status: "blocked",
      issues: [{ code: safeIssue?.code ?? "LOCAL_FULFILLMENT_REJECTED", message: safeIssue?.message ?? "This Fulfillment action was rejected." }],
    }, 409);
  }
  return invalid();
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > MAX_OPERATOR_FULFILLMENT_BODY_BYTES) {
    throw new Error("body_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_OPERATOR_FULFILLMENT_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function createDefaultService(): LocalFulfillmentOperatorService {
  return new LocalFulfillmentOperatorService({
    runtime: getSharedLocalFulfillmentRuntime(),
    verifier: createLocalFulfillmentDevelopmentOperatorVerifier(),
  });
}

export interface LocalFulfillmentOperatorHttpHandlerDependencies {
  readonly createService?: () => LocalFulfillmentOperatorService;
}

export function createLocalFulfillmentOperatorHttpHandler(
  overrides: LocalFulfillmentOperatorHttpHandlerDependencies = {},
): (request: Request, publicOrderReference: string) => Promise<Response> {
  return async function handleLocalFulfillmentOperatorHttp(request, publicOrderReference): Promise<Response> {
    if (!isSameOriginLocalFulfillmentRequest(request)) {
      return jsonResponse({ status: "blocked", issues: [{ code: "LOCAL_FULFILLMENT_UNAVAILABLE", message: "Fulfillment request was not allowed." }] }, 403);
    }
    if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();

    const createService = overrides.createService ?? createDefaultService;
    if (request.method === "GET") {
      try {
        if (!overrides.createService && process.env.LOCAL_FULFILLMENT_SOURCE?.trim() === "local_persistent") {
          const result = await persistentFulfillmentOperator(publicOrderReference, null);
          return result.status === "found" ? jsonResponse(result.value, 200) : unavailable();
        }
        return mapResult(await createService().read({ publicOrderReference }));
      } catch {
        return unavailable();
      }
    }
    if (request.method !== "POST") {
      return jsonResponse({ status: "blocked", issues: [{ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }] }, 405);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return invalid("JSON request required.");

    let rawInput: unknown;
    try {
      rawInput = await readBoundedJson(request);
    } catch {
      return invalid();
    }
    if (!overrides.createService && process.env.LOCAL_FULFILLMENT_SOURCE?.trim() === "local_persistent"
      && isRecord(rawInput) && ["start_production", "mark_quality_check"].includes(String(rawInput.actionKind))) {
      const action = parsePersistentLifecycleAction(rawInput);
      if (!action) return invalid();
      const result = await persistentFulfillmentLifecycle(publicOrderReference, action);
      if (result.status === "committed" || result.status === "replayed") return jsonResponse({status:result.status,fulfillment:result.value},200);
      if (result.status === "conflict") return jsonResponse({status:"blocked",issues:[{code:"LOCAL_FULFILLMENT_CONFLICT",message:"Fulfillment action rejected."}]},409);
      return unavailable();
    }
    if (!overrides.createService && process.env.LOCAL_FULFILLMENT_SOURCE?.trim() === "local_persistent"
      && isRecord(rawInput) && ["approve_photo_review", "reject_photo_review"].includes(String(rawInput.actionKind))) {
      const action = parsePersistentPhotoReviewDecision(rawInput);
      if (!action) return invalid();
      const result = await persistentPhotoReviewDecision(publicOrderReference, action);
      if (result.status === "committed" || result.status === "replayed") {
        return jsonResponse({status:result.status,fulfillment:result.value},200);
      }
      if (result.status === "conflict") return jsonResponse({status:"blocked",issues:[{
        code:"LOCAL_FULFILLMENT_CONFLICT",message:"Photo review decision rejected.",
      }]},409);
      return unavailable();
    }
    const parsed = parseLocalFulfillmentOperatorActionInput(rawInput, publicOrderReference);
    if (!parsed.ok) return invalid();

    try {
      if (!overrides.createService && process.env.LOCAL_FULFILLMENT_SOURCE?.trim() === "local_persistent") {
        const result = await persistentFulfillmentOperator(publicOrderReference, parsed.value);
        if (result.status === "committed" || result.status === "replayed") return jsonResponse({ status: result.status, fulfillment: result.value }, 200);
        if (result.status === "conflict") return jsonResponse({ status: "blocked", issues: [{ code: "LOCAL_FULFILLMENT_CONFLICT", message: "This Fulfillment action conflicts with an earlier request." }] }, 409);
        return unavailable();
      }
      return mapResult(await createService().mutate({ publicOrderReference, action: parsed.value }));
    } catch {
      return unavailable();
    }
  };
}
