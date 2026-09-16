import type {
  CustomerUploadObjectContent,
  CustomerUploadObjectInspection,
  CustomerUploadObjectStore,
  CustomerUploadObjectStoreResult,
  ReadCustomerUploadObject,
  CustomerInputPreviewCapability,
} from "../application/customer-upload-object-store.ts";
import type {
  CustomerUploadAttachment,
  CustomerUploadOperationId,
  CustomerUploadPreviewAccessPort,
  CustomerUploadReceiptRepository,
  CustomerUploadReceiptRepositoryResult,
} from "../application/customer-upload-repository.ts";
import type {
  CustomerUploadOwnerId,
  CustomerUploadReceipt,
  CustomerUploadReceiptId,
  CustomerUploadTimestamp,
  OwnedCustomerUploadReceipt,
} from "../domain/customer-upload.ts";

export type DeterministicFailureAction = "pass" | "source_failure" | "throw" | "throw_hostile";
export type DeterministicObjectPutFailureAction = DeterministicFailureAction | "write_then_throw";

/** Closed test-only control plane; it cannot return arbitrary adapter results. */
export interface DeterministicCustomerUploadFailurePlan {
  readonly objectPut?: readonly DeterministicObjectPutFailureAction[];
  readonly receiptCreate?: readonly DeterministicFailureAction[];
  readonly previewAuthorize?: readonly DeterministicFailureAction[];
  readonly objectRead?: readonly DeterministicFailureAction[];
  readonly objectDelete?: readonly DeterministicFailureAction[];
}

export interface DeterministicCustomerUploadFailureSnapshot {
  readonly calls: Readonly<{
    objectPut: number;
    receiptCreate: number;
    previewAuthorize: number;
    objectRead: number;
    objectDelete: number;
  }>;
  readonly remaining: Readonly<{
    objectPut: readonly DeterministicObjectPutFailureAction[];
    receiptCreate: readonly DeterministicFailureAction[];
    previewAuthorize: readonly DeterministicFailureAction[];
    objectRead: readonly DeterministicFailureAction[];
    objectDelete: readonly DeterministicFailureAction[];
  }>;
}

export interface ControlledCustomerUploadAdapters {
  readonly objectStore: CustomerUploadObjectStore;
  readonly receiptRepository: CustomerUploadReceiptRepository;
  readonly previewAccess: CustomerUploadPreviewAccessPort;
  snapshot(): DeterministicCustomerUploadFailureSnapshot;
}

interface FailureQueues {
  objectPut: DeterministicObjectPutFailureAction[];
  receiptCreate: DeterministicFailureAction[];
  previewAuthorize: DeterministicFailureAction[];
  objectRead: DeterministicFailureAction[];
  objectDelete: DeterministicFailureAction[];
}

interface FailureCounters {
  objectPut: number;
  receiptCreate: number;
  previewAuthorize: number;
  objectRead: number;
  objectDelete: number;
}

const HOSTILE_DIAGNOSTIC = [
  "bucket=private-media",
  "storageKey=drafts/secret.png",
  "signedUrl=https://provider.test/secret",
  "token=secret",
  "SQLSTATE 23505",
  "DETAIL secret-detail",
  "HINT secret-hint",
  "customer-text-marker",
].join(" | ");

function initialQueues(plan: DeterministicCustomerUploadFailurePlan): FailureQueues {
  return {
    objectPut: [...(plan.objectPut ?? [])],
    receiptCreate: [...(plan.receiptCreate ?? [])],
    previewAuthorize: [...(plan.previewAuthorize ?? [])],
    objectRead: [...(plan.objectRead ?? [])],
    objectDelete: [...(plan.objectDelete ?? [])],
  };
}

function initialCounters(): FailureCounters {
  return { objectPut: 0, receiptCreate: 0, previewAuthorize: 0, objectRead: 0, objectDelete: 0 };
}

function nextAction<Action extends DeterministicFailureAction | DeterministicObjectPutFailureAction>(
  queues: FailureQueues,
  counters: FailureCounters,
  operation: keyof FailureQueues,
): Action {
  counters[operation] += 1;
  return (queues[operation].shift() ?? "pass") as Action;
}

function throwControlledFailure(action: "throw" | "throw_hostile"): never {
  throw new Error(action === "throw_hostile" ? HOSTILE_DIAGNOSTIC : "Deterministic customer upload adapter failure.");
}

class ControlledObjectStore implements CustomerUploadObjectStore {
  private readonly underlying: CustomerUploadObjectStore;
  private readonly queues: FailureQueues;
  private readonly counters: FailureCounters;

  constructor(
    underlying: CustomerUploadObjectStore,
    queues: FailureQueues,
    counters: FailureCounters,
  ) {
    this.underlying = underlying;
    this.queues = queues;
    this.counters = counters;
  }

  async putPrivateObject(input: {
    receiptId: CustomerUploadReceiptId;
    content: CustomerUploadObjectContent;
  }): Promise<CustomerUploadObjectStoreResult<true>> {
    const action = nextAction<DeterministicObjectPutFailureAction>(this.queues, this.counters, "objectPut");
    if (action === "source_failure") {
      return { status: "source_failure", operation: "customer_upload_object_store.put" };
    }
    if (action === "throw" || action === "throw_hostile") throwControlledFailure(action);
    const result = await this.underlying.putPrivateObject(input);
    if (action === "write_then_throw") throwControlledFailure("throw");
    return result;
  }

