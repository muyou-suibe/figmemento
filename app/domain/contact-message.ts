export type ContactMessageStatus = "received";
export type ContactIssueType = "general" | "quality_issue" | "damaged" | "wrong_item" | "order_change";

export interface ContactMessage {
  readonly id: string;
  readonly name: string;
  readonly normalizedEmail: string;
  readonly publicOrderReference?: string;
  readonly issueType: ContactIssueType;
  readonly message: string;
  readonly status: ContactMessageStatus;
  readonly createdAt: string;
}

export interface LocalContactMessageRequest {
  readonly name: string;
  readonly normalizedEmail: string;
  readonly publicOrderReference?: string;
  readonly issueType?: ContactIssueType;
  readonly message: string;
}

export type LocalContactMessageRequestResult =
  | { readonly ok: true; readonly value: LocalContactMessageRequest }
  | { readonly ok: false; readonly reason: "invalid_message" };

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_ORDER_REFERENCE_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 4000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_KEYS = new Set(["name", "email", "publicOrderReference", "issueType", "message"]);
const ISSUE_TYPES = new Set<ContactIssueType>(["general", "quality_issue", "damaged", "wrong_item", "order_change"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

export function parseLocalContactMessageRequest(value: unknown): LocalContactMessageRequestResult {
  if (!isRecord(value)) return { ok: false, reason: "invalid_message" };
  if (Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) {
    return { ok: false, reason: "invalid_message" };
  }

  const name = normalizedString(value.name, MAX_NAME_LENGTH);
  const email = normalizedString(value.email, MAX_EMAIL_LENGTH)?.toLowerCase();
  const message = normalizedString(value.message, MAX_MESSAGE_LENGTH);
  if (!name || !email || !EMAIL_PATTERN.test(email) || !message) {
    return { ok: false, reason: "invalid_message" };
  }

  const issueType = value.issueType === undefined ? undefined : value.issueType;
  if (issueType !== undefined && (typeof issueType !== "string" || !ISSUE_TYPES.has(issueType as ContactIssueType))) return { ok: false, reason: "invalid_message" };

  let publicOrderReference: string | undefined;
  if (value.publicOrderReference !== undefined) {
    publicOrderReference = normalizedString(value.publicOrderReference, MAX_ORDER_REFERENCE_LENGTH) ?? undefined;
    if (!publicOrderReference) return { ok: false, reason: "invalid_message" };
  }

  return {
    ok: true,
    value: { name, normalizedEmail: email, ...(publicOrderReference ? { publicOrderReference } : {}), ...(issueType ? { issueType: issueType as ContactIssueType } : {}), message },
  };
}
