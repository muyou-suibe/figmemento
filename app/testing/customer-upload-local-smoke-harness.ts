import type { CustomerUploadReceipt } from "../domain/customer-upload.ts";
import { parseCustomerUploadReceipt } from "../domain/customer-upload.ts";
import type { ImageCustomizationFieldConstraints } from "../domain/customization-field.ts";
import type { RuntimeEnvironment } from "../config/server.ts";
import {
  createDevelopmentCustomizationFieldRepository,
} from "../infrastructure/customization/development-customization-field-repository.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../lib/guest-draft-owner.ts";
import { createCustomerUploadHttpHandler } from "../server/customer-upload-http-handler.server.ts";
import { createDeterministicCustomerUploadFakes } from "./customer-upload-fakes.ts";

/**
 * LOCAL / TEST ONLY. NON-PRODUCTION. This composes fixture field authority
 * with in-memory upload resources; it is not a storage provider and never a
 * production fallback.
 */

const FIXTURE_PRODUCT_ID = "fixture-product-couple-figure";
const CREATED_AT = "2026-08-14T12:00:00.000Z";
const EXPIRES_AT = "2026-08-15T12:00:00.000Z";
const PREVIEW_EXPIRES_AT = "2026-08-14T12:05:00.000Z";
const SMOKE_ORIGIN = "https://local-upload-smoke.test";
const TEST_OWNER_SIGNING_SECRET = "local-upload-smoke-test-owner-secret-9x6k2p8r";

type SyntheticImageMode = "fixture-minimum" | "below-fixture-minimum";

export interface LocalCustomerUploadSmokeOptions {
  readonly environment: RuntimeEnvironment;
  /** Test-only mode; constraints remain read from the actual selected fixture field. */
  readonly syntheticImageMode?: SyntheticImageMode;
}

export type LocalCustomerUploadSmokeResult =
  | {
      readonly status: "passed";
      readonly fixtureProductId: string;
      readonly fixtureFieldId: string;
      readonly fixtureFieldCode: string;
      readonly configurationRevision: string;
      readonly httpStatus: 201;
      readonly receiptLifecycle: "active";
      readonly contentType: "image/png";
      readonly byteSize: number;
      readonly objectRoundTripVerified: true;
      readonly ownerScopedReceiptVerified: true;
    }
  | {
      readonly status: "upload_rejected";
      readonly fixtureProductId: string;
      readonly fixtureFieldId: string;
      readonly fixtureFieldCode: string;
      readonly configurationRevision: string;
      readonly httpStatus: 400;
      readonly objectCount: 0;
      readonly receiptCount: 0;
    };

function uint32BE(value: number): readonly number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type: string, data: readonly number[]): readonly number[] {
  return [
    ...uint32BE(data.length),
    ...type.split("").map((entry) => entry.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

/** TEST IMAGE ONLY. Its dimensions are derived from the fixture field. */
function createSyntheticPng(width: number, height: number): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", [0]),
    ...pngChunk("IEND", []),
  ]);
}

async function readStream(bytes: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of bytes) {
    const copy = new Uint8Array(chunk);
    chunks.push(copy);
    length += copy.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function hasEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function syntheticDimensions(
  constraints: ImageCustomizationFieldConstraints,
  mode: SyntheticImageMode,
): { readonly width: number; readonly height: number } {
  if (mode === "fixture-minimum") return constraints.minDimensions;
  return {
    width: Math.max(1, constraints.minDimensions.width - 1),
    height: constraints.minDimensions.height,
  };
}

function readIssuedContext(setCookieHeader: string | null): string {
  const prefix = `${getGuestDraftOwnerCookieName()}=`;
  const cookie = setCookieHeader?.split(";")[0];
  if (!cookie?.startsWith(prefix)) {
    throw new Error("Local upload smoke did not receive the expected test-only owner context.");
  }
  return decodeURIComponent(cookie.slice(prefix.length));
}

function safeAcceptedReceipt(value: unknown): CustomerUploadReceipt {
  if (!value || typeof value !== "object" || !("receipt" in value)) {
    throw new Error("Local upload smoke received an invalid upload response.");
  }
  const parsed = parseCustomerUploadReceipt(value.receipt);
  if (!parsed.ok) throw new Error("Local upload smoke response is not a safe receipt.");
  return parsed.value;
}

function makeOwnerService() {
  let next = 0;
  return createGuestDraftOwnerService({
    signingSecret: TEST_OWNER_SIGNING_SECRET,
    contextLifetimeSeconds: 3_600,
  }, {
    nowSeconds: () => 1_786_752_000,
    randomBytes(byteLength) {
      const bytes = new Uint8Array(byteLength);
      for (let index = 0; index < byteLength; index += 1) bytes[index] = (next + index + 1) % 256;
      next += byteLength;
      return bytes;
    },
  });
}

function makeUploadRequest(bytes: Uint8Array, fieldId: string): Request {
  const fileBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBuffer).set(bytes);
  const form = new FormData();
  form.append("file", new File([fileBuffer], "local-fixture-image.png", { type: "image/png" }));
  return new Request(`${SMOKE_ORIGIN}/api/uploads?productId=${encodeURIComponent(FIXTURE_PRODUCT_ID)}&fieldId=${encodeURIComponent(fieldId)}`, {
    method: "POST",
    headers: { origin: SMOKE_ORIGIN, "sec-fetch-site": "same-origin" },
    body: form,
  });
}