  async readPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<ReadCustomerUploadObject>> {
    const action = nextAction<DeterministicFailureAction>(this.queues, this.counters, "objectRead");
    if (action === "source_failure") {
      return { status: "source_failure", operation: "customer_upload_object_store.read" };
    }
    if (action === "throw" || action === "throw_hostile") throwControlledFailure(action);
    return this.underlying.readPrivateObject(receiptId);
  }

  async inspectPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<CustomerUploadObjectInspection>> {
    return this.underlying.inspectPrivateObject(receiptId);
  }

  async deletePrivateObject(receiptId: CustomerUploadReceiptId): Promise<CustomerUploadObjectStoreResult<true>> {
    const action = nextAction<DeterministicFailureAction>(this.queues, this.counters, "objectDelete");
    if (action === "source_failure") {
      return { status: "source_failure", operation: "customer_upload_object_store.delete" };
    }
    if (action === "throw" || action === "throw_hostile") throwControlledFailure(action);
    return this.underlying.deletePrivateObject(receiptId);
  }
}

class ControlledReceiptRepository implements CustomerUploadReceiptRepository {
  private readonly underlying: CustomerUploadReceiptRepository;
  private readonly queues: FailureQueues;
  private readonly counters: FailureCounters;

  constructor(
    underlying: CustomerUploadReceiptRepository,
    queues: FailureQueues,
    counters: FailureCounters,
  ) {
    this.underlying = underlying;
    this.queues = queues;
    this.counters = counters;
  }

  async createAcceptedReceipt(
    receipt: OwnedCustomerUploadReceipt,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    const action = nextAction<DeterministicFailureAction>(this.queues, this.counters, "receiptCreate");
    if (action === "source_failure") {
      return { status: "source_failure", operation: "customer_upload_receipt.create" };
    }
    if (action === "throw" || action === "throw_hostile") throwControlledFailure(action);
    return this.underlying.createAcceptedReceipt(receipt);
  }

  findOwnedReceipt(receiptId: CustomerUploadReceiptId, ownerId: CustomerUploadOwnerId) {
    return this.underlying.findOwnedReceipt(receiptId, ownerId);
  }

  replaceOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    replacementReceiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.replaceOwnedReceipt(input);
  }

  removeOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.removeOwnedReceipt(input);
  }

  attachOwnedReceiptOnce(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    attachment: CustomerUploadAttachment;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.attachOwnedReceiptOnce(input);
  }

  expireReceipt(input: {
    receiptId: CustomerUploadReceiptId;
    observedAt: CustomerUploadTimestamp;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.expireReceipt(input);
  }

  claimReceiptsForCleanup(input: {
    observedAt: CustomerUploadTimestamp;
    limit: number;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.claimReceiptsForCleanup(input);
  }

  completeReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.completeReceiptCleanup(input);
  }

  failReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }) {
    return this.underlying.failReceiptCleanup(input);
  }
}

class ControlledPreviewAccess implements CustomerUploadPreviewAccessPort {
  private readonly underlying: CustomerUploadPreviewAccessPort;
  private readonly queues: FailureQueues;
  private readonly counters: FailureCounters;

  constructor(
    underlying: CustomerUploadPreviewAccessPort,
    queues: FailureQueues,
    counters: FailureCounters,
  ) {
    this.underlying = underlying;
    this.queues = queues;
    this.counters = counters;
  }

  async authorizeCustomerInputPreview(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerInputPreviewCapability>> {
    const action = nextAction<DeterministicFailureAction>(this.queues, this.counters, "previewAuthorize");
    if (action === "source_failure") {
      return { status: "source_failure", operation: "customer_upload_preview.authorize" };
    }
    if (action === "throw" || action === "throw_hostile") throwControlledFailure(action);
    return this.underlying.authorizeCustomerInputPreview(input);
  }
}

/**
 * TEST / LOCAL ONLY. Wraps state-driven Task 6.1 adapters with finite failure
 * queues; no production code should import it and no action can fabricate a
 * success result or mutate receipt lifecycle directly.
 */
export function createControlledCustomerUploadAdapters(input: {
  readonly objectStore: CustomerUploadObjectStore;
  readonly receiptRepository: CustomerUploadReceiptRepository;
  readonly previewAccess: CustomerUploadPreviewAccessPort;
  readonly failurePlan?: DeterministicCustomerUploadFailurePlan;
}): ControlledCustomerUploadAdapters {
  const queues = initialQueues(input.failurePlan ?? {});
  const counters = initialCounters();
  return {
    objectStore: new ControlledObjectStore(input.objectStore, queues, counters),
    receiptRepository: new ControlledReceiptRepository(input.receiptRepository, queues, counters),
    previewAccess: new ControlledPreviewAccess(input.previewAccess, queues, counters),
    snapshot(): DeterministicCustomerUploadFailureSnapshot {
      return {
        calls: { ...counters },
        remaining: {
          objectPut: [...queues.objectPut],
          receiptCreate: [...queues.receiptCreate],
          previewAuthorize: [...queues.previewAuthorize],
          objectRead: [...queues.objectRead],
          objectDelete: [...queues.objectDelete],
        },
      };
    },
  };
}
