import {
  acceptCustomerImageUpload,
  type AcceptCustomerImageUploadInput,
  type CustomerUploadAcceptanceDependencies,
  type CustomerUploadAcceptanceResult,
} from "../application/customer-upload-acceptance-service.ts";
import {
  acceptCustomerGenericFileUpload,
  type AcceptCustomerGenericFileUploadInput,
  type CustomerGenericFileAcceptanceResult,
} from "../application/customer-generic-file-acceptance-service.ts";
import {
  parseCustomerUploadReceipt,
  type CustomerUploadReceipt,
} from "../domain/customer-upload.ts";
import type { ImageCustomizationFieldConstraints } from "../domain/customization-field.ts";
import type { GenericFileCustomizationFieldConstraints } from "../domain/customization-field.ts";
import { getGuestDraftOwnerCookieName, type GuestDraftOwnerService } from "../lib/guest-draft-owner.ts";
import {
  createCustomerInputSafeObservability,
  customerInputFailureMessage,
  type CustomerInputFailureCategory,
  type CustomerInputSafeObservability,
} from "./customer-input-safe-failure.server.ts";
import { isSameOriginCustomerUploadMutation } from "./customer-upload-ownership.server.ts";

export type CustomerUploadFieldResolution =
  | { readonly status: "found"; readonly kind: "image"; readonly constraints: ImageCustomizationFieldConstraints }
  | { readonly status: "found"; readonly kind: "generic_file"; readonly constraints: GenericFileCustomizationFieldConstraints }
  | { readonly status: "not_found" }
  | { readonly status: "source_failure" };

/**
 * The field resolver may use route, query, and request-header context, but it
 * must not materialize browser multipart content to discover upload policy.
 */
export type CustomerUploadFieldResolutionRequest = Pick<Request, "headers" | "method" | "url">;

export interface CustomerUploadHttpHandlerDependencies {
  readonly ownerService: Pick<
    GuestDraftOwnerService,
    "ensureGuestDraftOwnerContext" | "getSetCookieHeader"
  >;
  /**
   * The HTTP surface owns no Product/draft/field lookup. A later authorized
   * outer boundary supplies server-resolved image constraints for this upload.
   */
  readonly resolveFieldConstraints: (
    request: CustomerUploadFieldResolutionRequest,
  ) => Promise<CustomerUploadFieldResolution>;
  /** Constructed only after method, origin, owner, and field gates pass. */
  readonly createAcceptanceDependencies: () => CustomerUploadAcceptanceDependencies;
  readonly acceptImageUpload?: (
    input: AcceptCustomerImageUploadInput,
    dependencies: CustomerUploadAcceptanceDependencies,
  ) => Promise<CustomerUploadAcceptanceResult>;
  readonly acceptGenericFileUpload?: (
    input: AcceptCustomerGenericFileUploadInput,
    dependencies: CustomerUploadAcceptanceDependencies,
  ) => Promise<CustomerGenericFileAcceptanceResult>;
  readonly runtimeMode?: string;
  readonly observability?: CustomerInputSafeObservability;
}

type SafeUploadIssue = { readonly code: string; readonly message: string };
type SafeUploadWarning = { readonly code: string; readonly message: string };

/**
 * A technical request-safety allowance for multipart boundaries and per-part
 * headers. It is not Product configuration and never replaces `maxBytes` as
 * the authoritative image-byte limit.
 */
const MULTIPART_REQUEST_OVERHEAD_BYTES = 64 * 1024;

interface SafeAcceptedCustomerUploadResponse {
  readonly receipt: CustomerUploadReceipt;
  readonly warnings: readonly SafeUploadWarning[];
}

function readContentLengthHint(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function exceedsMultipartRequestSafetyLimit(
  contentLength: number | null,
  maxImageBytes: number,
): boolean {
  if (contentLength === null) return false;
  const limit = maxImageBytes > Number.MAX_SAFE_INTEGER - MULTIPART_REQUEST_OVERHEAD_BYTES
    ? Number.MAX_SAFE_INTEGER
    : maxImageBytes + MULTIPART_REQUEST_OVERHEAD_BYTES;
  return contentLength > limit;
}

function fieldResolutionRequest(request: Request): CustomerUploadFieldResolutionRequest {
  // Do not pass the live Request: a resolver needs only non-body route/query
  // context and must have no opportunity to trigger body materialization.
  return {
    headers: new Headers(request.headers),
    method: request.method,
    url: request.url,
  };
}

function readCookie(request: Request, name: string): string | null {
  const value = request.headers.get("cookie")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!value) return null;
  try {
    return decodeURIComponent(value.trim().slice(name.length + 1));
  } catch {
    return null;
  }
}

