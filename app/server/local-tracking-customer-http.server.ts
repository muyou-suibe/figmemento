import { LocalTrackingCustomerService, type LocalTrackingCustomerServiceResult } from "../application/local-tracking-customer-service.ts";
import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import { getSharedLocalOrderRepository } from "./local-order-runtime.server.ts";
import { getSharedLocalTrackingRepository } from "./local-tracking-runtime.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import { readLocalOrderBrowserCapability } from "./local-order-http.server.ts";
import { readPersistentCustomerTracking } from "./local-persistent-tracking-customer.server.ts";

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } });
}
function unavailable(): Response {
  return jsonResponse({ status: "unavailable", issues: [{ code: "LOCAL_TRACKING_UNAVAILABLE", message: "Tracking is unavailable." }] }, 404);
}
function mapResult(result: LocalTrackingCustomerServiceResult): Response {
  if (result.status === "found") return jsonResponse(result.value, 200);
  return unavailable();
}

export interface LocalTrackingCustomerHttpHandlerDependencies {
  readonly createService?: () => LocalTrackingCustomerService;
}

export function createLocalTrackingCustomerHttpHandler(
  overrides: LocalTrackingCustomerHttpHandlerDependencies = {},
): (request: Request, publicOrderReference: string) => Promise<Response> {
  return async (request, publicOrderReference) => {
    if (request.method !== "GET") return jsonResponse({ status: "blocked", issues: [{ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }] }, 405);
    if (!isSameOriginLocalFulfillmentRequest(request)) return jsonResponse({ status: "unavailable", issues: [{ code: "LOCAL_TRACKING_UNAVAILABLE", message: "Tracking is unavailable." }] }, 404);
    if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();
    if (process.env.LOCAL_TRACKING_SOURCE?.trim() === "local_persistent") {
      const result = await readPersistentCustomerTracking(request, publicOrderReference);
      return result.status === "found" ? jsonResponse(result.value, 200) : unavailable();
    }
    const browserCapability = readLocalOrderBrowserCapability(request);
    if (!browserCapability) return unavailable();

    let service: LocalTrackingCustomerService;
    try {
      service = overrides.createService?.() ?? new LocalTrackingCustomerService({
        getOrderRepository: getSharedLocalOrderRepository,
        getTrackingRepository: getSharedLocalTrackingRepository,
      });
    } catch {
      return unavailable();
    }
    try {
      return mapResult(await service.read({ publicOrderReference, browserCapability }));
    } catch {
      return unavailable();
    }
  };
}
