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
import { inspectCustomerImageBytes } from "../domain/customer-image-inspection.ts";
import {
  hasCustomerUploadExpiryElapsed,
  parseOwnedCustomerUploadReceipt,
  type CustomerUploadOwnerId,
  type CustomerUploadReceipt,
  type CustomerUploadReceiptId,
  type CustomerUploadTimestamp,
  type OwnedCustomerUploadReceipt,
} from "../domain/customer-upload.ts";

const PERMISSIVE_FAKE_IMAGE_CONSTRAINTS = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: Number.MAX_SAFE_INTEGER,
  minDimensions: { width: 1, height: 1 },
  recommendedDimensions: { width: 1, height: 1 },
  minImageCount: 1,
  maxImageCount: 1,
  cropEnabled: false,
} as const;

const CLEANUP_ELIGIBLE_LIFECYCLES = new Set([
  "replaced",
  "removed",
  "expired",
  "cleanup_failed",
]);

const INVALID_CLEANUP_LIMIT_LIFECYCLE = "cleanup_pending" as const;
const MAXIMUM_FAKE_CLEANUP_LIMIT = 1_000;

export interface DeterministicCustomerUploadFakeReceiptSeed {
  readonly receipt: OwnedCustomerUploadReceipt;
  readonly attachment?: CustomerUploadAttachment;
  readonly replacementReceiptId?: CustomerUploadReceiptId;
}

export interface DeterministicCustomerUploadFakeObjectSnapshot {
  readonly receiptId: CustomerUploadReceiptId;
  readonly byteSize: number;
  readonly contentType: CustomerUploadObjectContent["contentType"];
}

export interface DeterministicCustomerUploadFakeReceiptSnapshot {
  readonly receipt: CustomerUploadReceipt;
  readonly attachmentId?: string;
  readonly replacementReceiptId?: CustomerUploadReceiptId;
}

export interface DeterministicCustomerUploadFakeOptions {
  readonly now: () => CustomerUploadTimestamp;
  /** Test-only injected preview policy; production preview TTL remains unresolved. */
  readonly derivePreviewExpiresAt: (input: {
    readonly now: CustomerUploadTimestamp;
    readonly receipt: CustomerUploadReceipt;
  }) => CustomerUploadTimestamp;
  readonly receipts?: readonly DeterministicCustomerUploadFakeReceiptSeed[];
}

export interface DeterministicCustomerUploadFakes {
  readonly objectStore: CustomerUploadObjectStore;
  readonly receiptRepository: CustomerUploadReceiptRepository;
  readonly previewAccess: CustomerUploadPreviewAccessPort;
  snapshot(): {
    readonly objects: readonly DeterministicCustomerUploadFakeObjectSnapshot[];
    readonly receipts: readonly DeterministicCustomerUploadFakeReceiptSnapshot[];
  };
}

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
  return {
    ...receipt,
    ...(receipt.dimensions ? { dimensions: { ...receipt.dimensions } } : {}),
  };
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

function cloneOwnedReceipt(receipt: OwnedCustomerUploadReceipt): OwnedCustomerUploadReceipt {
  return { ...cloneReceipt(receipt), ownerId: receipt.ownerId };
}

function compareCleanupCandidates(left: ReceiptEntry, right: ReceiptEntry): number {
  if (left.receipt.createdAt < right.receipt.createdAt) return -1;
  if (left.receipt.createdAt > right.receipt.createdAt) return 1;
  if (left.receipt.receiptId < right.receipt.receiptId) return -1;
  if (left.receipt.receiptId > right.receipt.receiptId) return 1;
  return 0;
}

function isPreviewCapabilityValid(
  capabilityExpiresAt: CustomerUploadTimestamp,
  receipt: CustomerUploadReceipt,
  now: CustomerUploadTimestamp,
): boolean {
  const capabilityTime = Date.parse(capabilityExpiresAt);
  const receiptTime = Date.parse(receipt.expiresAt);
  const nowTime = Date.parse(now);
  return (
    Number.isFinite(capabilityTime)
    && Number.isFinite(receiptTime)
    && Number.isFinite(nowTime)
    && capabilityTime > nowTime
    && capabilityTime <= receiptTime
  );
}