function safeIssues(issues: readonly { readonly code: string; readonly message: string }[]): readonly SafeUploadIssue[] {
  const messages: Record<string, string> = {
    unsupported_type: "Choose a supported image type for this field.",
    invalid_image: "Choose a valid supported image file.",
    too_large: "Image byte size exceeds the configured maximum.",
    dimensions_too_small: "Image dimensions are below the configured minimum.",
    invalid_filename: "Filename is not a safe display value.",
    count_too_low: "Image count is below the configured minimum.",
    count_too_high: "Image count exceeds the configured maximum.",
    file_count_too_low: "File count is below the configured minimum.",
    file_count_too_high: "File count exceeds the configured maximum.",
    file_metadata_missing: "Private file metadata is unavailable.",
    file_mime_not_allowed: "Private file type is not allowed for this field.",
    file_too_large: "Private file size exceeds the configured maximum.",
    invalid_file_metadata: "Private file metadata is invalid.",
  };
  return issues.flatMap(({ code }) => messages[code] ? [{ code, message: messages[code] }] : []);
}

function safeWarnings(warnings: readonly { readonly code: string; readonly message: string }[]): readonly SafeUploadWarning[] {
  const messages: Record<string, string> = {
    below_recommended_dimensions: "Image dimensions are below the configured recommendation.",
    declared_mime_mismatch: "Declared image type does not match the detected image bytes.",
    declared_byte_size_mismatch: "Declared image size does not match the received image bytes.",
    declared_mime_ignored: "The browser MIME claim was ignored; the file bytes were inspected.",
  };
  return warnings.flatMap(({ code }) => messages[code] ? [{ code, message: messages[code] }] : []);
}

function safeAcceptedResponse(
  receiptValue: unknown,
  warnings: readonly { readonly code: string; readonly message: string }[],
): SafeAcceptedCustomerUploadResponse | null {
  const parsed = parseCustomerUploadReceipt(receiptValue);
  if (!parsed.ok) return null;
  const receipt = parsed.value;
  return {
    receipt: {
      receiptId: receipt.receiptId,
      ...(receipt.originalFilename ? { originalFilename: receipt.originalFilename } : {}),
      contentType: receipt.contentType,
      byteSize: receipt.byteSize,
      ...(receipt.dimensions ? { dimensions: { width: receipt.dimensions.width, height: receipt.dimensions.height } } : {}),
      createdAt: receipt.createdAt,
      expiresAt: receipt.expiresAt,
      lifecycle: receipt.lifecycle,
    },
    warnings: safeWarnings(warnings),
  };
}

async function readSingleUploadFile(request: Request): Promise<
  | { readonly status: "found"; readonly file: File }
  | { readonly status: "invalid_request" }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { status: "invalid_request" };
  }
  try {
    const formData = await request.formData();
    const fields = [...formData.keys()];
    if (fields.length !== 1 || fields[0] !== "file") return { status: "invalid_request" };
    const files = formData.getAll("file");
    if (files.length !== 1 || typeof File === "undefined" || !(files[0] instanceof File)) {
      return { status: "invalid_request" };
    }
    return { status: "found", file: files[0] };
  } catch {
    return { status: "invalid_request" };
  }
}

