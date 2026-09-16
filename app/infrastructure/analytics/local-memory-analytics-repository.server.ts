import type { LocalAnalyticsRepository } from "../../application/local-analytics.ts";
import type { LocalAnalyticsEvent, LocalAnalyticsEventName } from "../../domain/local-analytics.ts";

export class LocalMemoryAnalyticsRepository implements LocalAnalyticsRepository {
  private readonly events: LocalAnalyticsEvent[] = [];

  record(input: { readonly id: string; readonly eventName: LocalAnalyticsEventName; readonly productId?: string; readonly orderReference?: string; readonly metadata?: Readonly<Record<string, string>>; readonly occurredAt: string }): LocalAnalyticsEvent {
    const event: LocalAnalyticsEvent = {
      id: input.id,
      eventName: input.eventName,
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.orderReference ? { orderReference: input.orderReference } : {}),
      metadata: { ...(input.metadata ?? {}) },
      occurredAt: input.occurredAt,
      developmentOnly: true,
    };
    this.events.push(event);
    return { ...event, metadata: { ...event.metadata } };
  }

  list(): readonly LocalAnalyticsEvent[] {
    return this.events.slice().reverse().map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }
}
