import Link from "next/link";
import { CatalogShell } from "../../storefront/CatalogShell.tsx";
import { getCustomerAuthRuntime } from "../../server/customer-auth-runtime.server.ts";
import { CustomerAuthForm } from "../CustomerAuthForm.tsx";
import styles from "../account.module.css";
import { ReferenceText } from "../../storefront/ReferenceLanguageProvider";

function isLocalAuthEnabled(): boolean {
  try { return getCustomerAuthRuntime().source === "local_fake"; } catch { return false; }
}

export default function CustomerSignUpPage() {
  const enabled = isLocalAuthEnabled();
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content">
        <section className={styles.panel} aria-labelledby="sign-up-title">
          <p className={styles.eyebrow}>FigMemento · <ReferenceText>Account</ReferenceText></p>
          <h1 className={styles.title} id="sign-up-title"><ReferenceText>Make room for</ReferenceText> <em><ReferenceText>meaning</ReferenceText></em></h1>
          <p className={styles.intro}>{enabled ? <ReferenceText>Create a local development account with only an email and password.</ReferenceText> : <ReferenceText>Customer accounts are not enabled in this environment.</ReferenceText>}</p>
          {enabled ? (
            <>
              <CustomerAuthForm mode="sign-up" />
              <p className={styles.footerNote}><ReferenceText>Local development only. This account is kept in process memory and is cleared when the server restarts.</ReferenceText></p>
            </>
          ) : <p className={styles.disabledNote} role="status"><ReferenceText>Enable the development-only local customer provider to exercise sign-up.</ReferenceText></p>}
          <div className={styles.actions}>
            <Link className={styles.secondaryLink} href="/account"><ReferenceText>Back to Account</ReferenceText></Link>
            {enabled && <Link className={styles.secondaryLink} href="/account/sign-in"><ReferenceText>Sign in</ReferenceText></Link>}
          </div>
        </section>
      </main>
    </CatalogShell>
  );
}
