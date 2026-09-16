import {
  parseCustomerUploadReceipt,
  type CustomerUploadReceipt,
} from "../domain/customer-upload.ts";

export type CustomerCustomizationImageUploadResult =
  | { readonly status: "accepted"; readonly receipt: CustomerUploadReceipt }
  | { readonly status: "released" }
  | { readonly status: "conflict" }
  | { readonly status: "invalid_request" }
  | { readonly status: "session_unavailable" }
  | { readonly status: "temporarily_unavailable" }
  | { readonly status: "malformed_success" };

export type CustomerCustomizationImageFetch = typeof fetch;

export interface CustomerCustomizationImageUploadInput {
  readonly productId: string;
  readonly fieldId: string;
  readonly file: File;
  /** Caller-held retry selector, not media identity or authorization. */
  readonly requestKey?: string;
  readonly recoveryOnly?: boolean;
  readonly releaseOnly?: boolean;
  readonly draftId?: string;
  readonly expectedVersion?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAcceptedUploadBody(value: unknown): CustomerUploadReceipt | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    !keys.includes("receipt")
    || keys.some((key) => key !== "receipt" && key !== "warnings")
    || (value.warnings !== undefined && !Array.isArray(value.warnings))
  ) return null;
  const receipt = parseCustomerUploadReceipt(value.receipt);
  return receipt.ok && receipt.value.lifecycle === "active" ? receipt.value : null;
}

/**
 * Sends the sole browser upload contract. The result intentionally exposes no
 * raw Response, provider payload, object locator, or diagnostic.
 */
export async function uploadCustomerCustomizationImage(
  input: CustomerCustomizationImageUploadInput,
  fetchImplementation: CustomerCustomizationImageFetch = fetch,
): Promise<CustomerCustomizationImageUploadResult> {
  const formData = new FormData();
  const file = input.file;
  formData.append("file", file);
  const query = new URLSearchParams({ productId: input.productId, fieldId: input.fieldId });
  if (input.draftId !== undefined) query.set("draftId", input.draftId);
  if (input.expectedVersion !== undefined) query.set("expectedVersion", String(input.expectedVersion));

  let response: Response;
  try {
    const requestKey = input.requestKey ?? crypto.randomUUID();
    if (input.recoveryOnly && input.releaseOnly) return { status: "invalid_request" };
    response = await fetchImplementation(`/api/uploads?${query.toString()}`, {
      method: "POST",
      headers: { "Idempotency-Key": requestKey, ...(input.recoveryOnly ? { "X-Upload-Recovery": "1" } : {}),
        ...(input.releaseOnly ? { "X-Upload-Release": "1" } : {}) },
      body: formData,
    });
  } catch {
    return { status: "temporarily_unavailable" };
  }

  if (response.status === 400) return { status: "invalid_request" };
  if (response.status === 404) return { status: "session_unavailable" };
  if (response.status === 409) return { status: "conflict" };
  if (response.status === 204 && input.releaseOnly) return { status: "released" };
  if (response.status !== 201) return { status: "temporarily_unavailable" };

  try {
    const receipt = parseAcceptedUploadBody(await response.json());
    return receipt
      ? { status: "accepted", receipt }
      : { status: "malformed_success" };
  } catch {
    return { status: "malformed_success" };
  }
}

let fallbackOperationSequence = 0;
let fallbackSlotSequence = 0;

/** A fresh browser-local operation ID; it is neither an upload receipt nor authorization. */
export function createCustomerCustomizationImageOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `upload-${crypto.randomUUID()}`;
  }
  fallbackOperationSequence += 1;
  return `upload-${Date.now()}-${fallbackOperationSequence}`;
}

/** A stable local UI coordination identity, never a receipt or server authority. */
export function createCustomerCustomizationImageSlotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `image-slot-${crypto.randomUUID()}`;
  }
  fallbackSlotSequence += 1;
  return `image-slot-${Date.now()}-${fallbackSlotSequence}`;
}
