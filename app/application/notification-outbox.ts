import type { LocalNotificationType, NotificationMessage } from "../domain/notification-outbox.ts";

export interface NotificationOutboxRepository {
  enqueue(input: { readonly recipient: string; readonly type: LocalNotificationType; readonly reference?: string; readonly payload?: Readonly<Record<string, string>>; readonly createdAt: string }): NotificationMessage;
  list(): readonly NotificationMessage[];
}
