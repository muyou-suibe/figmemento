import {
  createCryptographicCustomerUploadReceiptIdGenerator,
  type CustomerUploadAcceptanceDependencies,
  type CustomerUploadExpiryPolicy,
} from "../../application/customer-upload-acceptance-service.ts";
import type {
  CustomerUploadObjectContent,
  CustomerUploadObjectInspection,
  CustomerUploadObjectStore,
  CustomerUploadObjectStoreResult,
  ReadCustomerUploadObject,
  CustomerInputPreviewCapability,
} from "../../application/customer-upload-object-store.ts";
import type {
  CustomerUploadAttachment,
  CustomerUploadOperationId,
  CustomerUploadPreviewAccessPort,
  CustomerUploadReceiptRepository,
  CustomerUploadReceiptRepositoryResult,
} from "../../application/customer-upload-repository.ts";
import { inspectCustomerImageBytes } from "../../domain/customer-image-inspection.ts";
import {
  hasCustomerUploadExpiryElapsed,
  parseOwnedCustomerUploadReceipt,
  type CustomerUploadOwnerId,
  type CustomerUploadReceipt,
  type CustomerUploadReceiptId,
  type CustomerUploadTimestamp,
  type OwnedCustomerUploadReceipt,
} from "../../domain/customer-upload.ts";

const LOCAL_RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const LOCAL_PREVIEW_CAPABILITY_MS = 5 * 60 * 1_000;
const MAX_LOCAL_CLEANUP_LIMIT = 1_000;
const LOCAL_IMAGE_CONSTRAINTS = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: Number.MAX_SAFE_INTEGER,
  minDimensions: { width: 1, height: 1 },
  recommendedDimensions: { width: 1, height: 1 },
  minImageCount: 1,
  maxImageCount: 1,
  cropEnabled: false,
} as const;
const CLEANUP_ELIGIBLE = new Set(["replaced", "removed", "expired", "cleanup_failed"]);

interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: CustomerUploadObjectContent["contentType"];
}

interface ReceiptEntry {
  receipt: OwnedCustomerUploadReceipt;
  attachmentId?: string;
  replacementReceiptId?: CustomerUploadReceiptId;
}

function cloneReceipt(receipt: CustomerUploadReceipt): CustomerUploadReceipt {
  return { ...receipt, ...(receipt.dimensions ? { dimensions: { ...receipt.dimensions } } : {}) };
}

function cloneOwnedReceipt(receipt: OwnedCustomerUploadReceipt): OwnedCustomerUploadReceipt {
  return { ...cloneReceipt(receipt), ownerId: receipt.ownerId };
}

function withoutOwner(receipt: OwnedCustomerUploadReceipt): CustomerUploadReceipt {
  return {
    receiptId: receipt.receiptId,
    ...(receipt.originalFilename !== undefined ? { originalFilename: receipt.originalFilename } : {}),
    contentType: receipt.contentType,
    byteSize: receipt.byteSize,
    ...(receipt.dimensions ? { dimensions: { ...receipt.dimensions } } : {}),
    createdAt: receipt.createdAt,
    expiresAt: receipt.expiresAt,
    lifecycle: receipt.lifecycle,
  };
}

