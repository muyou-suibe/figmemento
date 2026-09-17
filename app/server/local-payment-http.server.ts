import type {
  LocalPaymentApplicationFailure,
  LocalPaymentApplicationResult,
} from "../application/local-payment-service.ts";
import { parseLocalPaymentMutationInput } from "../domain/local-payment.ts";
import { LocalPaymentService } from "../application/local-payment-service.ts";
import { getSharedLocalOrderRepository } from "./local-order-runtime.server.ts";
import {
  getSharedLocalPaymentRepository,
} from "./local-payment-runtime.server.ts";
import { getSharedCustomerPointsRepository } from "./customer-points-runtime.server.ts";
import { readLocalOrderBrowserCapability } from "./local-order-http.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { getSharedLocalNotificationOutbox } from "./local-notification-runtime.server.ts";
import { readTrustedLocalPaymentConfig } from "../config/local-payment-runtime.ts";
import { executePersistentPayment } from "./local-persistent-payment.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";

const MAX_PAYMENT_BODY_BYTES = 16 * 1024;

type LocalPaymentPublicFailure = {
  readonly status: "blocked" | "unavailable";
  readonly issues: readonly { readonly code: string; readonly message: string }[];
};

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function failure(status: LocalPaymentPublicFailure["status"], code: string, message: string, httpStatus: number): Response {
  return jsonResponse({ status, issues: [{ code, message }] }, httpStatus);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > MAX_PAYMENT_BODY_BYTES) {
    throw new Error("body_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PAYMENT_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function mapApplicationFailure(result: LocalPaymentApplicationFailure): Response {
  switch (result.status) {
    case "conflict":
      return failure("blocked", "LOCAL_PAYMENT_CONFLICT", "This local Payment attempt conflicts with an earlier request.", 409);
    case "non_retryable":
      return failure("blocked", "LOCAL_PAYMENT_NOT_AVAILABLE", "This Local Order cannot accept a new Payment attempt.", 409);
    case "invalid":
      return failure("blocked", "INVALID_PAYMENT_INPUT", "Local Payment input is invalid.", 400);
    case "unsupported_runtime":
    case "failed":
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
    case "unavailable":
      // Authorization failure, unknown reference, and restart loss share the
      // protected Local Order read's non-enumerating response.
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 404);
  }
}

export interface LocalPaymentHttpHandlerDependencies {
  readonly createService?: () => LocalPaymentService;
}

export function createLocalPaymentMutationHttpHandler(
  overrides: LocalPaymentHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  return async function handleLocalPaymentMutation(request: Request): Promise<Response> {
    if (request.method !== "POST") return failure("blocked", "METHOD_NOT_ALLOWED", "Method not allowed.", 405);
    if (!isSameOriginCartMutation(request)) {
      return failure("blocked", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment request was not allowed.", 403);
    }

    let rawInput: unknown;
    try {
      rawInput = await readBoundedJson(request);
    } catch {
      return failure("blocked", "INVALID_PAYMENT_INPUT", "Local Payment input is invalid.", 400);
    }
    const parsed = parseLocalPaymentMutationInput(rawInput);
    if (!parsed.ok) return failure("blocked", "INVALID_PAYMENT_INPUT", "Local Payment input is invalid.", 400);

    const selection = resolveCanonicalLocalCommerceCapability("payment");
    if (selection === "unavailable") return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
    if (selection === "selected") {
      try {
        const configuration = readTrustedLocalPaymentConfig();
        const result = await executePersistentPayment(request, parsed.value, { ...process.env, NODE_ENV: configuration.runtimeMode });
        if (result.status !== "found") return failure(result.status === "conflict" ? "blocked" : "unavailable",
          "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", result.status === "conflict" ? 409 : 404);
        const payment = result.value.payment;
        return jsonResponse({ status: result.value.replayed ? "replayed" : "committed", payment,
          order: { publicReference: payment.orderReference,
            status: payment.outcome === "success" ? "paid" : payment.outcome === "failed" ? "payment_failed" : "pending_payment",
            paymentStatus: payment.outcome === "success" ? "succeeded" : payment.outcome === "failed" ? "failed" : "pending" } }, 200);
      } catch {
        return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
      }
    }

    // The capability is extracted only from the existing HttpOnly cookie. Do
    // this before constructing the service so malformed/unauthorized requests
    // cannot create a privileged Payment boundary.
    const browserCapability = readLocalOrderBrowserCapability(request);
    if (!browserCapability) {
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 404);
    }

    let service: LocalPaymentService;
    try {
        service = overrides.createService?.() ?? new LocalPaymentService({
          getOrderRepository: getSharedLocalOrderRepository,
          getPaymentRepository: getSharedLocalPaymentRepository,
          onPaymentCommitted: ({ outcome, orderSnapshot }) => {
            if (outcome === "success") {
              if (orderSnapshot.customerId) {
                getSharedCustomerPointsRepository().settleOrder({ customerId: orderSnapshot.customerId, orderReference: orderSnapshot.publicReference, subtotalCents: orderSnapshot.commercial.subtotalCents, now: new Date().toISOString() });
              }
              getSharedLocalNotificationOutbox().enqueue({
                recipient: orderSnapshot.contact.email,
                type: "payment_succeeded",
                reference: orderSnapshot.publicReference,
                payload: { email: orderSnapshot.contact.email },
                createdAt: new Date().toISOString(),
              });
            } else if (orderSnapshot.customerId) {
              const points = getSharedCustomerPointsRepository();
              points.releaseOrder({ customerId: orderSnapshot.customerId, orderReference: orderSnapshot.publicReference });
            }
          },
        });
    } catch {
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
    }

    let result: LocalPaymentApplicationResult;
    try {
      result = await service.execute({ ...parsed.value, browserCapability });
    } catch {
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
    }
    if (result.status === "committed" || result.status === "replayed") {
      return jsonResponse({
        status: result.status,
        payment: result.payment,
        order: result.order,
      }, 200);
    }
    if (!("issues" in result)) {
      return failure("unavailable", "LOCAL_PAYMENT_UNAVAILABLE", "Local Payment is unavailable.", 503);
    }
    return mapApplicationFailure(result);
  };
}
