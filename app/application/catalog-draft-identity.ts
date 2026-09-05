export type CatalogDraftEntityKind = "option" | "option_value" | "variant" | "asset" | "fulfillment";

export type CatalogDraftIdDeriver = (
  productId: string,
  entityKind: CatalogDraftEntityKind,
  draftId: string,
) => string | Promise<string>;

const CATALOG_DRAFT_UUID_NAMESPACE = "c6f4f31e-5b75-4d7e-9f1a-756f49857295";
const NEW_ID_PATTERN = /^new:[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;

export function isCatalogDraftId(id: string): boolean {
  return NEW_ID_PATTERN.test(id);
}

function uuidBytes(uuid: string): Uint8Array {
  const hexadecimal = uuid.replaceAll("-", "");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hexadecimal.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function formatUuid(bytes: Uint8Array): string {
  const hexadecimal = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

export async function deriveCatalogDraftUuid(
  productId: string,
  entityKind: CatalogDraftEntityKind,
  draftId: string,
): Promise<string> {
  const namespace = uuidBytes(CATALOG_DRAFT_UUID_NAMESPACE);
  const name = new TextEncoder().encode(JSON.stringify([productId, entityKind, draftId]));
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace);
  input.set(name, namespace.length);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", input));
  const result = digest.slice(0, 16);
  result[6] = (result[6] & 0x0f) | 0x50;
  result[8] = (result[8] & 0x3f) | 0x80;
  return formatUuid(result);
}
