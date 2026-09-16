import type { CustomerUploadObjectStore } from "./customer-upload-object-store.ts";
import type {
  CustomerUploadAttachment,
  CustomerUploadOperationId,
  CustomerUploadReceiptRepository,
  CustomerUploadReceiptRepositoryResult,
} from "./customer-upload-repository.ts";
import type {
  CustomerUploadOwnerId,
  CustomerUploadReceipt,
  CustomerUploadReceiptId,
  CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";

export type CustomerUploadLifecycleCommandResult<T> =
  | { readonly status: "changed" | "attached" | "claimed"; readonly value: T }
  | { readonly status: "not_found" }
  | { readonly status: "invalid_state" }
  | { readonly status: "source_failure" };

export type CustomerUploadCleanupAttemptResult =
  | { readonly status: "completed" | "failed"; readonly receiptId: CustomerUploadReceiptId }
  | { readonly status: "not_found" | "invalid_state" | "source_failure"; readonly receiptId: CustomerUploadReceiptId };

export type CustomerUploadCleanupBatchResult =
  | { readonly status: "claimed"; readonly attempts: readonly CustomerUploadCleanupAttemptResult[] }
  | { readonly status: "not_found" | "invalid_state" | "source_failure" };

function safeReceiptCommandResult(
  result: CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>,
  acceptedStatus: "changed" | "attached",
): CustomerUploadLifecycleCommandResult<CustomerUploadReceipt> {
  if (acceptedStatus === "changed" && result.status === "changed") {
    return { status: "changed", value: result.value };
  }
  if (acceptedStatus === "attached" && result.status === "attached") {
    return { status: "attached", value: result.value };
  }
  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "invalid_state") return { status: "invalid_state" };
  return { status: "source_failure" };
}

/**
 * Explicit bounded lifecycle commands. Repository commands, not application
 * reads, define atomic state, idempotent replay, attachment, and cleanup lease
 * semantics. A persistent operation-ID ledger is not implemented or claimed.
 */
export class CustomerUploadLifecycleService {
  private readonly receiptRepository: CustomerUploadReceiptRepository;
  private readonly objectStore: CustomerUploadObjectStore;

  constructor(
    receiptRepository: CustomerUploadReceiptRepository,
    objectStore: CustomerUploadObjectStore,
  ) {
    this.receiptRepository = receiptRepository;
    this.objectStore = objectStore;
  }

  async replaceCustomerUpload(input: {
    verifiedOwnerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    replacementReceiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadLifecycleCommandResult<CustomerUploadReceipt>> {
    if (input.receiptId === input.replacementReceiptId) return { status: "invalid_state" };
    try {
      return safeReceiptCommandResult(await this.receiptRepository.replaceOwnedReceipt({
        ownerId: input.verifiedOwnerId,
        receiptId: input.receiptId,
        replacementReceiptId: input.replacementReceiptId,
        operationId: input.operationId,
      }), "changed");
    } catch {
      return { status: "source_failure" };
    }
  }

  async removeCustomerUpload(input: {
    verifiedOwnerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadLifecycleCommandResult<CustomerUploadReceipt>> {
    try {
      return safeReceiptCommandResult(await this.receiptRepository.removeOwnedReceipt({
        ownerId: input.verifiedOwnerId,
        receiptId: input.receiptId,
        operationId: input.operationId,
      }), "changed");
    } catch {
      return { status: "source_failure" };
    }
  }

  async attachCustomerUploadOnce(input: {
    verifiedOwnerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    attachment: CustomerUploadAttachment;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadLifecycleCommandResult<CustomerUploadReceipt>> {
    try {
      return safeReceiptCommandResult(await this.receiptRepository.attachOwnedReceiptOnce({
        ownerId: input.verifiedOwnerId,
        receiptId: input.receiptId,
        attachment: input.attachment,
        operationId: input.operationId,
      }), "attached");
    } catch {
      return { status: "source_failure" };
    }
  }

  async expireCustomerUpload(input: {
    receiptId: CustomerUploadReceiptId;
    observedAt: CustomerUploadTimestamp;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadLifecycleCommandResult<CustomerUploadReceipt>> {
    try {
      return safeReceiptCommandResult(await this.receiptRepository.expireReceipt(input), "changed");
    } catch {
      return { status: "source_failure" };
    }
  }

  async claimCustomerUploadCleanup(input: {
    observedAt: CustomerUploadTimestamp;
    limit: number;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadLifecycleCommandResult<readonly CustomerUploadReceipt[]>> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return { status: "invalid_state" };
    try {
      const result = await this.receiptRepository.claimReceiptsForCleanup(input);
      if (result.status === "claimed") return { status: "claimed", value: result.value };
      if (result.status === "not_found") return { status: "not_found" };
      if (result.status === "invalid_state") return { status: "invalid_state" };
      return { status: "source_failure" };
    } catch {
      return { status: "source_failure" };
    }
  }

  /**
   * The repository claim is the atomic attachment/cleanup barrier. This method
   * deliberately makes no ordinary attachment or ownership re-read before
   * deletion. For internal cleanup only, provider `not_found` means the desired
   * physical absence and is completed idempotently; it is never a read oracle.
   */
  private async runClaimedCustomerUploadCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadCleanupAttemptResult> {
    let deleted = false;
    try {
      const deletion = await this.objectStore.deletePrivateObject(input.receiptId);
      deleted = (deletion.status === "deleted" && deletion.value === true) || deletion.status === "not_found";
    } catch {
      deleted = false;
    }

    try {
      if (deleted) {
        const completed = await this.receiptRepository.completeReceiptCleanup(input);
        if (completed.status === "changed") {
          return { status: "completed", receiptId: input.receiptId };
        }
        if (completed.status === "not_found") return { status: "not_found", receiptId: input.receiptId };
        if (completed.status === "invalid_state") return { status: "invalid_state", receiptId: input.receiptId };
        return { status: "source_failure", receiptId: input.receiptId };
      }
      const failed = await this.receiptRepository.failReceiptCleanup(input);
      if (failed.status === "changed") {
        return { status: "failed", receiptId: input.receiptId };
      }
      if (failed.status === "not_found") return { status: "not_found", receiptId: input.receiptId };
      if (failed.status === "invalid_state") return { status: "invalid_state", receiptId: input.receiptId };
      return { status: "source_failure", receiptId: input.receiptId };
    } catch {
      return { status: "source_failure", receiptId: input.receiptId };
    }
  }

  /**
   * Claims and processes a bounded cleanup batch. Only receipt IDs returned by
   * this atomic claim reach provider deletion; callers cannot submit arbitrary
   * IDs to bypass the attachment-versus-cleanup lease.
   */
  async runCustomerUploadCleanup(input: {
    observedAt: CustomerUploadTimestamp;
    limit: number;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadCleanupBatchResult> {
    const claim = await this.claimCustomerUploadCleanup(input);
    if (claim.status === "not_found") return { status: "not_found" };
    if (claim.status === "invalid_state") return { status: "invalid_state" };
    if (claim.status === "source_failure") return { status: "source_failure" };
    if (claim.status !== "claimed") return { status: "source_failure" };
    if (claim.value.some((receipt) => receipt.lifecycle !== "cleanup_pending")) {
      return { status: "source_failure" };
    }
    const attempts: CustomerUploadCleanupAttemptResult[] = [];
    for (const receipt of claim.value) {
      attempts.push(await this.runClaimedCustomerUploadCleanup({
        receiptId: receipt.receiptId,
        operationId: input.operationId,
      }));
    }
    return { status: "claimed", attempts };
  }
}
