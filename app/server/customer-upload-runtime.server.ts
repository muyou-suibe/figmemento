import { readCustomerUploadConfig } from "../config/server.ts";
import type {
  CustomerUploadReceiptRepository,
} from "../application/customer-upload-repository.ts";
import {
  parseConfiguredItemHandoff,
} from "../domain/configured-item.ts";
import {
  getSharedLocalCustomerUploadRuntime,
} from "../infrastructure/customer-upload/local-customer-upload-runtime.server.ts";
import {
  createConfiguredGuestDraftOwnerService,
} from "../lib/guest-draft-owner.ts";
import {
  verifyCustomerUploadOwner,
} from "./customer-upload-ownership.server.ts";
import type { CustomerUploadOwnerId } from "../domain/customer-upload.ts";

export interface LocalCustomerUploadReceiptAuthority {
  readonly ownerId: CustomerUploadOwnerId;
  readonly receiptRepository: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
}

/**
 * This is only a routing hint. The configured-item acceptance boundary still
 * parses and re-resolves every Product, Variant, field, and receipt authority.
 */
export function hasPrivateImageReceiptValue(value: unknown): boolean {
  const parsed = parseConfiguredItemHandoff(value);
  return parsed.ok && parsed.value.customizationValues.some(
    (entry) => (entry.kind === "image" && entry.images.length > 0)
      || (entry.kind === "generic_file" && entry.files.length > 0),
  );
}

/**
 * Resolve the one local owner-scoped receipt authority used by Cart and
 * Readiness. A missing/invalid source or owner never creates a local runtime
 * and returns the same unavailable shape as a missing receipt authority.
 */
export async function resolveLocalCustomerUploadReceiptAuthority(
  request: Request,
): Promise<LocalCustomerUploadReceiptAuthority | null> {
  try {
    const configuration = readCustomerUploadConfig(process.env, process.env.NODE_ENV);
    if (configuration.source !== "local_fake") return null;

    const owner = await verifyCustomerUploadOwner(
      request,
      createConfiguredGuestDraftOwnerService(),
    );
    if (owner.status !== "authorized") return null;

    return {
      ownerId: owner.ownerId,
      receiptRepository: getSharedLocalCustomerUploadRuntime().receiptRepository,
    };
  } catch {
    return null;
  }
}
