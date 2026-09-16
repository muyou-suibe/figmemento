import Link from "next/link";
import { cookies } from "next/headers";
import { CatalogShell } from "../../storefront/CatalogShell.tsx";
import { customerAuthCookieName } from "../../server/customer-auth-http.server.ts";
import { getCustomerAuthRuntime } from "../../server/customer-auth-runtime.server.ts";
import { getSharedCustomerPointsAccountReadPort } from "../../server/customer-points-runtime.server.ts";
import styles from "../account.module.css";
import { ReferenceDate, ReferenceText } from "../../storefront/ReferenceLanguageProvider";

export default async function AccountPointsPage() {
  let summary = null as ReturnType<ReturnType<typeof getSharedCustomerPointsAccountReadPort>["getSummary"]> | null;
  try {
    const session = await getCustomerAuthRuntime().provider.getSession((await cookies()).get(customerAuthCookieName)?.value ?? null);
    if (session.status === "ok" && session.value.authenticated) summary = getSharedCustomerPointsAccountReadPort().getSummary(session.value.customer.id);
  } catch {
    summary = null;
  }
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content">
        <section className={styles.panel} aria-labelledby="points-title">
          <p className={styles.eyebrow}>FigMemento · <ReferenceText>Account</ReferenceText></p>
          <h1 className={styles.title} id="points-title"><ReferenceText>Your</ReferenceText> <em><ReferenceText>points</ReferenceText></em></h1>
          {summary === null ? <><p className={styles.intro}><ReferenceText>Sign in to view your local points ledger.</ReferenceText></p><Link className={styles.primaryLink} href="/account/sign-in"><ReferenceText>Sign in</ReferenceText></Link></> : <><div className={styles.pointsBalance}><strong>{summary.balance}</strong><span><ReferenceText>points available</ReferenceText></span></div><p className={styles.intro}><ReferenceText>{summary.conversion}</ReferenceText>. <ReferenceText>Local V1 redemption is capped at</ReferenceText> {summary.maxRedemptionPercent}% <ReferenceText>of eligible order value.</ReferenceText></p>{summary.ledger.length === 0 ? <p className={styles.status} role="status"><ReferenceText>Complete a successful local order to earn points.</ReferenceText></p> : <div className={styles.orderList}>{summary.ledger.map((entry) => <article className={styles.orderCard} key={entry.id}><div><strong><ReferenceText>{entry.reason === "purchase_earned" ? "Purchase earned" : "Order redemption"}</ReferenceText></strong><span>{entry.orderReference ?? <ReferenceText>Local account</ReferenceText>}</span><span><ReferenceDate value={entry.createdAt} /></span></div><strong>{entry.delta > 0 ? "+" : ""}{entry.delta}</strong></article>)}</div>}</>}
          <p className={styles.footerNote}><ReferenceText>Development/test ledger only. It is process-memory and is cleared when the server restarts.</ReferenceText></p>
          <div className={styles.actions}><Link className={styles.secondaryLink} href="/account"><ReferenceText>Back to Account</ReferenceText></Link><Link className={styles.secondaryLink} href="/shop"><ReferenceText>Continue shopping</ReferenceText></Link></div>
        </section>
      </main>
    </CatalogShell>
  );
}
