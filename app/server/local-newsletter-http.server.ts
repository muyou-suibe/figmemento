import { readTrustedLocalNewsletterConfig } from "../config/local-newsletter-runtime.ts";
import { parseLocalNewsletterRequest } from "../domain/newsletter-subscription.ts";
import type { NewsletterSubscriptionRepository } from "../application/newsletter-subscription.ts";
import { getSharedLocalNewsletterRepository } from "./local-newsletter-runtime.server.ts";
import { getSharedLocalNotificationOutbox } from "./local-notification-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";

export type LocalNewsletterPublicStatus =
  | "subscribed"
  | "already_subscribed"
  | "invalid_email"
  | "unavailable";

export interface LocalNewsletterHttpHandlerDependencies {
  readonly readConfig?: typeof readTrustedLocalNewsletterConfig;
  readonly getRepository?: () => NewsletterSubscriptionRepository;
  readonly now?: () => string;
  readonly getNotificationOutbox?: typeof getSharedLocalNotificationOutbox;
}

function response(status: LocalNewsletterPublicStatus, httpStatus: number): Response {
  return Response.json(
    { status },
    {
      status: httpStatus,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

export function createLocalNewsletterHttpHandler(
  overrides: LocalNewsletterHttpHandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalNewsletterConfig;
  const getRepository = overrides.getRepository ?? getSharedLocalNewsletterRepository;
  const now = overrides.now ?? (() => new Date().toISOString());
  const getNotificationOutbox = overrides.getNotificationOutbox ?? getSharedLocalNotificationOutbox;

  return async function handleLocalNewsletter(request: Request): Promise<Response> {
    if (request.method !== "POST") return response("unavailable", 405);
    if (!isSameOriginCartMutation(request)) return response("unavailable", 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response("invalid_email", 400);
    }
    const parsed = parseLocalNewsletterRequest(body);
    if (!parsed.ok) return response(parsed.reason, 400);

    let configuration;
    try {
      configuration = readConfig();
    } catch {
      return response("unavailable", 503);
    }
    if (configuration.source !== "local_fake") return response("unavailable", 503);

    let result;
    try {
      result = getRepository().subscribe({ normalizedEmail: parsed.value.normalizedEmail, now: now() });
    } catch {
      return response("unavailable", 503);
    }
    if (result.status === "subscribed") {
      getNotificationOutbox().enqueue({
        recipient: parsed.value.normalizedEmail,
        type: "newsletter_subscribed",
        payload: { email: parsed.value.normalizedEmail },
        createdAt: now(),
      });
    }
    return response(result.status, 200);
  };
}
