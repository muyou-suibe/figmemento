import type {
  CustomerImageValidationIssue,
  CustomerImageValidationIssueCode,
  CustomerImageWarning,
  CustomerImageWarningCode,
} from "../domain/customer-image-inspection.ts";

export type CustomerInputFailureOperation = "upload" | "preview";
export type CustomerInputFailureCategory =
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "upload_rejected"
  | "stale_or_expired"
  | "temporary_failure";

/**
 * Closed, server-safe observability event. It intentionally has no metadata,
 * request, identity, filename, diagnostic, or provider-location field.
 */
export interface CustomerInputSafeEvent {
  readonly event: "customer_input_failure";
  readonly operation: CustomerInputFailureOperation;
  readonly category: CustomerInputFailureCategory;
  readonly correlationId: string;
}

export interface CustomerInputSafeEventSink {
  record(event: CustomerInputSafeEvent): void;
}

export interface CustomerInputSafeObservability {
  record(operation: CustomerInputFailureOperation, category: CustomerInputFailureCategory): void;
}

export interface CustomerInputSafeObservabilityDependencies {
  readonly createCorrelationId?: () => string;
  readonly sink?: CustomerInputSafeEventSink;
}

const ISSUE_MESSAGES: Record<CustomerImageValidationIssueCode, string> = {
  unsupported_type: "Choose a supported image type for this field.",
  invalid_image: "Choose a valid supported image file.",
  too_large: "Image byte size exceeds the configured maximum.",
  dimensions_too_small: "Image dimensions are below the configured minimum.",
  invalid_filename: "Filename is not a safe display value.",
  count_too_low: "Image count is below the configured minimum.",
  count_too_high: "Image count exceeds the configured maximum.",
};

const WARNING_MESSAGES: Record<CustomerImageWarningCode, string> = {
  below_recommended_dimensions: "Image dimensions are below the configured recommendation.",
  declared_mime_mismatch: "Declared image type does not match the detected image bytes.",
  declared_byte_size_mismatch: "Declared image size does not match the received image bytes.",
};

function defaultCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Failures in optional observability cannot change a customer-visible result.
 * Unknown thrown values are deliberately ignored, never inspected or logged.
 */
export function createCustomerInputSafeObservability(
  dependencies: CustomerInputSafeObservabilityDependencies = {},
): CustomerInputSafeObservability {
  const createCorrelationId = dependencies.createCorrelationId ?? defaultCorrelationId;
  return {
    record(operation, category): void {
      try {
        const correlationId = createCorrelationId();
        if (typeof correlationId !== "string" || correlationId.length === 0 || correlationId.length > 128) return;
        dependencies.sink?.record({
          event: "customer_input_failure",
          operation,
          category,
          correlationId,
        });
      } catch {
        // A telemetry sink is optional and must never receive an unknown error.
      }
    },
  };
}

export function safeCustomerImageIssues(
  issues: readonly CustomerImageValidationIssue[],
): readonly CustomerImageValidationIssue[] {
  return issues.flatMap((issue) => {
    const message = ISSUE_MESSAGES[issue.code];
    return message ? [{ code: issue.code, message }] : [];
  });
}

export function safeCustomerImageWarnings(
  warnings: readonly CustomerImageWarning[],
): readonly CustomerImageWarning[] {
  return warnings.flatMap((warning) => {
    const message = WARNING_MESSAGES[warning.code];
    return message ? [{ code: warning.code, message }] : [];
  });
}

export function customerInputFailureMessage(
  operation: CustomerInputFailureOperation,
  category: CustomerInputFailureCategory,
): string {
  if (operation === "upload") {
    if (category === "invalid_request") return "Invalid upload request.";
    if (category === "forbidden") return "Forbidden.";
    if (category === "not_found" || category === "stale_or_expired") return "Customer upload is unavailable.";
    return "Customer upload is temporarily unavailable.";
  }
  if (category === "invalid_request" || category === "forbidden" || category === "not_found" || category === "stale_or_expired") {
    return "Customer input preview is unavailable.";
  }
  return "Customer input preview is temporarily unavailable.";
}