async function collectPrivateBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of source) {
    const copied = new Uint8Array(chunk);
    chunks.push(copied);
    byteLength += copied.byteLength;
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function* copiedPrivateBytes(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes.slice();
}

/**
 * TEST / LOCAL ONLY. This private in-memory object adapter intentionally has
 * no runtime configuration, remote client, or locator vocabulary.
 */
export class DeterministicInMemoryCustomerUploadObjectStore implements CustomerUploadObjectStore {
  private readonly objects = new Map<CustomerUploadReceiptId, StoredObject>();

  async putPrivateObject(input: {
    receiptId: CustomerUploadReceiptId;
    content: CustomerUploadObjectContent;
  }): Promise<CustomerUploadObjectStoreResult<true>> {
    const bytes = await collectPrivateBytes(input.content.bytes);
    this.objects.set(input.receiptId, {
      bytes,
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
      value: {
        content: {
          contentType: object.contentType,
          bytes: copiedPrivateBytes(object.bytes),
        },
      },
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
    }, PERMISSIVE_FAKE_IMAGE_CONSTRAINTS);
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

  async deletePrivateObject(receiptId: CustomerUploadReceiptId): Promise<CustomerUploadObjectStoreResult<true>> {
    if (!this.objects.delete(receiptId)) return { status: "not_found" };
    return { status: "deleted", value: true };
  }

  snapshot(): readonly DeterministicCustomerUploadFakeObjectSnapshot[] {
    return [...this.objects.entries()]
      .map(([receiptId, object]) => ({
        receiptId,
        byteSize: object.bytes.byteLength,
        contentType: object.contentType,
      }))
      .sort((left, right) => left.receiptId < right.receiptId ? -1 : left.receiptId > right.receiptId ? 1 : 0);
  }
}

/**
 * TEST / LOCAL ONLY. One state authority implements both receipt persistence
 * and preview authorization so lifecycle changes cannot drift between them.
 */
export class DeterministicInMemoryCustomerUploadReceiptStore implements CustomerUploadReceiptRepository, CustomerUploadPreviewAccessPort {
  private readonly entries = new Map<CustomerUploadReceiptId, ReceiptEntry>();
  private readonly now: () => CustomerUploadTimestamp;
  private readonly derivePreviewExpiresAt: DeterministicCustomerUploadFakeOptions["derivePreviewExpiresAt"];

  constructor(options: DeterministicCustomerUploadFakeOptions) {
    this.now = options.now;
    this.derivePreviewExpiresAt = options.derivePreviewExpiresAt;
    for (const seed of options.receipts ?? []) {
      const parsed = parseOwnedCustomerUploadReceipt(seed.receipt);
      if (!parsed.ok || this.entries.has(parsed.value.receiptId)) {
        throw new Error("Invalid deterministic customer upload fake receipt seed.");
      }
      if (seed.replacementReceiptId !== undefined) {
        throw new Error("Replacement relations must be created through the fake repository.");
      }
      this.entries.set(parsed.value.receiptId, {
        receipt: cloneOwnedReceipt(parsed.value),
        ...(seed.attachment ? { attachmentId: seed.attachment.attachmentId } : {}),
      });
    }
  }

  private entryForOwner(
    receiptId: CustomerUploadReceiptId,
    ownerId: CustomerUploadOwnerId,
  ): ReceiptEntry | undefined {
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
    if (!parsed.ok) {
      return { status: "source_failure", operation: "customer_upload_receipt.create" };
    }
    const existing = this.entries.get(parsed.value.receiptId);
    if (existing) return this.invalid(existing);
    if (parsed.value.lifecycle !== "active") {
      return { status: "invalid_state", lifecycle: parsed.value.lifecycle };
    }
    this.entries.set(parsed.value.receiptId, { receipt: cloneOwnedReceipt(parsed.value) });
    return { status: "accepted", value: withoutOwner(parsed.value) };
  }

  async findOwnedReceipt(
    receiptId: CustomerUploadReceiptId,
    ownerId: CustomerUploadOwnerId,
  ): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    const entry = this.entryForOwner(receiptId, ownerId);
    return entry ? { status: "found", value: withoutOwner(entry.receipt) } : { status: "not_found" };
  }

  async replaceOwnedReceipt(input: {
    ownerId: CustomerUploadOwnerId;
    receiptId: CustomerUploadReceiptId;
    replacementReceiptId: CustomerUploadReceiptId;
    operationId: CustomerUploadOperationId;
  }): Promise<CustomerUploadReceiptRepositoryResult<CustomerUploadReceipt>> {
    void input.operationId;
    const original = this.entryForOwner(input.receiptId, input.ownerId);
    const replacement = this.entryForOwner(input.replacementReceiptId, input.ownerId);
    if (!original || !replacement) return { status: "not_found" };
    if (input.receiptId === input.replacementReceiptId || original.attachmentId) return this.invalid(original);
    if (original.receipt.lifecycle === "replaced") {
      return original.replacementReceiptId === input.replacementReceiptId
        ? this.changed(original)
        : this.invalid(original);
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
    const entry = this.entryForOwner(input.receiptId, input.ownerId);
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
    const entry = this.entryForOwner(input.receiptId, input.ownerId);
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
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0 || input.limit > MAXIMUM_FAKE_CLEANUP_LIMIT) {
      return { status: "invalid_state", lifecycle: INVALID_CLEANUP_LIMIT_LIFECYCLE };
    }
    const claimed = [...this.entries.values()]
      .filter((entry) => !entry.attachmentId && CLEANUP_ELIGIBLE_LIFECYCLES.has(entry.receipt.lifecycle))
      .sort(compareCleanupCandidates)
      .slice(0, input.limit);
    for (const entry of claimed) entry.receipt.lifecycle = "cleanup_pending";
    return { status: "claimed", value: claimed.map((entry) => withoutOwner(entry.receipt)) };
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
    const entry = this.entryForOwner(input.receiptId, input.ownerId);
    if (!entry || entry.receipt.lifecycle !== "active") return { status: "not_found" };
    const now = this.now();
    if (hasCustomerUploadExpiryElapsed(entry.receipt, now)) return { status: "not_found" };
    const expiresAt = this.derivePreviewExpiresAt({ now, receipt: withoutOwner(entry.receipt) });
    if (!isPreviewCapabilityValid(expiresAt, entry.receipt, now)) {
      return { status: "source_failure", operation: "customer_upload_preview.authorize" };
    }
    return { status: "found", value: { receiptId: entry.receipt.receiptId, expiresAt } };
  }

  snapshot(): readonly DeterministicCustomerUploadFakeReceiptSnapshot[] {
    return [...this.entries.values()]
      .map((entry) => ({
        receipt: withoutOwner(entry.receipt),
        ...(entry.attachmentId !== undefined ? { attachmentId: entry.attachmentId } : {}),
        ...(entry.replacementReceiptId !== undefined ? { replacementReceiptId: entry.replacementReceiptId } : {}),
      }))
      .sort((left, right) => left.receipt.receiptId < right.receipt.receiptId ? -1 : left.receipt.receiptId > right.receipt.receiptId ? 1 : 0);
  }
}

/** Creates separate local resources while sharing one receipt/preview state authority. */
export function createDeterministicCustomerUploadFakes(
  options: DeterministicCustomerUploadFakeOptions,
): DeterministicCustomerUploadFakes {
  const objectStore = new DeterministicInMemoryCustomerUploadObjectStore();
  const receiptStore = new DeterministicInMemoryCustomerUploadReceiptStore(options);
  return {
    objectStore,
    receiptRepository: receiptStore,
    previewAccess: receiptStore,
    snapshot() {
      return {
        objects: objectStore.snapshot(),
        receipts: receiptStore.snapshot(),
      };
    },
  };
}
