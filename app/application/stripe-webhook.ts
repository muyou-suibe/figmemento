const signatureToleranceSeconds = 300;

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds = Date.now() / 1000,
): Promise<boolean> {
  const values = header.split(",").reduce<Record<string, string[]>>((result, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) result[key] = [...(result[key] ?? []), value];
    return result;
  }, {});
  const timestampValue = values.t?.[0];
  const signatures = values.v1 ?? [];
  const timestamp = Number(timestampValue);
  if (!timestampValue || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > signatureToleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => safeEqual(signature, expected));
}

export type ExistingWebhookAction = "ignore" | "duplicate" | "complete" | "expire";

export function decideExistingWebhookAction(input: {
  eventType: string | undefined;
  paymentStatus: string | undefined;
  orderStatus: string | undefined;
}): ExistingWebhookAction {
  if (input.eventType === "checkout.session.completed") {
    return input.paymentStatus === "paid" ? "duplicate" : "complete";
  }
  if (input.eventType === "checkout.session.expired") {
    return input.paymentStatus === "unpaid" && input.orderStatus === "pending_payment" ? "expire" : "ignore";
  }
  return "ignore";
}
