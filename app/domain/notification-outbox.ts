export type LocalNotificationType = "newsletter_subscribed" | "contact_received" | "order_created" | "payment_succeeded" | "order_delivered" | "review_invitation";
export type LocalNotificationStatus = "queued_local";

export interface NotificationMessage {
  readonly id: string;
  readonly recipient: string;
  readonly type: LocalNotificationType;
  readonly reference?: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly status: LocalNotificationStatus;
  readonly createdAt: string;
}
