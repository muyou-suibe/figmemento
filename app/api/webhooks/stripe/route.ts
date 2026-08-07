import { getSupabaseServerClient } from "../../../lib/supabase-server";
import type { StripeWebhookEvent } from "../../../domain/payment";
import { readStripeWebhookConfig, ServerConfigurationError } from "../../../config/server";
import { decideExistingWebhookAction, verifyStripeSignature } from "../../../application/stripe-webhook";

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = readStripeWebhookConfig().secret;
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
    }
    throw error;
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  const payload = await request.text();
  try {
    if (!(await verifyStripeSignature(payload, signature, secret))) {
      return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }

    const event = JSON.parse(payload) as StripeWebhookEvent;
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
    const action = decideExistingWebhookAction({
      eventType: event.type,
      paymentStatus: existingOrder?.payment_status,
      orderStatus: existingOrder?.status,
    });
    if (action === "duplicate") return Response.json({ received: true, duplicate: true });
    if (action === "complete") {
      // Webhooks can be retried. Once payment is confirmed, a replay must not
      // move the order backwards or trigger downstream work a second time.
      const update: Record<string, string> = {
        status: "paid",
        payment_status: "paid",
        fulfillment_status: "awaiting_review",
      };
      if (session.payment_intent) update.stripe_payment_intent_id = session.payment_intent;
      const { error } = await supabase.from("orders").update(update).eq("id", orderId).neq("payment_status", "paid");
      if (error) throw error;
    } else if (action === "expire") {
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
