import Link from "next/link";
import { CatalogShell } from "../../storefront/CatalogShell.tsx";
import { getCustomerAuthRuntime } from "../../server/customer-auth-runtime.server.ts";
import { CustomerAuthForm } from "../CustomerAuthForm.tsx";
import styles from "../account.module.css";
import { ReferenceText } from "../../storefront/ReferenceLanguageProvider";

function isLocalAuthEnabled(): boolean {
  try { return getCustomerAuthRuntime().source === "local_fake"; } catch { return false; }
}

export default function CustomerSignInPage() {
  const enabled = isLocalAuthEnabled();
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content">
        <section className={styles.panel} aria-labelledby="sign-in-title">
          <p className={styles.eyebrow}>FigMemento · <ReferenceText>Account</ReferenceText></p>
          <h1 className={styles.title} id="sign-in-title"><ReferenceText>Welcome</ReferenceText> <em><ReferenceText>back</ReferenceText></em></h1>
          <p className={styles.intro}>{enabled ? <ReferenceText>Use your local development account to continue.</ReferenceText> : <ReferenceText>Customer accounts are not enabled in this environment.</ReferenceText>}</p>
          {enabled ? <CustomerAuthForm mode="sign-in" /> : <p className={styles.disabledNote} role="status"><ReferenceText>Enable the development-only local customer provider to exercise sign-in.</ReferenceText></p>}
          <div className={styles.actions}>
            <Link className={styles.secondaryLink} href="/account"><ReferenceText>Back to Account</ReferenceText></Link>
            {enabled && <Link className={styles.secondaryLink} href="/account/sign-up"><ReferenceText>Create account</ReferenceText></Link>}
          </div>
        </section>
      </main>
    </CatalogShell>
  );
}
