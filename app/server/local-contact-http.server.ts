import type { ContactMessageRepository } from "../application/contact-message.ts";
import { readTrustedLocalContactConfig } from "../config/local-contact-runtime.ts";
import { parseLocalContactMessageRequest } from "../domain/contact-message.ts";
import { getSharedLocalContactRuntime } from "./local-contact-runtime.server.ts";
import { getSharedLocalNotificationOutbox } from "./local-notification-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";

export type LocalContactPublicStatus = "received" | "invalid_message" | "unavailable";

export interface LocalContactHttpHandlerDependencies {
  readonly readConfig?: typeof readTrustedLocalContactConfig;
  readonly getRepository?: () => ContactMessageRepository;
  readonly createId?: () => string;
  readonly now?: () => string;
  readonly getNotificationOutbox?: typeof getSharedLocalNotificationOutbox;
}

function response(status: LocalContactPublicStatus, httpStatus: number): Response {
  return Response.json(
    { status },
    { status: httpStatus, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } },
  );
}

export function createLocalContactHttpHandler(
  overrides: LocalContactHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalContactConfig;
  const getRepository = overrides.getRepository ?? (() => getSharedLocalContactRuntime().repository);
  const createId = overrides.createId ?? (() => getSharedLocalContactRuntime().createId());
  const now = overrides.now ?? (() => new Date().toISOString());
  const getNotificationOutbox = overrides.getNotificationOutbox ?? getSharedLocalNotificationOutbox;

  return async function handleLocalContact(request: Request): Promise<Response> {
    if (request.method !== "POST") return response("unavailable", 405);
    if (!isSameOriginCartMutation(request)) return response("unavailable", 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response("invalid_message", 400);
    }
    const parsed = parseLocalContactMessageRequest(body);
    if (!parsed.ok) return response(parsed.reason, 400);

    let configuration;
    try {
      configuration = readConfig();
    } catch {
      return response("unavailable", 503);
    }
    if (configuration.source !== "local_fake") return response("unavailable", 503);

    try {
      const result = getRepository().receive({ ...parsed.value, id: createId(), now: now() });
      if (result.status !== "received") return response("unavailable", 503);
      getNotificationOutbox().enqueue({
        recipient: parsed.value.normalizedEmail,
        type: "contact_received",
        ...(parsed.value.publicOrderReference ? { reference: parsed.value.publicOrderReference } : {}),
        payload: { name: parsed.value.name, issueType: parsed.value.issueType ?? "general", message: parsed.value.message },
        createdAt: now(),
      });
      return response("received", 200);
    } catch {
      return response("unavailable", 503);
    }
  };
}
