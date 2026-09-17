import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../lib/supabase-server";
import { getSessionCookieName, isValidAdminSession } from "../../lib/admin-auth";
import {
  LOCAL_ADMIN_ORDERS_SOURCE_NOTICE,
  type AdminOrderReadModel,
  type AdminOrdersQuery,
  type AdminOrdersReadPage,
} from "../../application/admin-orders-read-repository.ts";
import { resolveAdminOrdersReadSource } from "../../server/admin-orders-source.server.ts";
import { loadAdminOrdersPageAfterAuthorization } from "../../server/admin-orders-composition.server.ts";
import { AdminOrderControls } from "../AdminOrderControls";
import { AdminLogoutButton } from "../AdminLogoutButton";
import { brandName } from "../../config/identity.ts";
import { AdminTrackingControls } from "../AdminTrackingControls";
import { AdminPhotoReview } from "../AdminPhotoReview";
import { AdminDigitalDelivery } from "../AdminDigitalDelivery";
import { AdminCleanupUploads } from "../AdminCleanupUploads";
import { AdminPersistentOrderControls } from "../AdminPersistentOrderControls";
import { readUploadConfig } from "../../config/server";
import styles from "../products/admin-products.module.css";

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

const fulfillmentFilters = ["", "awaiting_review", "photo_review", "preview_pending", "preview_revision_requested", "preview_approved", "in_production", "quality_check", "ready_for_outbound", "shipment_created", "shipped", "delivered", "complete", "not_applicable", "issue"] as const;
const paymentFilters = ["", "paid", "unpaid", "failed"] as const;
const PAGE_SIZE = 20;

function ordersPath(query: AdminOrdersQuery, includePage = true): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.fulfillment) params.set("fulfillment", query.fulfillment);
  if (query.payment) params.set("payment", query.payment);
  if (query.attentionOnly) params.set("attention", "1");
  if (includePage && query.page > 1) params.set("page", String(query.page));
  const encoded = params.toString();
  return encoded ? `/admin/orders?${encoded}` : "/admin/orders";
}

function ordersExportPath(query: AdminOrdersQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.fulfillment) params.set("fulfillment", query.fulfillment);
  if (query.payment) params.set("payment", query.payment);
  if (query.attentionOnly) params.set("attention", "1");
  const encoded = params.toString();
  return encoded ? `/api/admin/orders/export?${encoded}` : "/api/admin/orders/export";
}

function localOrdersUnavailable(message: string) {
  return (
    <main className={`${styles.fusionAdminShell} ${styles.fusionAdminOrdersPage}`}>
      <header className="admin-header">
        <div><p className="eyebrow">{brandName} · Local operations</p><h1>Orders</h1><p>{LOCAL_ADMIN_ORDERS_SOURCE_NOTICE} — no production Order data is used in this mode.</p></div>
        <div className="admin-header-actions"><div className="admin-header-links"><Link className="admin-back-link" href="/admin/products">Products</Link><Link className="admin-back-link" href="/admin/settings">Settings</Link><Link className="admin-back-link" href="/">Back to storefront ↗</Link></div><AdminLogoutButton /></div>
      </header>
      <section className="admin-state admin-error" role="status">{message}</section>
      <p className="admin-warning">Local Orders is read-only and has no Supabase, Storage, Fulfillment, Tracking, or Order mutation path.</p>
    </main>
  );
}

function LocalOrderControls() {
  return (
    <div className="admin-status-control" aria-label="Local order controls unavailable">
      <p><strong>{LOCAL_ADMIN_ORDERS_SOURCE_NOTICE}</strong> — order mutations are not implemented in local mode.</p>
      <button type="button" disabled aria-disabled="true">Fulfillment controls unavailable</button>
      <button type="button" disabled aria-disabled="true">Tracking controls unavailable</button>
      <button type="button" disabled aria-disabled="true">Photo review unavailable</button>
      <button type="button" disabled aria-disabled="true">Digital delivery unavailable</button>
      <button type="button" disabled aria-disabled="true">Upload cleanup unavailable</button>
    </div>
  );
}

