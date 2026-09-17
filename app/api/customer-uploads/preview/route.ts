import { readCustomerUploadConfig } from "../../../config/server.ts";
import { getSharedLocalCustomerUploadRuntime } from "../../../infrastructure/customer-upload/local-customer-upload-runtime.server.ts";
import { createConfiguredGuestDraftOwnerService } from "../../../lib/guest-draft-owner.ts";
import { createCustomerInputSafeObservability } from "../../../server/customer-input-safe-failure.server.ts";
import { createCustomerUploadPreviewHttpHandler } from "../../../server/customer-upload-preview-handler.server.ts";
import { persistentMediaHttp } from "../../../server/local-persistent-media-http.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../../../config/server-runtime-composition.server.ts";

export async function GET(request: Request): Promise<Response> {
  const observability = createCustomerInputSafeObservability();
  try {
    const selection = resolveCanonicalLocalCommerceCapability("upload");
    if (selection === "selected") return await persistentMediaHttp(request, "preview");
    if (selection === "unavailable") {
      observability.record("preview", "temporary_failure");
      return Response.json({ error: "Customer input preview is temporarily unavailable." }, { status: 503 });
    }
    const configuration = readCustomerUploadConfig(process.env, process.env.NODE_ENV);
    if (configuration.source !== "local_fake") {
      observability.record("preview", "temporary_failure");
      return Response.json({ error: "Customer input preview is temporarily unavailable." }, { status: 503 });
    }
    const runtime = getSharedLocalCustomerUploadRuntime();
    return createCustomerUploadPreviewHttpHandler({
      ownerService: createConfiguredGuestDraftOwnerService(),
      createReceiptRepository: () => runtime.receiptRepository,
      createPreviewAccess: () => runtime.previewAccess,
      createObjectStore: () => runtime.objectStore,
      now: runtime.now,
      observability,
    })(request);
  } catch {
    observability.record("preview", "temporary_failure");
    return Response.json({ error: "Customer input preview is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (resolveCanonicalLocalCommerceCapability("upload") !== "selected") {
    return Response.json({ error: "Customer media is unavailable." }, { status: 503 });
  }
  return persistentMediaHttp(request, "crop");
}
