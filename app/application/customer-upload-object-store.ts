import type {
  CustomerUploadReceiptId,
  CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";
import type { AllowedImageMimeType } from "../domain/customization-field.ts";

export interface CustomerUploadObjectContent {
  readonly bytes: AsyncIterable<Uint8Array>;
  readonly contentType: AllowedImageMimeType;
}

export interface CustomerUploadObjectInspection {
  readonly contentType: AllowedImageMimeType;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

export type CustomerUploadObjectStoreResult<T> =
  | { status: "stored" | "found" | "deleted"; value: T }
  | { status: "not_found" }
  | { status: "source_failure"; operation: "customer_upload_object_store.put" | "customer_upload_object_store.read" | "customer_upload_object_store.inspect" | "customer_upload_object_store.delete" };

export interface ReadCustomerUploadObject {
  readonly content: CustomerUploadObjectContent;
}

/**
 * Provider-neutral boundary for private customer bytes. Concrete adapters map
 * the opaque receipt ID to their own internal locator and never expose that
 * locator through this application contract.
 */
export interface CustomerUploadObjectStore {
  putPrivateObject(input: {
    receiptId: CustomerUploadReceiptId;
    content: CustomerUploadObjectContent;
  }): Promise<CustomerUploadObjectStoreResult<true>>;
  readPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<ReadCustomerUploadObject>>;
  inspectPrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<CustomerUploadObjectInspection>>;
  deletePrivateObject(
    receiptId: CustomerUploadReceiptId,
  ): Promise<CustomerUploadObjectStoreResult<true>>;
}

/**
 * A short-lived authorization grant, not a permanent URL or a production
 * artifact. The eventual route/provider implementation is deferred to Task 5.8.
 */
export interface CustomerInputPreviewCapability {
  readonly receiptId: CustomerUploadReceiptId;
  readonly expiresAt: CustomerUploadTimestamp;
}