function LocalOrderCard({ order, persistent = false }: { order: AdminOrderReadModel; persistent?: boolean }) {
  return (
    <article className="admin-order-card" key={order.id}>
      <div className="admin-order-top"><div><p className="admin-order-number">{order.publicReference}</p><p className="admin-order-date">{new Date(order.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p></div><strong className="admin-order-total">{money(order.totalCents, order.currency)}</strong></div>
      <div className="admin-order-meta"><span><small>Customer</small>{order.customer.displayName}<small>{order.customer.displayEmail}</small></span><span><small>Payment</small><b className={`status-pill status-${order.paymentStatus}`}>{label(order.paymentStatus)}</b></span><span><small>Fulfillment</small><b className={`status-pill status-${order.fulfillmentStatus}`}>{label(order.fulfillmentStatus)}</b></span></div>
      <div className="admin-order-items">{order.lineItems.map((item) => <div className="admin-order-item" key={item.id}><span>{item.productName} × {item.quantity}{item.customizationSummary.map((entry) => <small className="admin-custom-note" key={`${item.id}-${entry.label}`}>{entry.label}: {entry.value}</small>)}</span><span>{item.photo.previewAvailable ? "Photo preview available" : "Photo preview unavailable locally"}{persistent && item.fulfillmentType === "digital" ? <AdminDigitalDelivery orderNumber={order.publicReference} orderItemId={item.id} /> : item.digitalDeliveryStatus ? ` · ${label(item.digitalDeliveryStatus)}` : ""}</span></div>)}</div>
      <div className="admin-order-breakdown"><span>Subtotal {money(order.subtotalCents, order.currency)}</span>{order.discountCents > 0 && <span>Discount {order.couponCode ? `${order.couponCode} · ` : ""}{money(order.discountCents, order.currency)}</span>}<span>Shipping {order.shippingCents === 0 ? "Free" : money(order.shippingCents, order.currency)}</span><strong>Local demo total {money(order.totalCents, order.currency)}</strong></div>
      {persistent
        ? <AdminPersistentOrderControls publicReference={order.publicReference} control={order.persistentControl ?? null} />
        : <LocalOrderControls />}
      {order.statusHistory.length > 0 && <details className="admin-order-log"><summary>Fixture status history ({order.statusHistory.length})</summary><ul>{order.statusHistory.slice(0, 8).map((entry) => <li key={entry.id}><span>{label(entry.action)}{entry.toValue ? ` · ${entry.toValue}` : ""}</span><small>{entry.actor} · {new Date(entry.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small></li>)}</ul></details>}
    </article>
  );
}

function renderLocalOrders(readPage: AdminOrdersReadPage, persistent = false) {
  const { query } = readPage;
  return (
    <main className={`${styles.fusionAdminShell} ${styles.fusionAdminOrdersPage}`}>
      <header className="admin-header">
        <div><p className="eyebrow">{brandName} · Local operations</p><h1>Orders</h1><p>{readPage.sourceNotice} — {persistent ? "canonical local commerce Orders and immutable purchase facts." : "synthetic orders are read-only and reset with the development process."}</p></div>
        <div className="admin-header-actions"><div className="admin-header-links"><Link className="admin-back-link" href={ordersExportPath(query)}>Export CSV ↓</Link><Link className="admin-back-link" href="/admin/products">Products</Link><Link className="admin-back-link" href="/">Back to storefront ↗</Link></div><AdminLogoutButton /></div>
      </header>
      <form className="admin-filters" method="get" aria-label="Filter local orders">
        <label><span>Search</span><input name="q" defaultValue={query.q} placeholder="Order reference or display email" /></label>
        <label><span>Fulfillment</span><select name="fulfillment" defaultValue={query.fulfillment}><option value="">All fulfillment</option>{fulfillmentFilters.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label><span>Payment</span><select name="payment" defaultValue={query.payment}><option value="">All payment</option>{paymentFilters.slice(1).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="admin-attention-filter"><input type="checkbox" name="attention" value="1" defaultChecked={query.attentionOnly} /><span>Needs attention</span></label>
        <button type="submit">Apply filters</button>
        {(query.q || query.fulfillment || query.payment || query.attentionOnly) && <Link className="admin-filter-reset" href="/admin/orders">Clear</Link>}
      </form>
      <p className="admin-state">{readPage.sourceNotice} · No capability, session hash, private Storage locator, signed URL, or provider secret is exposed.</p>
      {readPage.totalCount > 0 && <div className="admin-results-summary">Showing {(readPage.page - 1) * readPage.pageSize + 1}–{Math.min(readPage.page * readPage.pageSize, readPage.totalCount)} of {readPage.totalCount} {persistent ? "persistent" : "synthetic"} orders</div>}
      {readPage.items.length === 0 ? <div className="admin-state">{query.q || query.fulfillment || query.payment || query.attentionOnly ? "No matching local orders." : "No local orders yet."}</div> : <section className="admin-orders" aria-label={persistent ? "Local persistent orders list" : "Local synthetic orders list"}>{readPage.items.map((order) => <LocalOrderCard key={order.id} order={order} persistent={persistent} />)}</section>}
      {readPage.totalPages > 1 && <nav className="admin-pagination" aria-label="Local orders pagination"><span>Page {readPage.page} of {readPage.totalPages}</span><div>{readPage.hasPreviousPage && <Link href={ordersPath({ ...query, page: readPage.page - 1 })}>Previous</Link>}{readPage.hasNextPage && <Link href={ordersPath({ ...query, page: readPage.page + 1 })}>Next</Link>}</div></nav>}
      <p className="admin-warning">{persistent ? "Local persistent commerce is development/test only. Unadapted controls fail closed; Supplier remains unsupported." : "Local Orders is a bounded read-only demo seam. Fulfillment, Tracking, photo review, digital delivery, cleanup, and Order mutations are unavailable."}</p>
    </main>
  );
}

type ProductionAdminOrdersPageData = {
  readonly orders: readonly Order[];
  readonly totalOrders: number;
  readonly error: unknown;
};

async function loadProductionAdminOrdersPage(query: AdminOrdersQuery): Promise<ProductionAdminOrdersPageData> {
  const queryText = query.q;
  const fulfillmentFilter = query.fulfillment;
  const paymentFilter = query.payment;
  const attentionFilter = query.attentionOnly;
  const currentPage = query.page;

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
  const primaryResult = await ordersQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
  let data = primaryResult.data as Order[] | null;
  let count = primaryResult.count;
  let error = primaryResult.error;
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
    const fallbackResult = await fallbackQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    data = (fallbackResult.data ?? []).map((order) => ({ ...order, order_status_logs: [] })) as Order[];
    count = fallbackResult.count;
    error = fallbackResult.error;
    if (error) console.error("Core admin order query failed.", error);
  }
  const rawOrders = (data ?? []) as Order[];
  const { bucket } = readUploadConfig();
  const orders = await Promise.all(rawOrders.map(async (order) => ({
    ...order,
    order_items: await Promise.all((order.order_items ?? []).map(async (item) => {
      if (!item.customization?.photoPath) return item;
      const { data: signed } = await getSupabaseServerClient().storage.from(bucket).createSignedUrl(item.customization.photoPath, 60 * 15);
      return { ...item, photoPreviewUrl: signed?.signedUrl ?? null };
    })),
  })));

  return { orders, totalOrders: count ?? 0, error };
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const cookieStore = await cookies();
  if (!(await isValidAdminSession(cookieStore.get(getSessionCookieName())?.value))) redirect("/admin/login");
  const params = await searchParams;
  const composition = await loadAdminOrdersPageAfterAuthorization({
    q: params?.q,
    fulfillment: params?.fulfillment,
    payment: params?.payment,
    attention: params?.attention,
    page: params?.page,
  }, {
    resolveSource: resolveAdminOrdersReadSource,
    loadProduction: loadProductionAdminOrdersPage,
  });
  if (composition.status === "invalid_configuration") return localOrdersUnavailable("Local Orders configuration is invalid.");
  if (composition.status === "unavailable") return localOrdersUnavailable("Orders are temporarily unavailable.");
  if (composition.status === "source_failure") return localOrdersUnavailable(composition.source === "local_fake" ? "Local Orders are temporarily unavailable." : "Orders are temporarily unavailable.");
  if (composition.status === "local_fake") {
    if (composition.value.totalCount > 0 && composition.value.page > composition.value.totalPages) {
      redirect(ordersPath({ ...composition.value.query, page: composition.value.totalPages }));
    }
    return renderLocalOrders(composition.value);
  }
  if (composition.status === "local_persistent") {
    if (composition.value.totalCount > 0 && composition.value.page > composition.value.totalPages) {
      redirect(ordersPath({ ...composition.value.query, page: composition.value.totalPages }));
    }
    return renderLocalOrders(composition.value, true);
  }

  const { query } = composition;
  const queryText = query.q;
  const fulfillmentFilter = query.fulfillment;
  const paymentFilter = query.payment;
  const attentionFilter = query.attentionOnly;
  const currentPage = query.page;
  const { orders, totalOrders, error } = composition.value;
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
  return (
    <main className={`${styles.fusionAdminShell} ${styles.fusionAdminOrdersPage}`}>
      <header className="admin-header">
        <div><p className="eyebrow">{brandName} · Local operations</p><h1>Orders</h1><p>Review paid orders and the customization details before production.</p></div>
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
