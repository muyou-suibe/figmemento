import Link from "next/link";
import { cookies } from "next/headers";
import { CatalogShell } from "../../storefront/CatalogShell.tsx";
import { customerAuthCookieName } from "../../server/customer-auth-http.server.ts";
import { getCustomerAuthRuntime } from "../../server/customer-auth-runtime.server.ts";
import { getSharedLocalOrderAccountReadPort } from "../../server/local-order-runtime.server.ts";
import { formatCurrencyCents } from "../../application/catalog-storefront.ts";
import { ReferenceDate, ReferenceText } from "../../storefront/ReferenceLanguageProvider";
import styles from "../account.module.css";

function orderStatusLabel(status: string): string {
  return ({ pending_payment: "Pending", payment_failed: "Failed", paid: "Paid" } as Record<string, string>)[status] ?? status;
}

function paymentStatusLabel(status: string): string {
  return ({ pending: "Pending", failed: "Failed", succeeded: "Succeeded" } as Record<string, string>)[status] ?? status;
}

export default async function AccountOrdersPage() {
  let orders = null as ReturnType<ReturnType<typeof getSharedLocalOrderAccountReadPort>["findSnapshotsForCustomer"]> | null;
  let email: string | null = null;
  try {
    const session = await getCustomerAuthRuntime().provider.getSession((await cookies()).get(customerAuthCookieName)?.value ?? null);
    if (session.status === "ok" && session.value.authenticated) {
      email = session.value.customer.email;
      orders = getSharedLocalOrderAccountReadPort().findSnapshotsForCustomer(session.value.customer.id);
    }
  } catch {
    orders = null;
  }
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content">
        <section className={styles.panel} aria-labelledby="orders-title">
          <p className={styles.eyebrow}>FigMemento · <ReferenceText>Account</ReferenceText></p>
          <h1 className={styles.title} id="orders-title"><ReferenceText>Your</ReferenceText> <em><ReferenceText>orders</ReferenceText></em></h1>
          {orders === null ? <><p className={styles.intro}><ReferenceText>Sign in to view the Local Orders owned by this account.</ReferenceText></p><Link className={styles.primaryLink} href="/account/sign-in"><ReferenceText>Sign in</ReferenceText></Link></> : <>
            <p className={styles.intro}><ReferenceText>Signed in as</ReferenceText> {email}. <ReferenceText>This is a development/test order history.</ReferenceText></p>
            {orders.length === 0 ? <p className={styles.status} role="status"><ReferenceText>No account-owned Local Orders yet. Guest Orders are not silently attached.</ReferenceText></p> : <div className={styles.orderList}>{orders.map((order) => <article className={styles.orderCard} key={order.internalId}><div><strong>{order.publicReference}</strong><span><ReferenceText>{orderStatusLabel(order.status)}</ReferenceText> · <ReferenceText>{paymentStatusLabel(order.paymentStatus)}</ReferenceText></span><span><ReferenceDate value={order.createdAt} /></span></div><strong>{formatCurrencyCents(order.commercial.localArithmeticTotalCents, order.commercial.currency)}</strong></article>)}</div>}
          </>}
          <div className={styles.actions}><Link className={styles.secondaryLink} href="/account"><ReferenceText>Back to Account</ReferenceText></Link><Link className={styles.secondaryLink} href="/shop"><ReferenceText>Continue shopping</ReferenceText></Link></div>
        </section>
      </main>
    </CatalogShell>
  );
}
