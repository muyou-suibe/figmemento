import {
  LocalFulfillmentCustomerService,
  parseLocalFulfillmentCustomerActionInput,
} from "../application/local-fulfillment-customer-service.ts";
import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import {
  getSharedLocalFulfillmentRepository,
} from "./local-fulfillment-runtime.server.ts";
import { readLocalOrderBrowserCapability } from "./local-order-http.server.ts";
import { getSharedLocalOrderRepository } from "./local-order-runtime.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import type { LocalFulfillmentCustomerServiceResult } from "../application/local-fulfillment-customer-service.ts";
import { parsePersistentPreviewCustomerAction } from "../application/local-persistent-preview-customer-contract.server.ts";
import { executePersistentCustomerPreview } from "./local-persistent-preview-customer.server.ts";

const MAX_CUSTOMER_FULFILLMENT_BODY_BYTES = 16 * 1024;

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

async function persistentResponse(request:Request,reference:string,raw?:unknown):Promise<Response>{
  const parsed=request.method==="POST"?parsePersistentPreviewCustomerAction(raw,reference):null;
  if(parsed && !parsed.ok)return invalid();
  const result=await executePersistentCustomerPreview(request,reference,parsed?.ok?parsed.value:null);
  if(result.status==="unavailable")return unavailable();
  if(result.status==="conflict")return jsonResponse({status:"blocked",issues:[{code:"LOCAL_FULFILLMENT_CONFLICT",
    message:"This Fulfillment action conflicts with an earlier request."}]},409);
  return jsonResponse(request.method==="GET"?result.value:{status:result.replayed?"replayed":"committed",result:result.value},200);
}

function invalid(message = "Fulfillment input is invalid."): Response {
  return jsonResponse({
    status: "blocked",
    issues: [{ code: "INVALID_FULFILLMENT_INPUT", message }],
  }, 400);
}

function mapResult(result: LocalFulfillmentCustomerServiceResult): Response {
  if (result.status === "found") return jsonResponse(result.value, 200);
  if (result.status === "committed" || result.status === "replayed") {
    return jsonResponse({ status: result.status, result: result.result }, 200);
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
      issues: [{
        code: safeIssue?.code ?? "LOCAL_FULFILLMENT_REJECTED",
        message: safeIssue?.message ?? "This Fulfillment action was rejected.",
      }],
    }, 409);
  }
  return invalid();
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > MAX_CUSTOMER_FULFILLMENT_BODY_BYTES) {
    throw new Error("body_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CUSTOMER_FULFILLMENT_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

export interface LocalFulfillmentCustomerHttpHandlerDependencies {
  readonly createService?: () => LocalFulfillmentCustomerService;
}

export function createLocalFulfillmentCustomerHttpHandler(
  overrides: LocalFulfillmentCustomerHttpHandlerDependencies = {},
): (request: Request, publicOrderReference: string) => Promise<Response> {
  return async function handleLocalFulfillmentCustomerHttp(request: Request, publicOrderReference: string): Promise<Response> {
    if (request.method === "GET") {
      if (!isSameOriginLocalFulfillmentRequest(request)) {
        return jsonResponse({ status: "blocked", issues: [{ code: "LOCAL_FULFILLMENT_UNAVAILABLE", message: "Fulfillment request was not allowed." }] }, 403);
      }
      if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();
      if(process.env.LOCAL_FULFILLMENT_SOURCE==="local_persistent")return persistentResponse(request,publicOrderReference);
      const browserCapability = readLocalOrderBrowserCapability(request);
      if (!browserCapability) return unavailable();

      let service: LocalFulfillmentCustomerService;
      try {
        service = overrides.createService?.() ?? new LocalFulfillmentCustomerService({
          getOrderRepository: getSharedLocalOrderRepository,
          getFulfillmentRepository: getSharedLocalFulfillmentRepository,
        });
      } catch {
        return unavailable();
      }
      try {
        return mapResult(await service.read({ publicOrderReference, browserCapability }));
      } catch {
        return unavailable();
      }
    }

    if (request.method !== "POST") {
      return jsonResponse({ status: "blocked", issues: [{ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }] }, 405);
    }
    if (!isSameOriginLocalFulfillmentRequest(request)) {
      return jsonResponse({ status: "blocked", issues: [{ code: "LOCAL_FULFILLMENT_UNAVAILABLE", message: "Fulfillment request was not allowed." }] }, 403);
    }
    if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return invalid("JSON request required.");

    let rawInput: unknown;
    try {
      rawInput = await readBoundedJson(request);
    } catch {
      return invalid();
    }
    if(process.env.LOCAL_FULFILLMENT_SOURCE==="local_persistent")return persistentResponse(request,publicOrderReference,rawInput);
    const parsed = parseLocalFulfillmentCustomerActionInput(rawInput, publicOrderReference);
    if (!parsed.ok) return invalid();

    const browserCapability = readLocalOrderBrowserCapability(request);
    if (!browserCapability) return unavailable();

    let service: LocalFulfillmentCustomerService;
    try {
      service = overrides.createService?.() ?? new LocalFulfillmentCustomerService({
        getOrderRepository: getSharedLocalOrderRepository,
        getFulfillmentRepository: getSharedLocalFulfillmentRepository,
      });
    } catch {
      return unavailable();
    }
    try {
      return mapResult(await service.mutate({
        publicOrderReference,
        browserCapability,
        action: parsed.value,
      }));
    } catch {
      return unavailable();
    }
  };
}
