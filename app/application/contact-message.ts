import type { ContactMessage, LocalContactMessageRequest } from "../domain/contact-message.ts";

export type ReceiveContactMessageResult =
  | { readonly status: "received"; readonly value: ContactMessage }
  | { readonly status: "unavailable" };

export interface ContactMessageRepository {
  receive(input: LocalContactMessageRequest & { readonly id: string; readonly now: string }): ReceiveContactMessageResult;
}
