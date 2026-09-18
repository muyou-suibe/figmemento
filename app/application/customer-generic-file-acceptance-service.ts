import type { CustomerUploadAcceptanceDependencies } from "./customer-upload-acceptance-service.ts";
import {
  inspectCustomerGenericFileBytes,
  type CustomerGenericFileValidationIssue,
  type CustomerGenericFileWarning,
} from "../domain/customer-generic-file-inspection.ts";
import {
  parseCustomerUploadOwnerId,
  parseCustomerUploadReceipt,
  parseOwnedCustomerUploadReceipt,
  type CustomerUploadOwnerId,
  type CustomerUploadReceipt,
  type CustomerUploadReceiptId,
  type OwnedCustomerUploadReceipt,
} from "../domain/customer-upload.ts";
import type { GenericFileCustomizationFieldConstraints } from "../domain/customization-field.ts";

export interface AcceptCustomerGenericFileUploadInput {
  readonly verifiedOwnerId: CustomerUploadOwnerId;
  readonly fieldConstraints: GenericFileCustomizationFieldConstraints;
  readonly bytes: Uint8Array;
  readonly originalFilename?: string;
  readonly declaredContentType?: string;
}

export type CustomerGenericFileAcceptanceResult =
  | { readonly status: "accepted"; readonly receipt: CustomerUploadReceipt; readonly warnings: readonly CustomerGenericFileWarning[] }
  | { readonly status: "rejected"; readonly issues: readonly CustomerGenericFileValidationIssue[]; readonly warnings: readonly CustomerGenericFileWarning[] }
  | { readonly status: "source_failure"; readonly stage: "receipt_metadata" | "object_storage" | "receipt_persistence"; readonly compensation: "not_attempted" | "succeeded" | "failed" };

function equalReceipt(left: CustomerUploadReceipt, right: CustomerUploadReceipt): boolean {
  return left.receiptId === right.receiptId
    && left.originalFilename === right.originalFilename
    && left.contentType === right.contentType
    && left.byteSize === right.byteSize
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.lifecycle === right.lifecycle
    && JSON.stringify(left.dimensions) === JSON.stringify(right.dimensions);
}

async function* exactBytes(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

async function compensate(dependencies: CustomerUploadAcceptanceDependencies, receiptId: CustomerUploadReceiptId): Promise<"succeeded" | "failed"> {
  try {
    const result = await dependencies.objectStore.deletePrivateObject(receiptId);
    return result.status === "deleted" && result.value === true ? "succeeded" : "failed";
  } catch {
    return "failed";
  }
}

export async function acceptCustomerGenericFileUpload(
  input: AcceptCustomerGenericFileUploadInput,
  dependencies: CustomerUploadAcceptanceDependencies,
): Promise<CustomerGenericFileAcceptanceResult> {
  if (!parseCustomerUploadOwnerId(input.verifiedOwnerId).ok) {
    return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
  }
  const inspection = inspectCustomerGenericFileBytes({
    bytes: input.bytes,
    constraints: input.fieldConstraints,
    ...(input.originalFilename !== undefined ? { originalFilename: input.originalFilename } : {}),
    ...(input.declaredContentType !== undefined ? { declaredContentType: input.declaredContentType } : {}),
  });
  if (!inspection.accepted) return { status: "rejected", issues: inspection.issues, warnings: inspection.warnings };

  let intended: OwnedCustomerUploadReceipt;
  try {
    const receiptId = (dependencies.receiptIdGenerator ?? { allocateReceiptId: () => `cur-${crypto.randomUUID()}` }).allocateReceiptId();
    const createdAt = dependencies.now?.() ?? new Date().toISOString();
    const expiresAt = dependencies.expiryPolicy.deriveExpiresAt(createdAt);
    const candidate: OwnedCustomerUploadReceipt = {
      receiptId,
      ownerId: input.verifiedOwnerId,
      ...(inspection.file.safeOriginalFilename ? { originalFilename: inspection.file.safeOriginalFilename } : {}),
      contentType: inspection.file.contentType,
      byteSize: inspection.file.byteSize,
      createdAt,
      expiresAt,
      lifecycle: "active",
    };
    const parsed = parseOwnedCustomerUploadReceipt(candidate);
    if (!parsed.ok) return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
    intended = parsed.value;
  } catch {
    return { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" };
  }

  let objectMayExist = false;
  try {
    const stored = await dependencies.objectStore.putPrivateObject({
      receiptId: intended.receiptId,
      content: { bytes: exactBytes(input.bytes), contentType: intended.contentType },
    });
    objectMayExist = stored.status === "stored";
    if (stored.status !== "stored" || stored.value !== true) {
      return { status: "source_failure", stage: "object_storage", compensation: objectMayExist ? await compensate(dependencies, intended.receiptId) : "not_attempted" };
    }
  } catch {
    return { status: "source_failure", stage: "object_storage", compensation: "not_attempted" };
  }

  try {
    const persisted = await dependencies.receiptRepository.createAcceptedReceipt(intended);
    if (persisted.status === "accepted") {
      const parsed = parseCustomerUploadReceipt(persisted.value);
      if (parsed.ok && equalReceipt(parsed.value, intended)) return { status: "accepted", receipt: parsed.value, warnings: inspection.warnings };
    }
  } catch {
    // Compensation below keeps the private object from becoming an orphan.
  }
  return { status: "source_failure", stage: "receipt_persistence", compensation: await compensate(dependencies, intended.receiptId) };
}
