import type { LocalAnalyticsRepository } from "../application/local-analytics.ts";
import { parseLocalAnalyticsEvent } from "../domain/local-analytics.ts";
import { readTrustedLocalAnalyticsConfig } from "../config/local-analytics-runtime.ts";
import { getSharedLocalAnalyticsRepository } from "./local-analytics-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";

export interface LocalAnalyticsHttpHandlerDependencies {
  readonly readConfig?: typeof readTrustedLocalAnalyticsConfig;
  readonly getRepository?: () => LocalAnalyticsRepository;
  readonly createId?: () => string;
  readonly now?: () => string;
}

function json(status: string, httpStatus: number): Response {
  return Response.json({ status }, { status: httpStatus, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } });
}

export function createLocalAnalyticsHttpHandler(overrides: LocalAnalyticsHttpHandlerDependencies = {}): (request: Request) => Promise<Response> {
  const readConfig = overrides.readConfig ?? readTrustedLocalAnalyticsConfig;
  const getRepository = overrides.getRepository ?? getSharedLocalAnalyticsRepository;
  const createId = overrides.createId ?? (() => `analytics-${globalThis.crypto.randomUUID()}`);
  const now = overrides.now ?? (() => new Date().toISOString());
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json("unavailable", 405);
    if (!isSameOriginCartMutation(request)) return json("unavailable", 403);
    let body: unknown;
    try { body = await request.json(); } catch { return json("invalid_event", 400); }
    const parsed = parseLocalAnalyticsEvent(body);
    if (!parsed.ok) return json("invalid_event", 400);
    let config;
    try { config = readConfig(); } catch { return json("unavailable", 503); }
    if (config.source !== "local_fake") return json("unavailable", 503);
    try {
      getRepository().record({ ...parsed.value, id: createId(), occurredAt: now() });
      return json("accepted", 202);
    } catch { return json("unavailable", 503); }
  };
}
