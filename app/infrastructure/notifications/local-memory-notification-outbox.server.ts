import type { NotificationOutboxRepository } from "../../application/notification-outbox.ts";
import type { LocalNotificationType, NotificationMessage } from "../../domain/notification-outbox.ts";

/** Provider-neutral local event intent. It never sends external email. */
export class LocalMemoryNotificationOutbox implements NotificationOutboxRepository {
  private readonly messages: NotificationMessage[] = [];
  enqueue(input: { readonly recipient: string; readonly type: LocalNotificationType; readonly reference?: string; readonly payload?: Readonly<Record<string, string>>; readonly createdAt: string }): NotificationMessage {
    const message: NotificationMessage = { id: `notification-${globalThis.crypto.randomUUID()}`, recipient: input.recipient, type: input.type, ...(input.reference ? { reference: input.reference } : {}), payload: { ...(input.payload ?? {}) }, status: "queued_local", createdAt: input.createdAt };
    this.messages.push(message);
    return { ...message, payload: { ...message.payload } };
  }
  list(): readonly NotificationMessage[] { return this.messages.slice().reverse().map((message) => ({ ...message, payload: { ...message.payload } })); }
}
