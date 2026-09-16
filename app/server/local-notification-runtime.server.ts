import type { NotificationOutboxRepository } from "../application/notification-outbox.ts";
import { LocalMemoryNotificationOutbox } from "../infrastructure/notifications/local-memory-notification-outbox.server.ts";

let sharedRepository: NotificationOutboxRepository | null = null;
export function getSharedLocalNotificationOutbox(): NotificationOutboxRepository { sharedRepository ??= new LocalMemoryNotificationOutbox(); return sharedRepository; }
export function resetSharedLocalNotificationOutboxForTests(): void { sharedRepository = null; }
