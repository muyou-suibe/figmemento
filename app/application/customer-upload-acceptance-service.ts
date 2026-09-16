import type { CustomerUploadObjectStore } from "./customer-upload-object-store.ts";
import type { CustomerUploadReceiptRepository } from "./customer-upload-repository.ts";
import {
  inspectCustomerImageBytes,
  type CustomerImageValidationIssue,
  type CustomerImageWarning,
} from "../domain/customer-image-inspection.ts";
import {
  parseCustomerUploadOwnerId,
  parseCustomerUploadReceipt,
  parseOwnedCustomerUploadReceipt,
  type CustomerUploadOwnerId,
  type CustomerUploadReceipt,
  type CustomerUploadReceiptId,
  type CustomerUploadTimestamp,
  type OwnedCustomerUploadReceipt,
} from "../domain/customer-upload.ts";
import type { ImageCustomizationFieldConstraints } from "../domain/customization-field.ts";

export interface CustomerUploadReceiptIdGenerator {
  allocateReceiptId(): CustomerUploadReceiptId;
}

/**
 * Production retention remains undecided. This server-side policy is injected
 * by a later deployment/provider decision; Task 5.5 configures no duration.
 */
export interface CustomerUploadExpiryPolicy {
  deriveExpiresAt(createdAt: CustomerUploadTimestamp): CustomerUploadTimestamp;
}

export interface CustomerUploadAcceptanceDependencies {
  readonly objectStore: CustomerUploadObjectStore;
  readonly receiptRepository: CustomerUploadReceiptRepository;
  readonly receiptIdGenerator?: CustomerUploadReceiptIdGenerator;
  readonly now?: () => CustomerUploadTimestamp;
  readonly expiryPolicy: CustomerUploadExpiryPolicy;
}

export interface AcceptCustomerImageUploadInput {
  /** Derived by the Task 5.3 protected entry boundary, never browser authority. */
  readonly verifiedOwnerId: CustomerUploadOwnerId;
  /** Server-resolved authoritative field configuration, never browser JSON. */
  readonly fieldConstraints: ImageCustomizationFieldConstraints;
  readonly bytes: Uint8Array;
  readonly originalFilename?: string;
  readonly declaredContentType?: string;
  readonly declaredByteSize?: number;
}

export type CustomerUploadAcceptanceResult =
  | {
      readonly status: "accepted";
      readonly receipt: CustomerUploadReceipt;
      readonly warnings: readonly CustomerImageWarning[];
    }
  | {
      readonly status: "rejected";
      readonly issues: readonly CustomerImageValidationIssue[];
      readonly warnings: readonly CustomerImageWarning[];
    }
  | {
      readonly status: "source_failure";
      readonly stage: "receipt_metadata" | "object_storage" | "receipt_persistence";
      readonly compensation: "not_attempted" | "succeeded" | "failed";
    };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Runtime-compatible cryptographic opaque ID generator. It encodes no owner, filename, or provider locator. */
export function createCryptographicCustomerUploadReceiptIdGenerator(): CustomerUploadReceiptIdGenerator {
  return {
    allocateReceiptId(): CustomerUploadReceiptId {
      const bytes = new Uint8Array(32);
      globalThis.crypto.getRandomValues(bytes);
      // Keep the opaque prefix within the shared identifier grammar.
      return `cur-${base64UrlEncode(bytes)}`;
    },
  };
}

function timestampsAreEqual(left: CustomerUploadReceipt, right: CustomerUploadReceipt): boolean {
  return (
    left.receiptId === right.receiptId
    && left.originalFilename === right.originalFilename
    && left.contentType === right.contentType
    && left.byteSize === right.byteSize
    && left.dimensions.width === right.dimensions.width
    && left.dimensions.height === right.dimensions.height
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.lifecycle === right.lifecycle
  );
}