function responseWithIssuedOwnerCookie(
  response: Response,
  issuedContext: string | null,
  dependencies: CustomerUploadHttpHandlerDependencies,
): Response {
  if (!issuedContext) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", dependencies.ownerService.getSetCookieHeader(issuedContext, dependencies.runtimeMode));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Provider-neutral POST boundary for the sole new-browser upload contract.
 * It accepts exactly one multipart `file`; all Product/field authority is
 * supplied by the server-side resolver, never by browser fields.
 */
export function createCustomerUploadHttpHandler(
  dependencies: CustomerUploadHttpHandlerDependencies,
): (request: Request) => Promise<Response> {
  const accept = dependencies.acceptImageUpload ?? acceptCustomerImageUpload;
  const acceptGeneric = dependencies.acceptGenericFileUpload ?? acceptCustomerGenericFileUpload;
  const observability = dependencies.observability ?? createCustomerInputSafeObservability();

  function failure(category: CustomerInputFailureCategory, status: number): Response {
    observability.record("upload", category);
    return Response.json({ error: customerInputFailureMessage("upload", category) }, { status });
  }

  return async function handleCustomerUpload(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      observability.record("upload", "invalid_request");
      return Response.json({ error: "Method not allowed." }, { status: 405, headers: { allow: "POST" } });
    }
    if (!isSameOriginCustomerUploadMutation(request)) {
      return failure("forbidden", 403);
    }

    let owner;
    try {
      owner = await dependencies.ownerService.ensureGuestDraftOwnerContext(
        readCookie(request, getGuestDraftOwnerCookieName()),
      );
    } catch {
      return failure("temporary_failure", 503);
    }
    if (owner.status === "invalid" || owner.status === "expired") {
      return failure("stale_or_expired", 404);
    }
    if (owner.status !== "existing" && owner.status !== "issued") {
      return failure("temporary_failure", 503);
    }

    const issuedContext = owner.status === "issued" ? owner.value.context : null;
    const verifiedOwnerId = owner.value.ownerId;
    let resolution: CustomerUploadFieldResolution;
    try {
      resolution = await dependencies.resolveFieldConstraints(fieldResolutionRequest(request));
    } catch {
      observability.record("upload", "temporary_failure");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "temporary_failure") }, { status: 503 }),
        issuedContext,
        dependencies,
      );
    }
    if (resolution.status === "not_found") {
      observability.record("upload", "not_found");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "not_found") }, { status: 404 }),
        issuedContext,
        dependencies,
      );
    }
    if (resolution.status !== "found") {
      observability.record("upload", "temporary_failure");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "temporary_failure") }, { status: 503 }),
        issuedContext,
        dependencies,
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      observability.record("upload", "invalid_request");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "invalid_request") }, { status: 400 }),
        issuedContext,
        dependencies,
      );
    }

    // Cloudflare's Request.formData() does not provide a streaming body cap to
    // this route. When a valid Content-Length is available, reject an obviously
    // oversized multipart request before it is materialized. Missing or false
    // hints are not trusted: the actual File size and inspected Uint8Array stay
    // authoritative after parsing.
    if (exceedsMultipartRequestSafetyLimit(
      readContentLengthHint(request),
      resolution.constraints.maxBytes,
    )) {
      observability.record("upload", "upload_rejected");
      return responseWithIssuedOwnerCookie(Response.json({
        issues: [{ code: "too_large", message: "Image byte size exceeds the configured maximum." }],
        warnings: [],
      }, { status: 400 }), issuedContext, dependencies);
    }

    const upload = await readSingleUploadFile(request);
    if (upload.status !== "found") {
      observability.record("upload", "invalid_request");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "invalid_request") }, { status: 400 }),
        issuedContext,
        dependencies,
      );
    }

    // This check remains authoritative when Content-Length is absent or lies.
    // Task 5.5 then treats the resulting inspected Uint8Array as final authority.
    if (upload.file.size <= 0 || upload.file.size > resolution.constraints.maxBytes) {
      observability.record("upload", "upload_rejected");
      return responseWithIssuedOwnerCookie(Response.json({
        issues: [{ code: "too_large", message: "Image byte size exceeds the configured maximum." }],
        warnings: [],
      }, { status: 400 }), issuedContext, dependencies);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await upload.file.arrayBuffer());
    } catch {
      observability.record("upload", "invalid_request");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "invalid_request") }, { status: 400 }),
        issuedContext,
        dependencies,
      );
    }

    let result: CustomerUploadAcceptanceResult | CustomerGenericFileAcceptanceResult;
    try {
      const acceptanceDependencies = dependencies.createAcceptanceDependencies();
      result = resolution.kind === "generic_file"
        ? await acceptGeneric({
            verifiedOwnerId,
            fieldConstraints: resolution.constraints,
            bytes,
            originalFilename: upload.file.name,
            declaredContentType: upload.file.type,
          }, acceptanceDependencies)
        : await accept({
            verifiedOwnerId,
            fieldConstraints: resolution.constraints,
            bytes,
            originalFilename: upload.file.name,
            declaredContentType: upload.file.type,
            declaredByteSize: upload.file.size,
          }, acceptanceDependencies);
    } catch {
      observability.record("upload", "temporary_failure");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "temporary_failure") }, { status: 503 }),
        issuedContext,
        dependencies,
      );
    }

    if (result.status === "rejected") {
      observability.record("upload", "upload_rejected");
      return responseWithIssuedOwnerCookie(
        Response.json({ issues: safeIssues(result.issues), warnings: safeWarnings(result.warnings) }, { status: 400 }),
        issuedContext,
        dependencies,
      );
    }
    if (result.status !== "accepted") {
      observability.record("upload", "temporary_failure");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "temporary_failure") }, { status: 503 }),
        issuedContext,
        dependencies,
      );
    }

    const response = safeAcceptedResponse(result.receipt, result.warnings);
    if (!response) {
      observability.record("upload", "temporary_failure");
      return responseWithIssuedOwnerCookie(
        Response.json({ error: customerInputFailureMessage("upload", "temporary_failure") }, { status: 503 }),
        issuedContext,
        dependencies,
      );
    }
    return responseWithIssuedOwnerCookie(Response.json(response, { status: 201 }), issuedContext, dependencies);
  };
}
