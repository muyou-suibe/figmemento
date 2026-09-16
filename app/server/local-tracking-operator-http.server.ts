import { parseLocalTrackingOperatorActionInput, LocalTrackingOperatorService, type LocalTrackingOperatorResult } from "../application/local-tracking-operator-service.ts";
import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import { getSharedLocalTrackingRuntime } from "./local-tracking-runtime.server.ts";
import { createLocalTrackingDevelopmentOperatorVerifier } from "./local-tracking-development-operator.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import { getSharedLocalOrderFulfillmentReadPort } from "./local-order-runtime.server.ts";
import { getSharedLocalNotificationOutbox } from "./local-notification-runtime.server.ts";
import { parsePersistentShipmentAction, persistentShipmentCommand } from "./local-persistent-tracking.server.ts";

const MAX_BODY_BYTES = 16 * 1024;
function json(value: unknown, status: number) { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }
function unavailable() { return json({ status: "unavailable", issues: [{ code: "LOCAL_TRACKING_UNAVAILABLE", message: "Tracking is unavailable." }] }, 404); }
function service() { return new LocalTrackingOperatorService({ runtime: getSharedLocalTrackingRuntime(), verifier: createLocalTrackingDevelopmentOperatorVerifier() }); }
function map(result: LocalTrackingOperatorResult): Response {
  if (result.status === "found") return json(result.value, 200);
  if (result.status === "committed" || result.status === "replayed") return json(result, 200);
  if (result.status === "unavailable") return unavailable();
  if (result.status === "conflict") return json({ status: "blocked", issues: [{ code: "LOCAL_TRACKING_CONFLICT", message: "This Tracking action conflicts with an earlier request." }] }, 409);
  return json({ status: "blocked", issues: [{ code: "LOCAL_TRACKING_REJECTED", message: "This Tracking action was rejected." }] }, 409);
}
async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("too_large");
  return JSON.parse(text) as unknown;
}
export interface LocalTrackingOperatorHttpHandlerDependencies {
  readonly createService?: () => LocalTrackingOperatorService;
}

export function createLocalTrackingOperatorHttpHandler(overrides: LocalTrackingOperatorHttpHandlerDependencies = {}) {
  return async (request: Request, publicOrderReference: string): Promise<Response> => {
    if (!isSameOriginLocalFulfillmentRequest(request)) return json({ status: "blocked", issues: [{ code: "LOCAL_TRACKING_UNAVAILABLE", message: "Tracking request was not allowed." }] }, 403);
    if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();
    const persistent = !overrides.createService && process.env.LOCAL_TRACKING_SOURCE?.trim() === "local_persistent";
    const createService = overrides.createService ?? service;
    if (request.method === "GET") return persistent ? unavailable() : map(createService().read(publicOrderReference));
    if (request.method !== "POST") return json({ status: "blocked", issues: [{ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }] }, 405);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ status: "blocked", issues: [{ code: "INVALID_TRACKING_INPUT", message: "JSON request required." }] }, 400);
    let body: unknown;
    try { body = await readBody(request); } catch { return json({ status: "blocked", issues: [{ code: "INVALID_TRACKING_INPUT", message: "Tracking input is invalid." }] }, 400); }
    if (persistent) {
      const action = parsePersistentShipmentAction(body);
      if (!action) return json({ status: "blocked", issues: [{ code: "INVALID_TRACKING_INPUT", message: "Tracking input is invalid." }] }, 400);
      const result = await persistentShipmentCommand(publicOrderReference, action);
      if (result.status === "committed" || result.status === "replayed") {
        return json({ status: result.status, shipment: result.value, version: result.version }, 200);
      }
      if (result.status === "conflict") return json({ status: "blocked", issues: [{ code: "LOCAL_TRACKING_CONFLICT", message: "This Tracking action conflicts with an earlier request." }] }, 409);
      return unavailable();
    }
    const parsed = parseLocalTrackingOperatorActionInput(body, publicOrderReference);
    if (!parsed.ok) return json({ status: "blocked", issues: [{ code: "INVALID_TRACKING_INPUT", message: "Tracking input is invalid." }] }, 400);
    const result = createService().mutate(publicOrderReference, parsed.value);
    if (result.status === "committed" && parsed.value.actionKind === "mark_delivered") {
      const order = getSharedLocalOrderFulfillmentReadPort().findSnapshotForFulfillment(publicOrderReference);
      if (order.status === "found") {
        getSharedLocalNotificationOutbox().enqueue({
          recipient: order.snapshot.contact.email,
          type: "order_delivered",
          reference: publicOrderReference,
          payload: { email: order.snapshot.contact.email },
          createdAt: new Date().toISOString(),
        });
        getSharedLocalNotificationOutbox().enqueue({
          recipient: order.snapshot.contact.email,
          type: "review_invitation",
          reference: publicOrderReference,
          payload: { email: order.snapshot.contact.email },
          createdAt: new Date().toISOString(),
        });
      }
    }
    return map(result);
  };
}
