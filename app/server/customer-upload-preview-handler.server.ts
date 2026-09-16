import type { CustomerUploadObjectStore } from "../application/customer-upload-object-store.ts";
import type {
  CustomerUploadPreviewAccessPort,
  CustomerUploadReceiptRepository,
  CustomerUploadReceiptRepositoryResult,
} from "../application/customer-upload-repository.ts";
import {
  hasCustomerUploadExpiryElapsed,
  type CustomerUploadReceipt,
  type CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";
import type { AllowedImageMimeType } from "../domain/customization-field.ts";
import type { GuestDraftOwnerService } from "../lib/guest-draft-owner.ts";
import {
  executeCustomerUploadProtectedReceiptOperation,
  type CustomerUploadProtectedBoundaryDependencies,
} from "./customer-upload-ownership.server.ts";
import {
  createCustomerInputSafeObservability,
  customerInputFailureMessage,
  type CustomerInputFailureCategory,
  type CustomerInputSafeObservability,
} from "./customer-input-safe-failure.server.ts";

const IMAGE_CONTENT_TYPES: readonly AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

type PreviewOutcome =
  | { readonly status: "image"; readonly response: Response }
  | { readonly status: "unavailable" }
  | { readonly status: "source_failure" };

export interface CustomerUploadPreviewHttpHandlerDependencies {
  readonly ownerService: Pick<GuestDraftOwnerService, "verifyGuestDraftOwnerContext">;
  readonly createReceiptRepository: () => Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
  readonly createPreviewAccess: () => CustomerUploadPreviewAccessPort;
  readonly createObjectStore: () => Pick<CustomerUploadObjectStore, "readPrivateObject">;
  /** Server-observed time; preview capability TTL remains provider/deployment configuration. */
  readonly now: () => CustomerUploadTimestamp;
  readonly observability?: CustomerInputSafeObservability;
}

function isTimestamp(value: unknown): value is CustomerUploadTimestamp {
  return typeof value === "string" && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function previewTarget(request: Request): { readonly receiptId: string } | null {
  try {
    const url = new URL(request.url);
    if (url.searchParams.size !== 1 || url.searchParams.getAll("receiptId").length !== 1) return null;
    const receiptId = url.searchParams.get("receiptId");
    return typeof receiptId === "string" ? { receiptId } : null;
  } catch {
    return null;
  }
}

function isAsyncIterableBytes(value: unknown): value is AsyncIterable<Uint8Array> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}

function privateImageStream(bytes: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = bytes[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch {
        // Once headers are committed, a stream failure cannot become a safe JSON
        // response. Do not buffer private objects solely to rewrite that error.
        controller.error(new Error("Customer input preview stream failed."));
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

function isActiveAndUnexpired(receipt: CustomerUploadReceipt, observedAt: CustomerUploadTimestamp): boolean {
  return receipt.lifecycle === "active" && !hasCustomerUploadExpiryElapsed(receipt, observedAt);
}

function capabilityPermitsRead(
  value: unknown,
  receipt: CustomerUploadReceipt,
  observedAt: CustomerUploadTimestamp,
): "allowed" | "unavailable" | "source_failure" {
  if (!value || typeof value !== "object") return "source_failure";
  const capability = value as { receiptId?: unknown; expiresAt?: unknown };
  if (capability.receiptId !== receipt.receiptId || !isTimestamp(capability.expiresAt)) return "source_failure";
  if (Date.parse(capability.expiresAt) <= Date.parse(observedAt)) return "unavailable";
  if (Date.parse(capability.expiresAt) > Date.parse(receipt.expiresAt)) return "source_failure";
  return "allowed";
}

function imageResponse(contentType: AllowedImageMimeType, bytes: AsyncIterable<Uint8Array>): Response {
  return new Response(privateImageStream(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
    },
  });
}

function protectedDependencies(
  dependencies: CustomerUploadPreviewHttpHandlerDependencies,
): CustomerUploadProtectedBoundaryDependencies {
  return {
    ownerService: dependencies.ownerService,
    createReceiptRepository: dependencies.createReceiptRepository,
    createPreviewAccess: dependencies.createPreviewAccess,
    createObjectStore: dependencies.createObjectStore,
  };
}

/**
 * Provider-neutral GET boundary for an authorized server-backed customer-input
 * preview. The opaque receipt ID identifies a request; the guest owner cookie
 * and server-side capability verification authorize it.
 */
export function createCustomerUploadPreviewHttpHandler(
  dependencies: CustomerUploadPreviewHttpHandlerDependencies,
): (request: Request) => Promise<Response> {
  const observability = dependencies.observability ?? createCustomerInputSafeObservability();

  function failure(category: CustomerInputFailureCategory, status: number): Response {
    observability.record("preview", category);
    return Response.json({ error: customerInputFailureMessage("preview", category) }, { status });
  }

  return async function handleCustomerUploadPreview(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      observability.record("preview", "invalid_request");
      return Response.json({ error: "Method not allowed." }, { status: 405, headers: { allow: "GET" } });
    }
    const target = previewTarget(request);
    if (!target) return failure("invalid_request", 404);

    let observedAt: CustomerUploadTimestamp;
    try {
      observedAt = dependencies.now();
    } catch {
      return failure("temporary_failure", 503);
    }
    if (!isTimestamp(observedAt)) {
      return failure("temporary_failure", 503);
    }

    const protectedResult = await executeCustomerUploadProtectedReceiptOperation(
      request,
      "preview",
      target,
      protectedDependencies(dependencies),
      async ({ ownerId, receipt, createPreviewAccess, createObjectStore }): Promise<PreviewOutcome> => {
        if (!isActiveAndUnexpired(receipt, observedAt)) return { status: "unavailable" };

        let authorization: CustomerUploadReceiptRepositoryResult<unknown>;
        try {
          authorization = await createPreviewAccess().authorizeCustomerInputPreview({
            ownerId,
            receiptId: receipt.receiptId,
          });
        } catch {
          return { status: "source_failure" };
        }
        if (authorization.status === "not_found" || authorization.status === "invalid_state") {
          return { status: "unavailable" };
        }
        if (authorization.status !== "found") return { status: "source_failure" };

        const capability = capabilityPermitsRead(authorization.value, receipt, observedAt);
        if (capability === "unavailable") return { status: "unavailable" };
        if (capability !== "allowed") return { status: "source_failure" };

        let objectResult;
        try {
          objectResult = await createObjectStore().readPrivateObject(receipt.receiptId);
        } catch {
          return { status: "source_failure" };
        }
        if (objectResult.status === "not_found") return { status: "unavailable" };
        if (objectResult.status !== "found") return { status: "source_failure" };

        const content = objectResult.value.content;
        if (
          !IMAGE_CONTENT_TYPES.includes(content.contentType) ||
          content.contentType !== receipt.contentType ||
          !isAsyncIterableBytes(content.bytes)
        ) {
          return { status: "source_failure" };
        }
        return { status: "image", response: imageResponse(content.contentType, content.bytes) };
      },
    );

    if (protectedResult.status === "not_found" || protectedResult.status === "forbidden") {
      return failure("not_found", 404);
    }
    if (protectedResult.status !== "continued" || protectedResult.value.status === "source_failure") {
      return failure("temporary_failure", 503);
    }
    if (protectedResult.value.status === "unavailable") {
      return failure("stale_or_expired", 404);
    }
    return protectedResult.value.response;
  };
}
