/**
 * A browser-local customer-input preview. Its blob URL is temporary browser
 * state only: creating or revoking one never uploads a file or creates a
 * customer-upload receipt.
 */
export interface LocalCustomerInputPreview {
  readonly url: string;
  revoke(): void;
}

export interface LocalCustomerInputPreviewUrlApi {
  createObjectURL(value: Blob): string;
  revokeObjectURL(url: string): void;
}

function browserUrlApi(): LocalCustomerInputPreviewUrlApi {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error("Local customer-input preview is unavailable in this runtime.");
  }
  return URL;
}

/** Creates one revocable browser-local customer-input preview for a selected File. */
export function createLocalCustomerInputPreview(
  file: File,
  urlApi: LocalCustomerInputPreviewUrlApi = browserUrlApi(),
): LocalCustomerInputPreview {
  const url = urlApi.createObjectURL(file);
  let revoked = false;
  return {
    url,
    revoke() {
      if (revoked) return;
      revoked = true;
      urlApi.revokeObjectURL(url);
    },
  };
}

/** Replaces a local preview without retaining the superseded browser blob URL. */
export function replaceLocalCustomerInputPreview(
  current: LocalCustomerInputPreview | null,
  file: File,
  urlApi?: LocalCustomerInputPreviewUrlApi,
): LocalCustomerInputPreview {
  current?.revoke();
  return createLocalCustomerInputPreview(file, urlApi);
}

/** A null-safe draft/component disposal helper for future Product-detail UI. */
export function disposeLocalCustomerInputPreview(
  preview: LocalCustomerInputPreview | null | undefined,
): void {
  preview?.revoke();
}
