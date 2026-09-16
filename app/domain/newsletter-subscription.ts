export type NewsletterSubscriptionStatus = "subscribed";

export interface NewsletterSubscription {
  readonly id: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly status: NewsletterSubscriptionStatus;
  readonly createdAt: string;
}

export interface LocalNewsletterRequest {
  readonly email: string;
  readonly normalizedEmail: string;
}

export type LocalNewsletterRequestResult =
  | { readonly ok: true; readonly value: LocalNewsletterRequest }
  | { readonly ok: false; readonly reason: "invalid_email" };

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_KEYS = new Set(["email"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeNewsletterEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseLocalNewsletterRequest(value: unknown): LocalNewsletterRequestResult {
  if (!isRecord(value)) return { ok: false, reason: "invalid_email" };
  if (Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) {
    return { ok: false, reason: "invalid_email" };
  }
  if (typeof value.email !== "string") return { ok: false, reason: "invalid_email" };

  const normalizedEmail = normalizeNewsletterEmail(value.email);
  if (
    normalizedEmail.length === 0
    || normalizedEmail.length > MAX_EMAIL_LENGTH
    || !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    return { ok: false, reason: "invalid_email" };
  }

  return { ok: true, value: { email: normalizedEmail, normalizedEmail } };
}
