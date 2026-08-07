import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../lib/supabase-server";
import { getSessionCookieName, isValidAdminSession } from "../../lib/admin-auth";
import { AdminOrderControls } from "../AdminOrderControls";
import { AdminLogoutButton } from "../AdminLogoutButton";
import { AdminTrackingControls } from "../AdminTrackingControls";
import { AdminPhotoReview } from "../AdminPhotoReview";
import { AdminDigitalDelivery } from "../AdminDigitalDelivery";
import { AdminCleanupUploads } from "../AdminCleanupUploads";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  order_number: string;
  customer_email: string | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  subtotal_cents: number;
  discount_cents: number;
  coupon_code: string | null;
  shipping_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  order_items: Array<{ id: string; product_name: string; quantity: number; customization: { note?: string; photoPath?: string; photoReviewStatus?: string; digitalDeliveryName?: string } | null; photoPreviewUrl?: string | null; products?: { is_digital?: boolean } | null }>;
  order_status_logs: Array<{ id: string; action: string; from_value: string | null; to_value: string | null; actor: string; created_at: string }>;
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

type AdminOrdersPageProps = { searchParams?: Promise<{ q?: string; fulfillment?: string; payment?: string; attention?: string; page?: string }> };

const fulfillmentFilters = ["", "awaiting_review", "in_production", "quality_check", "shipped", "delivered", "issue"] as const;
const paymentFilters = ["", "paid", "unpaid", "failed"] as const;
const PAGE_SIZE = 20;

