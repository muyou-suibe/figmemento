const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sign(value: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function createSignedAdminSession(password: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const timestamp = Math.floor(nowSeconds).toString();
  return `${timestamp}.${await sign(`admin:${timestamp}`, password)}`;
}

export async function verifySignedAdminSession(
  token: string | null | undefined,
  password: string | null,
  nowSeconds = Date.now() / 1000,
): Promise<boolean> {
  if (!password || !token) return false;
  const [timestampValue, signature] = token.split(".");
  const timestamp = Number(timestampValue);
  if (!timestampValue || !signature || !Number.isFinite(timestamp) || nowSeconds - timestamp > sessionLifetimeSeconds || timestamp - nowSeconds > 60) return false;
  return safeEqual(signature, await sign(`admin:${timestampValue}`, password));
}