/**
 * Runs the single local composition used by Task 6.4. It deliberately does
 * not call a framework route because that route has no approved production
 * provider/resolver composition yet; the real upload HTTP boundary is injected
 * with local fixture authority and deterministic in-memory resources instead.
 */
export async function runLocalCustomerUploadSmoke(
  options: LocalCustomerUploadSmokeOptions,
): Promise<LocalCustomerUploadSmokeResult> {
  const fixtureRepository = createDevelopmentCustomizationFieldRepository(options.environment);
  const configurationResult = await fixtureRepository.getCustomizationFieldsForProduct(FIXTURE_PRODUCT_ID);
  if (configurationResult.status !== "found") {
    throw new Error("Expected Task 4.6 development fixture configuration is unavailable.");
  }
  const imageField = configurationResult.value.fields.find(
    (field): field is typeof field & { readonly kind: "image" } => field.isActive && field.kind === "image",
  );
  if (!imageField) throw new Error("Expected active image field is unavailable in the development fixture.");

  const dimensions = syntheticDimensions(imageField.constraints, options.syntheticImageMode ?? "fixture-minimum");
  const submittedBytes = createSyntheticPng(dimensions.width, dimensions.height);
  const fakes = createDeterministicCustomerUploadFakes({
    now: () => CREATED_AT,
    derivePreviewExpiresAt: () => PREVIEW_EXPIRES_AT,
  });
  const ownerService = makeOwnerService();
  const handler = createCustomerUploadHttpHandler({
    ownerService,
    async resolveFieldConstraints(request) {
      const url = new URL(request.url);
      if (url.searchParams.get("productId") !== FIXTURE_PRODUCT_ID || url.searchParams.get("fieldId") !== imageField.id) {
        return { status: "not_found" };
      }
      return { status: "found", kind: "image", constraints: imageField.constraints };
    },
    createAcceptanceDependencies() {
      return {
        objectStore: fakes.objectStore,
        receiptRepository: fakes.receiptRepository,
        receiptIdGenerator: { allocateReceiptId: () => "local-smoke-receipt-001" },
        now: () => CREATED_AT,
        expiryPolicy: { deriveExpiresAt: () => EXPIRES_AT },
      };
    },
    runtimeMode: options.environment.NODE_ENV,
  });

  const response = await handler(makeUploadRequest(submittedBytes, imageField.id));
  const responseBody: unknown = await response.json();
  const common = {
    fixtureProductId: configurationResult.value.productId,
    fixtureFieldId: imageField.id,
    fixtureFieldCode: imageField.code,
    configurationRevision: configurationResult.value.configurationRevision,
  };

  if (response.status === 400) {
    const snapshot = fakes.snapshot();
    if (snapshot.objects.length !== 0 || snapshot.receipts.length !== 0) {
      throw new Error("Rejected local smoke upload must not persist test resources.");
    }
    return { status: "upload_rejected", ...common, httpStatus: 400, objectCount: 0, receiptCount: 0 };
  }
  if (response.status !== 201) throw new Error("Local upload smoke did not receive an accepted response.");

  const receipt = safeAcceptedReceipt(responseBody);
  if (receipt.lifecycle !== "active" || receipt.contentType !== "image/png" || receipt.byteSize !== submittedBytes.byteLength) {
    throw new Error("Local upload smoke receipt metadata does not match authoritative inspection.");
  }
  const ownerContext = readIssuedContext(response.headers.get("set-cookie"));
  const ownerVerification = await ownerService.verifyGuestDraftOwnerContext(ownerContext);
  if (ownerVerification.status !== "valid") throw new Error("Local upload smoke could not verify its test-only owner context.");
  const ownedReceipt = await fakes.receiptRepository.findOwnedReceipt(receipt.receiptId, ownerVerification.ownerId);
  const wrongOwnerReceipt = await fakes.receiptRepository.findOwnedReceipt(receipt.receiptId, "gdo_wrong-owner");
  if (ownedReceipt.status !== "found" || wrongOwnerReceipt.status !== "not_found") {
    throw new Error("Local upload smoke owner-scoped receipt checks failed.");
  }
  const object = await fakes.objectStore.readPrivateObject(receipt.receiptId);
  if (object.status !== "found") throw new Error("Local upload smoke object was not persisted.");
  const storedBytes = await readStream(object.value.content.bytes);
  if (object.value.content.contentType !== "image/png" || !hasEqualBytes(storedBytes, submittedBytes)) {
    throw new Error("Local upload smoke object roundtrip failed.");
  }

  return {
    status: "passed",
    ...common,
    httpStatus: 201,
    receiptLifecycle: "active",
    contentType: "image/png",
    byteSize: submittedBytes.byteLength,
    objectRoundTripVerified: true,
    ownerScopedReceiptVerified: true,
  };
}

export const LOCAL_CUSTOMER_UPLOAD_SMOKE_FIXTURE_PRODUCT_ID = FIXTURE_PRODUCT_ID;
