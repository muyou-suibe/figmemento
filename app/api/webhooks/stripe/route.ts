import { getSupabaseServerClient } from "../../../lib/supabase-server";

const signatureToleranceSeconds = 300;

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const values = header.split(",").reduce<Record<string, string[]>>((result, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) result[key] = [...(result[key] ?? []), value];
    return result;
  }, {});
  const timestampValue = values.t?.[0];
  const signatures = values.v1 ?? [];
  const timestamp = Number(timestampValue);
  if (!timestampValue || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > signatureToleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => safeEqual(signature, expected));
}

type StripeSession = {
  id: string;
  payment_status?: string;
  client_reference_id?: string | null;
  metadata?: { order_number?: string };
  payment_intent?: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  const payload = await request.text();
  try {
    if (!(await verifyStripeSignature(payload, signature, secret))) {
      return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }

    const event = JSON.parse(payload) as { type?: string; data?: { object?: StripeSession } };
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") {
      return Response.json({ received: true });
    }
    const session = event.data?.object;
    if (!session?.id) return Response.json({ received: true });

    const supabase = getSupabaseServerClient();
    const orderNumber = session.metadata?.order_number ?? session.client_reference_id ?? null;
    let orderId: string | null = null;

    const bySession = await supabase.from("orders").select("id, payment_status, status").eq("stripe_checkout_session_id", session.id).maybeSingle();
    if (bySession.error) throw bySession.error;
    orderId = bySession.data?.id ?? null;

    if (!orderId && orderNumber) {
      const byNumber = await supabase.from("orders").select("id, payment_status, status").eq("order_number", orderNumber).maybeSingle();
      if (byNumber.error) throw byNumber.error;
      orderId = byNumber.data?.id ?? null;
    }

    if (!orderId) {
      console.error("Stripe webhook order not found", { sessionId: session.id, orderNumber });
      return Response.json({ received: true });
    }

    const existingOrder = bySession.data ?? (orderNumber ? (await supabase.from("orders").select("id, payment_status, status").eq("order_number", orderNumber).maybeSingle()).data : null);
    if (event.type === "checkout.session.completed") {
      // Webhooks can be retried. Once payment is confirmed, a replay must not
      // move the order backwards or trigger downstream work a second time.
      if (existingOrder?.payment_status === "paid") return Response.json({ received: true, duplicate: true });
      const update: Record<string, string> = {
        status: "paid",
        payment_status: "paid",
        fulfillment_status: "awaiting_review",
      };
      if (session.payment_intent) update.stripe_payment_intent_id = session.payment_intent;
      const { error } = await supabase.from("orders").update(update).eq("id", orderId).neq("payment_status", "paid");
      if (error) throw error;
    } else if (event.type === "checkout.session.expired") {
      // An expired checkout must never cancel an order that was already paid
      // by a delayed or replayed completed event.
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled", payment_status: "failed", fulfillment_status: "awaiting_payment" })
        .eq("id", orderId)
        .eq("payment_status", "unpaid")
        .eq("status", "pending_payment");
      if (error) throw error;
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
