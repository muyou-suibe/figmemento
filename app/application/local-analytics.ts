import type { LocalAnalyticsEvent, LocalAnalyticsEventName } from "../domain/local-analytics.ts";

export interface LocalAnalyticsRepository {
  record(input: { readonly id: string; readonly eventName: LocalAnalyticsEventName; readonly productId?: string; readonly orderReference?: string; readonly metadata?: Readonly<Record<string, string>>; readonly occurredAt: string }): LocalAnalyticsEvent;
  list(): readonly LocalAnalyticsEvent[];
}
