import type { ContactMessageRepository, ReceiveContactMessageResult } from "../../application/contact-message.ts";
import type { ContactMessage, LocalContactMessageRequest } from "../../domain/contact-message.ts";

export interface LocalContactMessageIdGenerator {
  nextId(): string;
}

export function createLocalContactMessageIdGenerator(): LocalContactMessageIdGenerator {
  return { nextId: () => `contact-${globalThis.crypto.randomUUID()}` };
}

function cloneMessage(value: ContactMessage): ContactMessage {
  return { ...value };
}

/** Process-memory only. It is not a production persistence provider. */
export class LocalMemoryContactMessageRepository implements ContactMessageRepository {
  private readonly messages: ContactMessage[] = [];
  private readonly ids: LocalContactMessageIdGenerator;

  constructor(ids: LocalContactMessageIdGenerator = createLocalContactMessageIdGenerator()) {
    this.ids = ids;
  }

  receive(input: LocalContactMessageRequest & { readonly id: string; readonly now: string }): ReceiveContactMessageResult {
    const message: ContactMessage = {
      id: input.id,
      name: input.name,
      normalizedEmail: input.normalizedEmail,
      ...(input.publicOrderReference ? { publicOrderReference: input.publicOrderReference } : {}),
      issueType: input.issueType ?? "general",
      message: input.message,
      status: "received",
      createdAt: input.now,
    };
    this.messages.push(message);
    return { status: "received", value: cloneMessage(message) };
  }

  createId(): string {
    return this.ids.nextId();
  }

  count(): number {
    return this.messages.length;
  }
}
