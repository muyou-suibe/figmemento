import { readCustomerUploadConfig } from "../../config/server.ts";
import { getSharedLocalCustomerUploadRuntime } from "../../infrastructure/customer-upload/local-customer-upload-runtime.server.ts";
import { createConfiguredGuestDraftOwnerService } from "../../lib/guest-draft-owner.ts";
import { createCustomerInputSafeObservability } from "../../server/customer-input-safe-failure.server.ts";
import { createServerCustomerUploadFieldResolver } from "../../server/customer-upload-field-resolution.server.ts";
import { createCustomerUploadHttpHandler } from "../../server/customer-upload-http-handler.server.ts";
import { persistentMediaHttp } from "../../server/local-persistent-media-http.server.ts";

export async function POST(request: Request) {
  const observability = createCustomerInputSafeObservability();
  try {
    if (process.env.CUSTOMER_UPLOAD_SOURCE?.trim() === "local_persistent") return await persistentMediaHttp(request, "upload");
    const configuration = readCustomerUploadConfig(process.env, process.env.NODE_ENV);
    if (configuration.source !== "local_fake") {
      observability.record("upload", "temporary_failure");
      return Response.json({ error: "Customer upload is temporarily unavailable." }, { status: 503 });
    }
    const runtime = getSharedLocalCustomerUploadRuntime();
    return await createCustomerUploadHttpHandler({
      ownerService: createConfiguredGuestDraftOwnerService(),
      resolveFieldConstraints: createServerCustomerUploadFieldResolver(process.env, configuration.runtimeMode),
      createAcceptanceDependencies: () => runtime.acceptanceDependencies,
      runtimeMode: configuration.runtimeMode,
      observability,
    })(request);
  } catch {
    observability.record("upload", "temporary_failure");
    return Response.json({ error: "Customer upload is temporarily unavailable." }, { status: 503 });
  }
}
