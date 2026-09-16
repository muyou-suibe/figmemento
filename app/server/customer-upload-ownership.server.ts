import type {
  CustomerUploadObjectStore,
} from "../application/customer-upload-object-store.ts";
import type {
  CustomerUploadPreviewAccessPort,
  CustomerUploadReceiptRepository,
  CustomerUploadReceiptRepositoryResult,
} from "../application/customer-upload-repository.ts";
import type {
  CustomerUploadOwnerId,
  CustomerUploadReceipt,
} from "../domain/customer-upload.ts";
import {
  isIdentifier,
  isRecord,
  unknownFieldIssues,
} from "../domain/catalog/validation.ts";
import {
  getGuestDraftOwnerCookieName,
  type GuestDraftOwnerService,
} from "../lib/guest-draft-owner.ts";

export type CustomerUploadProtectedOperation =
  | "preview"
  | "replace"
  | "remove"
  | "attach"
  | "customer_cleanup";

export interface CustomerUploadReceiptTarget {
  receiptId: string;
}

export type CustomerUploadOwnerGateResult =
  | { status: "authorized"; ownerId: CustomerUploadOwnerId }
  | { status: "unavailable" }
  | { status: "source_failure" };

export type CustomerUploadProtectedBoundaryResult<T> =
  | { status: "continued"; value: T }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "source_failure" };

export interface CustomerUploadProtectedBoundaryDependencies {
  readonly ownerService: Pick<GuestDraftOwnerService, "verifyGuestDraftOwnerContext">;
  readonly createReceiptRepository: () => Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
  readonly createObjectStore: () => Pick<CustomerUploadObjectStore, "readPrivateObject">;
  readonly createPreviewAccess: () => CustomerUploadPreviewAccessPort;
}

export interface CustomerUploadOwnedReceiptContinuation {
  readonly ownerId: CustomerUploadOwnerId;
  readonly receipt: CustomerUploadReceipt;
  /** These factories are available only after verified owner-scoped receipt lookup. */
  readonly createObjectStore: () => Pick<CustomerUploadObjectStore, "readPrivateObject">;
  readonly createPreviewAccess: () => CustomerUploadPreviewAccessPort;
}

/**
 * Trusted expiry cleanup has no browser request or guest cookie. It remains a
 * separate future server-only capability and must not reuse customer ownership.
 */
export interface TrustedCustomerUploadCleanupAuthorization {
  readonly kind: "trusted_system_cleanup";
}

function readCookie(request: Request, name: string): string | null {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!value) return null;
  try {
    return decodeURIComponent(value.trim().slice(name.length + 1));
  } catch {
    return null;
  }
}

/** Mirrors the established exact-Origin plus Sec-Fetch-Site mutation rule. */
export function isSameOriginCustomerUploadMutation(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    const destination = new URL(request.url);
    if (origin.origin !== destination.origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === null || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

export function isCustomerUploadMutation(operation: CustomerUploadProtectedOperation): boolean {
  return operation !== "preview";
}

/** A strict target parser: browser payloads never carry ownership authority. */
export function parseCustomerUploadReceiptTarget(
  value: unknown,
): CustomerUploadReceiptTarget | null {
  if (!isRecord(value)) return null;
  if (unknownFieldIssues(value, ["receiptId"]).length > 0 || !isIdentifier(value.receiptId)) return null;
  return { receiptId: value.receiptId };
}

/**
 * Verifies only the HttpOnly context. Missing, invalid, and expired contexts
 * deliberately collapse to one internal unavailable outcome; no owner ID is
 * extracted unless verification is valid.
 */
export async function verifyCustomerUploadOwner(
  request: Request,
  ownerService: Pick<GuestDraftOwnerService, "verifyGuestDraftOwnerContext">,
): Promise<CustomerUploadOwnerGateResult> {
  const verified = await ownerService.verifyGuestDraftOwnerContext(
    readCookie(request, getGuestDraftOwnerCookieName()),
  );
  if (verified.status === "valid") return { status: "authorized", ownerId: verified.ownerId };
  return verified.status === "source_failure" ? { status: "source_failure" } : { status: "unavailable" };
}

function receiptLookupPermitsContinuation(
  result: CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>,
): result is { status: "found"; value: CustomerUploadReceipt } {
  return result.status === "found";
}

/**
 * The reusable authorization shell for future private customer operations.
 * It performs neither storage nor lifecycle mutation: its sole responsibility
 * is proving verified owner -> owner-scoped receipt -> lazy provider ordering.
 */
export async function executeCustomerUploadProtectedReceiptOperation<T>(
  request: Request,
  operation: CustomerUploadProtectedOperation,
  target: unknown,
  dependencies: CustomerUploadProtectedBoundaryDependencies,
  continueWithOwnedReceipt: (input: CustomerUploadOwnedReceiptContinuation) => Promise<T>,
): Promise<CustomerUploadProtectedBoundaryResult<T>> {
  if (isCustomerUploadMutation(operation) && !isSameOriginCustomerUploadMutation(request)) {
    return { status: "forbidden" };
  }
  const parsedTarget = parseCustomerUploadReceiptTarget(target);
  if (!parsedTarget) return { status: "not_found" };

  let owner: CustomerUploadOwnerGateResult;
  try {
    owner = await verifyCustomerUploadOwner(request, dependencies.ownerService);
  } catch {
    return { status: "source_failure" };
  }
  if (owner.status === "source_failure") return { status: "source_failure" };
  if (owner.status !== "authorized") return { status: "not_found" };

  let lookup: CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>;
  try {
    lookup = await dependencies.createReceiptRepository().findOwnedReceipt(parsedTarget.receiptId, owner.ownerId);
  } catch {
    return { status: "source_failure" };
  }
  if (lookup.status === "source_failure") return { status: "source_failure" };
  if (!receiptLookupPermitsContinuation(lookup)) return { status: "not_found" };

  try {
    return {
      status: "continued",
      value: await continueWithOwnedReceipt({
        ownerId: owner.ownerId,
        receipt: lookup.value,
        createObjectStore: dependencies.createObjectStore,
        createPreviewAccess: dependencies.createPreviewAccess,
      }),
    };
  } catch {
    return { status: "source_failure" };
  }
}

/** Public mapping keeps context failure and missing/cross-owner receipt indistinguishable. */
export function customerUploadProtectedBoundaryResponse<T>(
  result: CustomerUploadProtectedBoundaryResult<T>,
): Response {
  switch (result.status) {
    case "continued": return Response.json({ status: "continued" });
    case "not_found": return Response.json({ status: "not_found" }, { status: 404 });
    case "forbidden": return Response.json({ status: "forbidden" }, { status: 403 });
    case "source_failure": return Response.json(
      { status: "source_failure", message: "Customer upload is temporarily unavailable." },
      { status: 503 },
    );
  }
}
