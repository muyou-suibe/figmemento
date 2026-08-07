import { cookies } from "next/headers";
import { getSessionCookieName, isValidAdminSession } from "../../../../lib/admin-auth";
import { getSupabaseServerClient } from "../../../../lib/supabase-server";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!(await isValidAdminSession(cookieStore.get(getSessionCookieName())?.value))) return new Response("Unauthorized.", { status: 401 });
  const params = new URL(request.url).searchParams;
  const queryText = params.get("q")?.trim().slice(0, 80) || "";
  const fulfillment = params.get("fulfillment") || "";
  const payment = params.get("payment") || "";
  const attention = params.get("attention") === "1";
  let ordersQuery = getSupabaseServerClient().from("orders").select("order_number, customer_email, payment_status, fulfillment_status, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at").order("created_at", { ascending: false });
  if (queryText) ordersQuery = ordersQuery.or(`order_number.ilike.%${queryText.replace(/[(),.%]/g, " ")}%,customer_email.ilike.%${queryText.replace(/[(),.%]/g, " ")}%`);
  if (fulfillment) ordersQuery = ordersQuery.eq("fulfillment_status", fulfillment);
  if (payment) ordersQuery = ordersQuery.eq("payment_status", payment);
  if (attention) ordersQuery = ordersQuery.in("fulfillment_status", ["awaiting_review", "quality_check", "issue"]);
  const { data, error } = await ordersQuery;
  if (error) return new Response("Could not export orders.", { status: 500 });
  const header = ["Order number", "Customer email", "Payment", "Fulfillment", "Subtotal cents", "Discount cents", "Shipping cents", "Total cents", "Currency", "Created at"];
  const rows = (data ?? []).map((order) => [order.order_number, order.customer_email, order.payment_status, order.fulfillment_status, order.subtotal_cents, order.discount_cents, order.shipping_cents, order.total_cents, order.currency, order.created_at].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="photogift-orders-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
