import type {
  NewsletterSubscription,
  NewsletterSubscriptionStatus,
} from "../domain/newsletter-subscription.ts";

export type NewsletterSubscribeResult =
  | { readonly status: "subscribed"; readonly value: NewsletterSubscription }
  | { readonly status: "already_subscribed"; readonly value: NewsletterSubscription };

export interface NewsletterSubscriptionRepository {
  subscribe(input: {
    readonly normalizedEmail: string;
    readonly now: string;
  }): NewsletterSubscribeResult;
  findByEmail?(normalizedEmail: string): NewsletterSubscription | null;
}

export function isNewsletterSubscriptionStatus(
  value: string,
): value is NewsletterSubscriptionStatus {
  return value === "subscribed";
}
