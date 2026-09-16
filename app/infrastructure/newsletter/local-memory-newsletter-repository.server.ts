import type {
  NewsletterSubscribeResult,
  NewsletterSubscriptionRepository,
} from "../../application/newsletter-subscription.ts";
import type { NewsletterSubscription } from "../../domain/newsletter-subscription.ts";

export interface LocalNewsletterSubscriptionIdGenerator {
  nextId(): string;
}

export function createLocalNewsletterSubscriptionIdGenerator(): LocalNewsletterSubscriptionIdGenerator {
  return { nextId: () => `newsletter-${globalThis.crypto.randomUUID()}` };
}

function cloneSubscription(subscription: NewsletterSubscription): NewsletterSubscription {
  return { ...subscription };
}

/** Process-memory only. It is not a production persistence provider. */
export class LocalMemoryNewsletterSubscriptionRepository implements NewsletterSubscriptionRepository {
  private readonly subscriptionsByEmail = new Map<string, NewsletterSubscription>();
  private readonly ids: LocalNewsletterSubscriptionIdGenerator;

  constructor(ids: LocalNewsletterSubscriptionIdGenerator = createLocalNewsletterSubscriptionIdGenerator()) {
    this.ids = ids;
  }

  subscribe(input: { readonly normalizedEmail: string; readonly now: string }): NewsletterSubscribeResult {
    const existing = this.subscriptionsByEmail.get(input.normalizedEmail);
    if (existing) return { status: "already_subscribed", value: cloneSubscription(existing) };

    const subscription: NewsletterSubscription = {
      id: this.ids.nextId(),
      email: input.normalizedEmail,
      normalizedEmail: input.normalizedEmail,
      status: "subscribed",
      createdAt: input.now,
    };
    this.subscriptionsByEmail.set(subscription.normalizedEmail, subscription);
    return { status: "subscribed", value: cloneSubscription(subscription) };
  }

  count(): number {
    return this.subscriptionsByEmail.size;
  }

  findByEmail(normalizedEmail: string): NewsletterSubscription | null {
    const subscription = this.subscriptionsByEmail.get(normalizedEmail);
    return subscription ? cloneSubscription(subscription) : null;
  }
}
