import type { AdminAuthorizationResult, AdminSessionVerifier } from "./admin-catalog-boundary.ts";

export const ADMIN_SETTINGS_MUTABLE_KEYS = ["supportEmail"] as const;
const PLACEHOLDER_SUPPORT_EMAIL = "hello@photogift.example";
const SUPPORT_EMAIL_MAX_LENGTH = 254;
const SUPPORT_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminSettingsSafeValue = {
  readonly supportEmail: string | null;
  readonly version: number;
  readonly updatedAt: string | null;
};

export type AdminSettingsReadOnlyValue = {
  readonly brandName: string;
  readonly siteOrigin: string;
  readonly deploymentEnvironment: string;
  readonly providerActivation: "inactive";
  readonly digitalDeliveryPolicy: {
    readonly status: "local_policy";
    readonly durationDays: 30;
    readonly maxDownloads: 5;
  };
};

export type AdminSettingsProjection = {
  readonly settings: AdminSettingsSafeValue;
  readonly readOnly: AdminSettingsReadOnlyValue;
};

export type AdminSettingsRepository = {
  read(): Promise<AdminSettingsRepositoryReadResult>;
  update(input: {
    readonly actionKeyDigest: string;
    readonly contextDigest: string;
    readonly expectedVersion: number;
    readonly supportEmail: string | null;
  }): Promise<AdminSettingsRepositoryUpdateResult>;
};

export type AdminSettingsRepositoryReadResult =
  | { readonly status: "found"; readonly value: AdminSettingsSafeValue }
  | { readonly status: "unavailable" };

export type AdminSettingsRepositoryUpdateResult =
  | { readonly status: "found"; readonly replayed: boolean; readonly value: AdminSettingsSafeValue }
  | { readonly status: "conflict"; readonly reason: "version_mismatch" | "idempotency_mismatch" }
  | { readonly status: "invalid_request"; readonly reason: string }
  | { readonly status: "unavailable" };

export type AdminSettingsInputIssue = {
  readonly path: string;
  readonly code: "invalid_type" | "missing" | "unknown_field" | "invalid_value";
  readonly message: string;
};

export type ParsedAdminSettingsPatch = {
  readonly expectedVersion: number;
  readonly supportEmail: string | null;
};

export function normalizeAdminSupportEmail(value: unknown):
  | { readonly status: "valid"; readonly value: string | null }
  | { readonly status: "invalid"; readonly issue: AdminSettingsInputIssue } {
  if (value === null) return { status: "valid", value: null };
  if (typeof value !== "string") {
    return {
      status: "invalid",
      issue: { path: "$.supportEmail", code: "invalid_type", message: "supportEmail must be a string or null." },
    };
  }
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > SUPPORT_EMAIL_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/.test(normalized)
    || /\s/.test(normalized)
    || normalized.toLowerCase() === PLACEHOLDER_SUPPORT_EMAIL
    || !SUPPORT_EMAIL_SHAPE.test(normalized)) {
    return {
      status: "invalid",
      issue: { path: "$.supportEmail", code: "invalid_value", message: "supportEmail is not an allowed support address." },
    };
  }
  return { status: "valid", value: normalized };
}

export function parseAdminSettingsPatch(value: unknown):
  | { readonly status: "valid"; readonly value: ParsedAdminSettingsPatch }
  | { readonly status: "invalid"; readonly issues: readonly AdminSettingsInputIssue[] } {
  if (!isRecord(value)) {
    return {
      status: "invalid",
      issues: [{ path: "$", code: "invalid_type", message: "Admin settings update must be an object." }],
    };
  }

  const issues: AdminSettingsInputIssue[] = [];
  for (const key of Object.keys(value)) {
    if (key !== "expectedVersion" && key !== "supportEmail") {
      issues.push({ path: `$.${key}`, code: "unknown_field", message: "This settings field is not editable." });
    }
  }
  if (!Object.prototype.hasOwnProperty.call(value, "expectedVersion")) {
    issues.push({ path: "$.expectedVersion", code: "missing", message: "expectedVersion is required." });
  } else if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) {
    issues.push({ path: "$.expectedVersion", code: "invalid_value", message: "expectedVersion must be a non-negative integer." });
  }
  if (!Object.prototype.hasOwnProperty.call(value, "supportEmail")) {
    issues.push({ path: "$.supportEmail", code: "missing", message: "supportEmail is required and may be null." });
  } else {
    const normalized = normalizeAdminSupportEmail(value.supportEmail);
    if (normalized.status === "invalid") issues.push(normalized.issue);
  }
  if (issues.length > 0) return { status: "invalid", issues };
  const normalized = normalizeAdminSupportEmail(value.supportEmail);
  if (normalized.status === "invalid") return { status: "invalid", issues: [normalized.issue] };
  return {
    status: "valid",
    value: { expectedVersion: Number(value.expectedVersion), supportEmail: normalized.value },
  };
}

export function parseAdminSettingsActionKey(value: string | null):
  | { readonly status: "valid"; readonly value: string }
  | { readonly status: "invalid" } {
  if (!value) return { status: "invalid" };
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 200 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? { status: "valid", value: normalized }
    : { status: "invalid" };
}

export function composeAdminSettingsProjection(
  settings: AdminSettingsSafeValue,
  readOnly: AdminSettingsReadOnlyValue,
): AdminSettingsProjection {
  return { settings, readOnly };
}

export async function verifyAdminBeforeRepository(
  verifier: AdminSessionVerifier,
): Promise<AdminAuthorizationResult> {
  try {
    return await verifier.verifyAdminSession();
  } catch {
    return { status: "unauthorized" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