async function* exactInspectedBytes(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

async function compensateStoredObject(
  objectStore: CustomerUploadObjectStore,
  receiptId: CustomerUploadReceiptId,
): Promise<"succeeded" | "failed"> {
  try {
    const result = await objectStore.deletePrivateObject(receiptId);
    return result.status === "deleted" && result.value === true ? "succeeded" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Provider-neutral ordered persistence. Object storage and receipt metadata
 * are separate resource managers, so this service uses best-effort
 * compensation after metadata failure; it does not claim a distributed
 * transaction or rollback guarantee.
 */
export async function acceptCustomerImageUpload(
  input: AcceptCustomerImageUploadInput,
  dependencies: CustomerUploadAcceptanceDependencies,
): Promise<CustomerUploadAcceptanceResult> {
  // This parser is defense in depth for a value already derived by Task 5.3;
  // it neither accepts a cookie nor reimplements ownership verification.
  if (!parseCustomerUploadOwnerId(input.verifiedOwnerId).ok) {
    return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
  }

  const inspection = inspectCustomerImageBytes({
    bytes: input.bytes,
    ...(input.originalFilename !== undefined ? { originalFilename: input.originalFilename } : {}),
    ...(input.declaredContentType !== undefined ? { declaredContentType: input.declaredContentType } : {}),
    ...(input.declaredByteSize !== undefined ? { declaredByteSize: input.declaredByteSize } : {}),
  }, input.fieldConstraints);
  if (!inspection.accepted) {
    return { status: "rejected", issues: inspection.issues, warnings: inspection.warnings };
  }

  let intendedReceipt: OwnedCustomerUploadReceipt;
  try {
    const receiptId = (dependencies.receiptIdGenerator ?? createCryptographicCustomerUploadReceiptIdGenerator()).allocateReceiptId();
    const createdAt = dependencies.now?.() ?? new Date().toISOString();
    const expiresAt = dependencies.expiryPolicy.deriveExpiresAt(createdAt);
    const candidate: OwnedCustomerUploadReceipt = {
      receiptId,
      ownerId: input.verifiedOwnerId,
      ...(inspection.image.safeOriginalFilename ? { originalFilename: inspection.image.safeOriginalFilename } : {}),
      contentType: inspection.image.contentType,
      byteSize: inspection.image.byteSize,
      dimensions: inspection.image.dimensions,
      createdAt,
      expiresAt,
      lifecycle: "active",
    };
    const parsed = parseOwnedCustomerUploadReceipt(candidate);
    if (!parsed.ok) {
      return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
    }
    intendedReceipt = parsed.value;
  } catch {
    return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
  }

  let objectMayExist = false;
  try {
    const stored = await dependencies.objectStore.putPrivateObject({
      receiptId: intendedReceipt.receiptId,
      content: {
        bytes: exactInspectedBytes(input.bytes),
        contentType: intendedReceipt.contentType,
      },
    });
    objectMayExist = stored.status === "stored";
    if (stored.status !== "stored" || stored.value !== true) {
      return {
        status: "source_failure",
        stage: "object_storage",
        compensation: objectMayExist
          ? await compensateStoredObject(dependencies.objectStore, intendedReceipt.receiptId)
          : "not_attempted",
      };
    }
  } catch {
    return { status: "source_failure", stage: "object_storage", compensation: "not_attempted" };
  }

  try {
    const persisted = await dependencies.receiptRepository.createAcceptedReceipt(intendedReceipt);
    if (persisted.status === "accepted") {
      const parsed = parseCustomerUploadReceipt(persisted.value);
      if (parsed.ok && timestampsAreEqual(parsed.value, intendedReceipt)) {
        return { status: "accepted", receipt: parsed.value, warnings: inspection.warnings };
      }
    }
  } catch {
    // Best-effort compensation below deliberately handles repository throws too.
  }

  return {
    status: "source_failure",
    stage: "receipt_persistence",
    compensation: await compensateStoredObject(dependencies.objectStore, intendedReceipt.receiptId),
  };
}