async function collectBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of source) {
    const copy = new Uint8Array(chunk);
    chunks.push(copy);
    length += copy.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function* copiedBytes(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes.slice();
}

function compareCleanupCandidates(left: ReceiptEntry, right: ReceiptEntry): number {
  return left.receipt.createdAt.localeCompare(right.receipt.createdAt)
    || left.receipt.receiptId.localeCompare(right.receipt.receiptId);
}

function isPreviewCapabilityValid(
  capabilityExpiresAt: CustomerUploadTimestamp,
  receipt: CustomerUploadReceipt,
  now: CustomerUploadTimestamp,
): boolean {
  const capability = Date.parse(capabilityExpiresAt);
  const receiptExpiry = Date.parse(receipt.expiresAt);
  const observed = Date.parse(now);
  return Number.isFinite(capability)
    && Number.isFinite(receiptExpiry)
    && Number.isFinite(observed)
    && capability > observed
    && capability <= receiptExpiry;
}

class LocalCustomerUploadObjectStore implements CustomerUploadObjectStore {
  private readonly objects = new Map<CustomerUploadReceiptId, StoredObject>();

  reset(): void {
    this.objects.clear();
  }

  async putPrivateObject(input: {
    receiptId: CustomerUploadReceiptId;
    content: CustomerUploadObjectContent;
  }): Promise<CustomerUploadObjectStoreResult<true>> {
    this.objects.set(input.receiptId, {
      bytes: await collectBytes(input.content.bytes),
      contentType: input.content.contentType,
    });
    return { status: "stored", value: true };
  }

  async readPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<ReadCustomerUploadObject>> {
    const object = this.objects.get(receiptId);
    if (!object) return { status: "not_found" };
    return {
      status: "found",
      value: { content: { contentType: object.contentType, bytes: copiedBytes(object.bytes) } },
    };
  }

  async inspectPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<CustomerUploadObjectInspection>> {
    const object = this.objects.get(receiptId);
    if (!object) return { status: "not_found" };
    const inspected = inspectCustomerImageBytes({
      bytes: object.bytes.slice(),
      declaredContentType: object.contentType,
      declaredByteSize: object.bytes.byteLength,
    }, LOCAL_IMAGE_CONSTRAINTS);
    if (!inspected.accepted) {
      return { status: "source_failure", operation: "customer_upload_object_store.inspect" };
    }
    return {
      status: "found",
      value: {
        contentType: inspected.image.contentType,
        byteSize: inspected.image.byteSize,
        width: inspected.image.dimensions.width,
        height: inspected.image.dimensions.height,
      },
    };
  }

  async deletePrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<true>> {
    return this.objects.delete(receiptId)
      ? { status: "deleted", value: true }
      : { status: "not_found" };
  }
}

class LocalCustomerUploadReceiptStore implements CustomerUploadReceiptRepository, CustomerUploadPreviewAccessPort {
  private readonly entries = new Map<CustomerUploadReceiptId, ReceiptEntry>();
  private readonly now: () => CustomerUploadTimestamp;

  constructor(now: () => CustomerUploadTimestamp) {
    this.now = now;
  }

  reset(): void {
    this.entries.clear();
  }

  private forOwner(receiptId: CustomerUploadReceiptId, ownerId: CustomerUploadOwnerId): ReceiptEntry | undefined {
    const entry = this.entries.get(receiptId);
    return entry?.receipt.ownerId === ownerId ? entry : undefined;
  }

  private invalid(entry: ReceiptEntry): CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt> {
    return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
  }

  private changed(entry: ReceiptEntry): CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt> {
    return { status: "changed", value: withoutOwner(entry.receipt) };
  }

  async createAcceptedReceipt(
    receipt: OwnedCustomerUploadReceipt,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    const parsed = parseOwnedCustomerUploadReceipt(receipt);
    if (!parsed.ok) return { status: "source_failure", operation: "customer_upload_receipt.create" };
    const existing = this.entries.get(parsed.value.receiptId);
    if (existing) return this.invalid(existing);
    if (parsed.value.lifecycle !== "active") return { status: "invalid_state", lifecycle: parsed.value.lifecycle };
    this.entries.set(parsed.value.receiptId, { receipt: cloneOwnedReceipt(parsed.value) });
    return { status: "accepted", value: withoutOwner(parsed.value) };
  }

  async findOwnedReceipt(
    receiptId: CustomerUploadReceiptId,
    ownerId: CustomerUploadOwnerId,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    const entry = this.forOwner(receiptId, ownerId);
    return entry ? { status: "found", value: withoutOwner(entry.receipt) } : { status: "not_found" };
  }

  async replaceOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    replacementReceiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const original = this.forOwner(input.receiptId, input.ownerId);
    const replacement = this.forOwner(input.replacementReceiptId, input.ownerId);
    if (!original || !replacement) return { status: "not_found" };
    if (input.receiptId === input.replacementReceiptId || original.attachmentId) return this.invalid(original);
    if (original.receipt.lifecycle === "replaced") {
      return original.replacementReceiptId === input.replacementReceiptId ? this.changed(original) : this.invalid(original);
    }
    if (original.receipt.lifecycle !== "active" || replacement.receipt.lifecycle !== "active" || replacement.attachmentId) {
      return this.invalid(original);
    }
    original.receipt.lifecycle = "replaced";
    original.replacementReceiptId = input.replacementReceiptId;
    return this.changed(original);
  }

  async removeOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const entry = this.forOwner(input.receiptId, input.ownerId);
    if (!entry) return { status: "not_found" };
    if (entry.attachmentId) return this.invalid(entry);
    if (entry.receipt.lifecycle === "removed") return this.changed(entry);
    if (entry.receipt.lifecycle !== "active") return this.invalid(entry);
    entry.receipt.lifecycle = "removed";
    return this.changed(entry);
  }

  async attachOwnedReceiptOnce(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    attachment: CustomerUploadAttachment;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const entry = this.forOwner(input.receiptId, input.ownerId);
    if (!entry) return { status: "not_found" };
    if (entry.attachmentId !== undefined) {
      return entry.attachmentId === input.attachment.attachmentId
        ? { status: "attached", value: withoutOwner(entry.receipt) }
        : this.invalid(entry);
    }
    if (entry.receipt.lifecycle !== "active") return this.invalid(entry);
    entry.attachmentId = input.attachment.attachmentId;
    return { status: "attached", value: withoutOwner(entry.receipt) };
  }

  async expireReceipt(input: {
    receiptId: CustomerUploadReceiptId;
    observedAt: CustomerUploadTimestamp;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const entry = this.entries.get(input.receiptId);
    if (!entry) return { status: "not_found" };
    if (entry.attachmentId) return this.invalid(entry);
    if (entry.receipt.lifecycle === "expired") return this.changed(entry);
    if (entry.receipt.lifecycle !== "active" || !hasCustomerUploadExpiryElapsed(entry.receipt, input.observedAt)) {
      return this.invalid(entry);
    }
    entry.receipt.lifecycle = "expired";
    return this.changed(entry);
  }

  async claimReceiptsForCleanup(input: {
    observedAt: CustomerUploadTimestamp;
    limit: number;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<readonly CustomerUploadReceipt[]>> {
    void input.observedAt;
    void input.operationId;
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0 || input.limit > MAX_LOCAL_CLEANUP_LIMIT) {
      return { status: "invalid_state", lifecycle: "cleanup_pending" };
    }
    const entries = [...this.entries.values()]
      .filter((entry) => !entry.attachmentId && CLEANUP_ELIGIBLE.has(entry.receipt.lifecycle))
      .sort(compareCleanupCandidates)
      .slice(0, input.limit);
    for (const entry of entries) entry.receipt.lifecycle = "cleanup_pending";
    return { status: "claimed", value: entries.map((entry) => withoutOwner(entry.receipt)) };
  }

  async completeReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const entry = this.entries.get(input.receiptId);
    if (!entry) return { status: "not_found" };
    if (entry.receipt.lifecycle !== "cleanup_pending") return this.invalid(entry);
    entry.receipt.lifecycle = "cleanup_completed";
    return this.changed(entry);
  }

  async failReceiptCleanup(input: {
    receiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const entry = this.entries.get(input.receiptId);
    if (!entry) return { status: "not_found" };
    if (entry.receipt.lifecycle !== "cleanup_pending") return this.invalid(entry);
    entry.receipt.lifecycle = "cleanup_failed";
    return this.changed(entry);
  }

  async authorizeCustomerInputPreview(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerInputPreviewCapability>> {
    const entry = this.forOwner(input.receiptId, input.ownerId);
    if (!entry || entry.receipt.lifecycle !== "active") return { status: "not_found" };
    const now = this.now();
    if (hasCustomerUploadExpiryElapsed(entry.receipt, now)) return { status: "not_found" };
    const expiresAt = new Date(Math.min(
      Date.parse(now) + LOCAL_PREVIEW_CAPABILITY_MS,
      Date.parse(entry.receipt.expiresAt),
    )).toISOString();
    if (!isPreviewCapabilityValid(expiresAt, entry.receipt, now)) {
      return { status: "source_failure", operation: "customer_upload_preview.authorize" };
    }
    return { status: "found", value: { receiptId: entry.receipt.receiptId, expiresAt } };
  }
}

function createLocalExpiryPolicy(): CustomerUploadExpiryPolicy {
  return {
    deriveExpiresAt(createdAt) {
      return new Date(Date.parse(createdAt) + LOCAL_RECEIPT_RETENTION_MS).toISOString();
    },
  };
}

export interface LocalCustomerUploadRuntimeBundle {
  readonly objectStore: CustomerUploadObjectStore;
  readonly receiptRepository: CustomerUploadReceiptRepository;
  readonly previewAccess: CustomerUploadPreviewAccessPort;
  readonly acceptanceDependencies: CustomerUploadAcceptanceDependencies;
  readonly now: () => CustomerUploadTimestamp;
  readonly reset: () => void;
}

export function createLocalCustomerUploadRuntime(
  now: () => CustomerUploadTimestamp = () => new Date().toISOString(),
): LocalCustomerUploadRuntimeBundle {
  const objectStore = new LocalCustomerUploadObjectStore();
  const receiptStore = new LocalCustomerUploadReceiptStore(now);
  const expiryPolicy = createLocalExpiryPolicy();
  return {
    objectStore,
    receiptRepository: receiptStore,
    previewAccess: receiptStore,
    acceptanceDependencies: {
      objectStore,
      receiptRepository: receiptStore,
      receiptIdGenerator: createCryptographicCustomerUploadReceiptIdGenerator(),
      now,
      expiryPolicy,
    },
    now,
    reset() {
      objectStore.reset();
      receiptStore.reset();
    },
  };
}

let sharedRuntime: LocalCustomerUploadRuntimeBundle | undefined;

/** Server-only process-memory singleton. It is never a production provider. */
export function getSharedLocalCustomerUploadRuntime(): LocalCustomerUploadRuntimeBundle {
  sharedRuntime ??= createLocalCustomerUploadRuntime();
  return sharedRuntime;
}

/** Test/dev reset seam; it does not create persistence or alter source rules. */
export function resetSharedLocalCustomerUploadRuntime(): void {
  sharedRuntime?.reset();
  sharedRuntime = undefined;
}
