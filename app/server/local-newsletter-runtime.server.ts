import type { NewsletterSubscriptionRepository } from "../application/newsletter-subscription.ts";
import {
  readTrustedLocalNewsletterConfig,
  type LocalNewsletterConfiguration,
} from "../config/local-newsletter-runtime.ts";
import { LocalMemoryNewsletterSubscriptionRepository } from "../infrastructure/newsletter/local-memory-newsletter-repository.server.ts";

export interface LocalNewsletterRuntime {
  readonly configuration: LocalNewsletterConfiguration;
  readonly repository: NewsletterSubscriptionRepository;
  readonly now: () => string;
}

export function createLocalNewsletterRuntime(options: {
  readonly configuration?: LocalNewsletterConfiguration;
  readonly repository?: NewsletterSubscriptionRepository;
  readonly now?: () => string;
} = {}): LocalNewsletterRuntime {
  return {
    configuration: options.configuration ?? readTrustedLocalNewsletterConfig(),
    repository: options.repository ?? new LocalMemoryNewsletterSubscriptionRepository(),
    now: options.now ?? (() => new Date().toISOString()),
  };
}

let sharedRepository: NewsletterSubscriptionRepository | null = null;

/** Server-only process-memory singleton. It is never a production provider. */
export function getSharedLocalNewsletterRepository(): NewsletterSubscriptionRepository {
  sharedRepository ??= new LocalMemoryNewsletterSubscriptionRepository();
  return sharedRepository;
}

export function resetSharedLocalNewsletterRuntimeForTests(): void {
  sharedRepository = null;
}
