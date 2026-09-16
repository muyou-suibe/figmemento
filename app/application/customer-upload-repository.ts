import type {
  CustomerUploadLifecycle,
  CustomerUploadOwnerId,
  CustomerUploadReceipt,
  CustomerUploadReceiptId,
  CustomerUploadTimestamp,
  OwnedCustomerUploadReceipt,
} from "../domain/customer-upload.ts";
import type { CustomerInputPreviewCapability } from "./customer-upload-object-store.ts";

export type CustomerUploadReceiptRepositoryResult<T> =
  | { status: "found" | "accepted" | "changed" | "attached" | "claimed"; value: T }
  | { status: "not_found" }
  | { status: "invalid_state"; lifecycle: CustomerUploadLifecycle }
  | { status: "source_failure"; operation: CustomerUploadReceiptRepositoryOperation };

export type CustomerUploadReceiptRepositoryOperation =
  | "customer_upload_receipt.create"
  | "customer_upload_receipt.lookup_owned"
  | "customer_upload_receipt.replace"
  | "customer_upload_receipt.remove"
  | "customer_upload_receipt.attach"
  | "customer_upload_receipt.expire"
  | "customer_upload_receipt.cleanup_claim"
  | "customer_upload_receipt.cleanup_complete"
  | "customer_upload_receipt.cleanup_fail"
  | "customer_upload_preview.authorize";

/**
 * A future service supplies this opaque request key to make bounded lifecycle
 * commands retry-safe. Task 5.1 neither allocates nor persists it.
 */
export type CustomerUploadOperationId = string;

export interface CustomerUploadAttachment {
  /** Opaque future order/customization boundary identity; no order schema is owned here. */
  readonly attachmentId: string;
}

export interface CustomerUploadReceiptRepository {
  createAcceptedReceipt(
    receipt: OwnedCustomerUploadReceipt,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /** Customer-facing lookups are owner-scoped and return not_found for a mismatch. */
  findOwnedReceipt(
    receiptId: CustomerUploadReceiptId,
    ownerId: CustomerUploadOwnerId,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /**
   * Atomic conditional replacement: both receipts must be same-owner eligible
   * active receipts. It transitions only the original to `replaced`, records
   * its immutable replacement relationship, and never deletes object bytes.
   * An equivalent already-applied replacement may safely replay; a different
   * replacement target must fail closed.
   */
  replaceOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    replacementReceiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /**
   * Atomic conditional active-to-removed transition with no eager object
   * deletion. A future attachment-aware adapter must reject attached content;
   * equivalent already-removed retry may safely replay.
   */
  removeOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /**
   * Atomic attach-once boundary. Attachment is not a lifecycle state and Phase
   * C owns actual persistence. It must compete atomically with cleanup claims:
   * cleanup_pending cannot attach; a successful same-target retry may replay;
   * a different target must fail closed.
   */
  attachOwnedReceiptOnce(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    attachment: CustomerUploadAttachment;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /**
   * Atomic server-observed expiry for due unattached active content only. A
   * future attachment-aware adapter must keep attached content protected.
   */
  expireReceipt(input: {
    receiptId: CustomerUploadReceiptId;
    observedAt: CustomerUploadTimestamp;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /**
   * Atomic bounded cleanup lease claim. It selects only unattached eligible
   * states, transitions each to cleanup_pending, and becomes the concurrency
   * barrier: once claimed, a future attach operation cannot win. This is not a
   * read-then-delete authorization and it has no generic lifecycle setter.
   */
  claimReceiptsForCleanup(input: {
    observedAt: CustomerUploadTimestamp;
    limit: number;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<readonly CustomerUploadReceipt[]>>;

  /**
   * Atomic cleanup_pending completion after provider deletion succeeds (or the
   * explicitly adopted internal already-absent cleanup policy applies).
   */
  completeReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;

  /** Atomic cleanup_pending failure transition, preserving retry eligibility. */
  failReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>>;
}

/**
 * Separate preview authorization boundary. A capability is short-lived and
 * contains no provider URL, object handle, or production-output claim.
 */
export interface CustomerUploadPreviewAccessPort {
  authorizeCustomerInputPreview(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerInputPreviewCapability>>;
}
