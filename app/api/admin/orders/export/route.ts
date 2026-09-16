import { cookies } from "next/headers";
import { getSessionCookieName, isValidAdminSession } from "../../../../lib/admin-auth";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";
import type { AdminOrdersQuery } from "../../../../application/admin-orders-read-repository.ts";
import { resolveAdminOrdersReadSource } from "../../../../server/admin-orders-source.server.ts";
import { loadAdminOrdersExportAfterAuthorization } from "../../../../server/admin-orders-composition.server.ts";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!(await isValidAdminSession(cookieStore.get(getSessionCookieName())?.value))) return new Response("Unauthorized.", { status: 401 });
  async function loadProductionAdminOrdersExport(query: AdminOrdersQuery): Promise<Response> {
    const queryText = query.searchTerm;
    const fulfillment = query.fulfillment;
    const payment = query.payment;
    const attention = query.attentionOnly;
    let ordersQuery = getSupabaseServerClient().from("orders").select("order_number, customer_email, payment_status, fulfillment_status, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at").order("created_at", { ascending: false });
    if (queryText) ordersQuery = ordersQuery.or(`order_number.ilike.%${queryText.replace(/[(),.%]/g, " ")}%,customer_email.ilike.%${queryText.replace(/[(),.%]/g, " ")}%`);
    if (fulfillment) ordersQuery = ordersQuery.eq("fulfillment_status", fulfillment);
    if (payment) ordersQuery = ordersQuery.eq("payment_status", payment);
    if (attention) ordersQuery = ordersQuery.in("fulfillment_status", ["awaiting_review", "quality_check", "issue"]);
    const { data, error } = await ordersQuery;
    if (error) return new Response("Could not export orders.", { status: 500 });
    const header = ["Order number", "Customer email", "Payment", "Fulfillment", "Subtotal cents", "Discount cents", "Shipping cents", "Total cents", "Currency", "Created at"];
    const rows = (data ?? []).map((order) => [order.order_number, order.customer_email, order.payment_status, order.fulfillment_status, order.subtotal_cents, order.discount_cents, order.shipping_cents, order.total_cents, order.currency, order.created_at].map(csvCell).join(","));
    return new Response([header.map(csvCell).join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="figmemento-orders-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const params = new URL(request.url).searchParams;
  const composition = await loadAdminOrdersExportAfterAuthorization({
    q: params.get("q") ?? undefined,
    fulfillment: params.get("fulfillment") ?? undefined,
    payment: params.get("payment") ?? undefined,
    attention: params.get("attention") ?? undefined,
  }, {
    resolveSource: resolveAdminOrdersReadSource,
    loadProduction: loadProductionAdminOrdersExport,
  });
  if (composition.status === "invalid_configuration") return Response.json({ status: "invalid_configuration" }, { status: 409 });
  if (composition.status === "unavailable") return Response.json({ status: "unavailable" }, { status: 503 });
  if (composition.status === "source_failure") return Response.json({ status: "source_failure", message: "Orders export is temporarily unavailable." }, { status: 503 });
  if (composition.status === "local_fake" || composition.status === "local_persistent") {
    const header = ["Order number", "Customer name", "Customer email", "Payment", "Fulfillment", "Subtotal cents", "Discount cents", "Shipping cents", "Total cents", "Currency", "Created at"];
    const rows = composition.value.map((order) => [order.publicReference, order.customerName, order.customerEmail, order.paymentStatus, order.fulfillmentStatus, order.subtotalCents, order.discountCents, order.shippingCents, order.totalCents, order.currency, order.createdAt].map(csvCell).join(","));
    return new Response([header.map(csvCell).join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="figmemento-local-test-orders-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return composition.value;
}