function cleanQuery(value: string | undefined): string {
  return (value || "").trim().slice(0, 80);
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const cookieStore = await cookies();
  if (!(await isValidAdminSession(cookieStore.get(getSessionCookieName())?.value))) redirect("/admin/login");
  const params = await searchParams;
  const queryText = cleanQuery(params?.q);
  const fulfillmentFilter = fulfillmentFilters.includes((params?.fulfillment || "") as typeof fulfillmentFilters[number]) ? params?.fulfillment || "" : "";
  const paymentFilter = paymentFilters.includes((params?.payment || "") as typeof paymentFilters[number]) ? params?.payment || "" : "";
  const attentionFilter = params?.attention === "1";
  const parsedPage = Number.parseInt(params?.page || "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let ordersQuery = getSupabaseServerClient()
    .from("orders")
    .select("id, order_number, customer_email, status, payment_status, fulfillment_status, tracking_carrier, tracking_number, tracking_status, subtotal_cents, discount_cents, coupon_code, shipping_cents, total_cents, currency, created_at, order_items(id, product_name, quantity, customization, products(is_digital)), order_status_logs(id, action, from_value, to_value, actor, created_at)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (queryText) {
    const safeQuery = queryText.replace(/[(),.%]/g, " ");
    ordersQuery = ordersQuery.or(`order_number.ilike.%${safeQuery}%,customer_email.ilike.%${safeQuery}%`);
  }
  if (fulfillmentFilter) ordersQuery = ordersQuery.eq("fulfillment_status", fulfillmentFilter);
  if (paymentFilter) ordersQuery = ordersQuery.eq("payment_status", paymentFilter);
  if (attentionFilter) ordersQuery = ordersQuery.in("fulfillment_status", ["awaiting_review", "quality_check", "issue"]);
  let { data, count, error } = await ordersQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
  if (error) {
    // Keep the operations console useful when an optional migration (logs or
    // product relations) has not been applied to the connected Supabase project.
    console.error("Admin order query failed; retrying with the core order shape.", error);
    let fallbackQuery = getSupabaseServerClient()
      .from("orders")
      .select("id, order_number, customer_email, status, payment_status, fulfillment_status, tracking_carrier, tracking_number, tracking_status, subtotal_cents, discount_cents, coupon_code, shipping_cents, total_cents, currency, created_at, order_items(id, product_name, quantity, customization)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (fulfillmentFilter) fallbackQuery = fallbackQuery.eq("fulfillment_status", fulfillmentFilter);
    if (paymentFilter) fallbackQuery = fallbackQuery.eq("payment_status", paymentFilter);
    if (attentionFilter) fallbackQuery = fallbackQuery.in("fulfillment_status", ["awaiting_review", "quality_check", "issue"]);
    ({ data, count, error } = await fallbackQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1));
    if (error) console.error("Core admin order query failed.", error);
  }
  const rawOrders = (data ?? []) as Order[];
  const totalOrders = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  if (!error && totalOrders > 0 && currentPage > totalPages) {
    const safeParams = new URLSearchParams();
    if (queryText) safeParams.set("q", queryText);
    if (fulfillmentFilter) safeParams.set("fulfillment", fulfillmentFilter);
    if (paymentFilter) safeParams.set("payment", paymentFilter);
    if (attentionFilter) safeParams.set("attention", "1");
    safeParams.set("page", String(totalPages));
    redirect(`/admin/orders?${safeParams.toString()}`);
  }
  const bucket = process.env.SUPABASE_UPLOAD_BUCKET || "photogift-uploads";
  const orders = await Promise.all(rawOrders.map(async (order) => ({
    ...order,
    order_items: await Promise.all((order.order_items ?? []).map(async (item) => {
      if (!item.customization?.photoPath) return item;
      const { data: signed } = await getSupabaseServerClient().storage.from(bucket).createSignedUrl(item.customization.photoPath, 60 * 15);
      return { ...item, photoPreviewUrl: signed?.signedUrl ?? null };
    })),
  })));

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">PhotoGift · Local operations</p><h1>Orders</h1><p>Review paid orders and the customization details before production.</p></div>
        <div className="admin-header-actions">
<div className="admin-header-links"><Link className="admin-back-link" href={{ pathname: "/api/admin/orders/export", query: { ...(queryText ? { q: queryText } : {}), ...(fulfillmentFilter ? { fulfillment: fulfillmentFilter } : {}), ...(paymentFilter ? { payment: paymentFilter } : {}), ...(attentionFilter ? { attention: "1" } : {}) } }}>Export CSV ↓</Link><Link className="admin-back-link" href="/">Back to storefront ↗</Link></div>
          <AdminLogoutButton />
        </div>
      </header>
      <form className="admin-filters" method="get" aria-label="Filter orders">
        <label><span>Search</span><input name="q" defaultValue={queryText} placeholder="Order number or email" /></label>
        <label><span>Fulfillment</span><select name="fulfillment" defaultValue={fulfillmentFilter}><option value="">All fulfillment</option>{fulfillmentFilters.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label><span>Payment</span><select name="payment" defaultValue={paymentFilter}><option value="">All payment</option>{paymentFilters.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="admin-attention-filter"><input type="checkbox" name="attention" value="1" defaultChecked={attentionFilter} /><span>Needs attention</span></label>
        <button type="submit">Apply filters</button>
        {(queryText || fulfillmentFilter || paymentFilter || attentionFilter) && <Link className="admin-filter-reset" href="/admin/orders">Clear</Link>}
      </form>
      {!error && totalOrders > 0 && <div className="admin-results-summary">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalOrders)} of {totalOrders} orders</div>}
      {error ? <div className="admin-state admin-error">Could not load orders. Check the Supabase server configuration.</div> : orders.length === 0 ? <div className="admin-state">{queryText || fulfillmentFilter || paymentFilter || attentionFilter ? "No matching orders." : "No orders yet."}</div> : <section className="admin-orders" aria-label="Orders list">{orders.map((order) => <article className="admin-order-card" key={order.id}>
        <div className="admin-order-top"><div><p className="admin-order-number">{order.order_number}</p><p className="admin-order-date">{new Date(order.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p></div><strong className="admin-order-total">{money(order.total_cents, order.currency)}</strong></div>
        <div className="admin-order-meta"><span><small>Customer</small>{order.customer_email || "—"}</span><span><small>Payment</small><b className={`status-pill status-${order.payment_status}`}>{label(order.payment_status)}</b></span><span><small>Fulfillment</small><b className={`status-pill status-${order.fulfillment_status}`}>{label(order.fulfillment_status)}</b></span></div>
        <div className="admin-order-items">{order.order_items?.map((item, index) => <div className="admin-order-item" key={`${order.id}-${index}`}><span>{item.product_name} × {item.quantity}{item.customization?.note && <small className="admin-custom-note">Note: {item.customization.note}</small>}</span><span>{item.photoPreviewUrl ? <><a className="admin-photo-link" href={item.photoPreviewUrl} target="_blank" rel="noreferrer">View photo ↗</a><AdminPhotoReview orderNumber={order.order_number} orderItemId={item.id} initialStatus={item.customization?.photoReviewStatus} /></> : item.customization?.photoPath ? "Photo unavailable" : "No photo"}{item.products?.is_digital && <AdminDigitalDelivery orderNumber={order.order_number} orderItemId={item.id} initialName={item.customization?.digitalDeliveryName} />}</span></div>)}</div>
        <div className="admin-order-breakdown"><span>Subtotal {money(order.subtotal_cents, order.currency)}</span>{order.discount_cents > 0 && <span>Discount {order.coupon_code ? `${order.coupon_code} · ` : ""}{money(order.discount_cents, order.currency)}</span>}<span>Shipping {order.shipping_cents === 0 ? "Free" : money(order.shipping_cents, order.currency)}</span><strong>Paid total {money(order.total_cents, order.currency)}</strong></div>
        <AdminOrderControls orderNumber={order.order_number} initialStatus={order.fulfillment_status} paymentStatus={order.payment_status} />
        <AdminTrackingControls orderNumber={order.order_number} initialCarrier={order.tracking_carrier} initialNumber={order.tracking_number} initialStatus={order.tracking_status} />
        {order.order_status_logs?.length > 0 && <details className="admin-order-log"><summary>Recent operation log ({order.order_status_logs.length})</summary><ul>{order.order_status_logs.slice(0, 8).map((log) => <li key={log.id}><span>{label(log.action)}{log.to_value ? ` · ${log.to_value}` : ""}</span><small>{log.actor} · {new Date(log.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small></li>)}</ul></details>}
      </article>)}</section>}
      {!error && totalPages > 1 && <nav className="admin-pagination" aria-label="Orders pagination"><span>Page {currentPage} of {totalPages}</span><div>{currentPage > 1 && <Link href={{ pathname: "/admin/orders", query: { ...(queryText ? { q: queryText } : {}), ...(fulfillmentFilter ? { fulfillment: fulfillmentFilter } : {}), ...(paymentFilter ? { payment: paymentFilter } : {}), ...(attentionFilter ? { attention: "1" } : {}), page: String(currentPage - 1) } }}>Previous</Link>}{currentPage < totalPages && <Link href={{ pathname: "/admin/orders", query: { ...(queryText ? { q: queryText } : {}), ...(fulfillmentFilter ? { fulfillment: fulfillmentFilter } : {}), ...(paymentFilter ? { payment: paymentFilter } : {}), ...(attentionFilter ? { attention: "1" } : {}), page: String(currentPage + 1) } }}>Next</Link>}</div></nav>}
      <AdminCleanupUploads />
      <p className="admin-warning">Operations console · access is protected by the configured admin session.</p>
    </main>
  );
}
