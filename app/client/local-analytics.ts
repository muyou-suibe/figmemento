import type { LocalAnalyticsEventName } from "../domain/local-analytics.ts";

export function trackLocalAnalyticsEvent(input: { readonly eventName: LocalAnalyticsEventName; readonly productId?: string; readonly orderReference?: string; readonly metadata?: Readonly<Record<string, string>> }): void {
  if (typeof window === "undefined") return;
  void fetch("/api/local-analytics", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}
