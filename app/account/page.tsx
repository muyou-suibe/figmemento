import Link from "next/link";
import { cookies } from "next/headers";
import { CatalogShell } from "../storefront/CatalogShell.tsx";
import { customerAuthCookieName } from "../server/customer-auth-http.server.ts";
import { getCustomerAuthRuntime } from "../server/customer-auth-runtime.server.ts";
import { CustomerSignOutButton } from "./CustomerAuthForm.tsx";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";
import { getSharedLocalOrderAccountReadPort } from "../server/local-order-runtime.server.ts";
import { getSharedCustomerPointsAccountReadPort } from "../server/customer-points-runtime.server.ts";
import styles from "./account.module.css";

async function readAccountSession() {
  try {
    const runtime = getCustomerAuthRuntime();
    const cookieStore = await cookies();
    const result = await runtime.provider.getSession(cookieStore.get(customerAuthCookieName)?.value ?? null);
    if (result.status === "error") return { state: "disabled" as const };
    return result.value.authenticated
      ? {
          state: "authenticated" as const,
          session: result.value,
          orders: getSharedLocalOrderAccountReadPort().findSnapshotsForCustomer(result.value.customer.id),
          points: getSharedCustomerPointsAccountReadPort().getSummary(result.value.customer.id),
        }
      : { state: "signed_out" as const };
  } catch {
    return { state: "disabled" as const };
  }
}

export default async function AccountPage() {
  const account = await readAccountSession();
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content">
        <section className={styles.panel} aria-labelledby="account-title">
          <p className={styles.eyebrow}>FigMemento · <ReferenceText>Account</ReferenceText></p>
          <h1 className={styles.title} id="account-title">
            {account.state === "authenticated" ? <><ReferenceText>Your</ReferenceText> <em><ReferenceText>account</ReferenceText></em></> : <><ReferenceText>A quiet place for your</ReferenceText> <em><ReferenceText>account</ReferenceText></em></>}
          </h1>
          {account.state === "authenticated" ? (
            <>
              <p className={styles.intro}><ReferenceText>You are signed in with this customer email:</ReferenceText></p>
              <p className={styles.identity}>{account.session.customer.email}</p>
              <div className={styles.accountCards}>
                <Link className={styles.accountCard} href="/account/orders"><strong>{account.orders.length}</strong><span><ReferenceText>Local orders</ReferenceText></span></Link>
                <Link className={styles.accountCard} href="/account/points"><strong>{account.points.balance}</strong><span><ReferenceText>Points balance</ReferenceText></span></Link>
              </div>
              <div className={styles.actions}>
                <Link className={styles.secondaryLink} href="/account/orders"><ReferenceText>View order history</ReferenceText></Link>
                <Link className={styles.secondaryLink} href="/account/points"><ReferenceText>View points</ReferenceText></Link>
              </div>
              <div className={styles.actions}><CustomerSignOutButton /></div>
            </>
          ) : account.state === "disabled" ? (
            <>
              <p className={styles.intro}><ReferenceText>Customer accounts are not enabled in this environment.</ReferenceText></p>
              <p className={styles.disabledNote} role="status"><ReferenceText>Account sign-in is available only when the approved local development provider is enabled.</ReferenceText></p>
            </>
          ) : (
            <>
              <p className={styles.intro}><ReferenceText>Sign in to keep your account identity ready for future FigMemento account features.</ReferenceText></p>
              <div className={styles.actions}>
                <Link className={styles.primaryLink} href="/account/sign-in"><ReferenceText>Sign in</ReferenceText></Link>
                <Link className={styles.secondaryLink} href="/account/sign-up"><ReferenceText>Create account</ReferenceText></Link>
              </div>
            </>
          )}
          <p className={styles.footerNote}><ReferenceText>Local development account only. Orders are associated server-side when you are signed in; guest checkout remains available.</ReferenceText></p>
        </section>
      </main>
    </CatalogShell>
  );
}
