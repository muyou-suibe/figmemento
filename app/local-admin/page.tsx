import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName, isValidAdminSession } from "../lib/admin-auth";
import { getSharedLocalNotificationOutbox } from "../server/local-notification-runtime.server.ts";
import { getSharedLocalAnalyticsRepository } from "../server/local-analytics-runtime.server.ts";
import { brandName } from "../config/identity.ts";
import styles from "../admin/products/admin-products.module.css";

export const dynamic = "force-dynamic";

const links = [
  ["Orders", "/admin/orders"],
  ["Products", "/admin/products"],
  ["Customers", "/account"],
  ["Promotions", "/checkout"],
  ["Points", "/account/points"],
  ["Reviews", "/product/temporary-tattoo#local-reviews-heading"],
  ["Contact Messages", "/contact#contact-message"],
  ["Newsletter", "/#home-newsletter-title"],
  ["Notifications", "/local-admin#notifications"],
  ["Fulfillment", "/local-fulfillment/operator"],
  ["Suppliers", "/local-suppliers/operator"],
  ["Warehouse", "/local-suppliers/operator#warehouse-heading"],
  ["Tracking", "/local-tracking/operator"],
  ["Analytics", "/local-admin#analytics"],
] as const;

export default async function LocalAdminPage() {
  const cookieStore = await cookies();
  if (!(await isValidAdminSession(cookieStore.get(getSessionCookieName())?.value))) redirect("/admin/login");
  const notifications = getSharedLocalNotificationOutbox().list();
  const analytics = getSharedLocalAnalyticsRepository().list();

  return (
    <main className={styles.fusionAdminShell}>
      <header className="admin-header">
        <div>
          <p className="eyebrow">{brandName} · Local V1</p>
          <h1>Local Admin</h1>
          <p>Development/test operations index. No production data or provider delivery.</p>
        </div>
        <Link className="admin-back-link" href="/admin/orders">Open existing Admin</Link>
      </header>
      <nav className="admin-header-links" aria-label="Local admin navigation">
        {links.map(([label, href]) => <Link className="admin-back-link" href={href} key={href}>{label}</Link>)}
      </nav>
      <section className="admin-state" id="notifications">
        <h2>Notifications</h2>
        <p>Queued locally: {notifications.length}. Status is always <strong>queued_local</strong>; no email has been sent.</p>
        {notifications.length === 0 ? <p>No local notification intents yet.</p> : (
          <ul>{notifications.map((message) => <li key={message.id}><strong>{message.type}</strong> · {message.recipient} · {message.reference ?? "no reference"} · {new Date(message.createdAt).toLocaleString()}</li>)}</ul>
        )}
      </section>
      <section className="admin-state" id="analytics">
        <h2>Analytics</h2>
        <p>Provider-neutral local event log: {analytics.length}. No GA4, Meta, TikTok, or other remote analytics provider is connected.</p>
        {analytics.length === 0 ? <p>No local events yet.</p> : (
          <ul>{analytics.slice(0, 20).map((event) => <li key={event.id}><strong>{event.eventName}</strong> · {event.productId ?? event.orderReference ?? "site"} · {new Date(event.occurredAt).toLocaleString()}</li>)}</ul>
        )}
      </section>
      <p className="admin-warning">Customers, Promotions, Points, Reviews, Contact, Newsletter, Warehouse, Shipments, and Analytics remain local capability surfaces; external activation is not claimed.</p>
    </main>
  );
}
