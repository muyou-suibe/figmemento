import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { composeAdminSettingsProjection } from "../../application/admin-settings-boundary.server.ts";
import { readAdminAcceptanceConfiguration } from "../../config/admin-acceptance-runtime.server.ts";
import { composeServerRuntimeConfiguration, resolveCanonicalLocalCommerceCapability } from "../../config/server-runtime-composition.server.ts";
import { getSessionCookieName } from "../../lib/admin-auth.ts";
import { ExistingAdminSessionVerifier } from "../../server/admin-catalog-session.server.ts";
import { createLocalPersistentAdminSettingsRepository } from "../../infrastructure/local-commerce/local-persistent-admin-settings-repository.server.ts";
import { AdminLogoutButton } from "../AdminLogoutButton";
import { brandName } from "../../config/identity.ts";
import styles from "../products/admin-products.module.css";
import { AdminSettingsEditor } from "./AdminSettingsEditor";
import { readLocalPersistentDigitalDeliveryPolicy } from "../../application/local-persistent-digital-delivery-policy.server.ts";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const cookieStore = await cookies();
  const authorization = await new ExistingAdminSessionVerifier(cookieStore.get(getSessionCookieName())?.value).verifyAdminSession();
  if (authorization.status !== "authorized") redirect("/admin/login");

  const environment = process.env;
  const source = readAdminAcceptanceConfiguration(environment, environment.NODE_ENV);
  const runtime = composeServerRuntimeConfiguration(environment);
  let projection = null;
  if (source.status === "local_persistent" && resolveCanonicalLocalCommerceCapability("admin", environment) === "selected" && runtime.status === "ready") {
    const repositoryResult = await createLocalPersistentAdminSettingsRepository(environment);
    if (repositoryResult.status === "ready") {
      const settings = await repositoryResult.repository.read();
      if (settings.status === "found") {
        projection = composeAdminSettingsProjection(settings.value, {
          brandName: runtime.value.public.brandName,
          siteOrigin: runtime.value.public.siteUrl,
          deploymentEnvironment: runtime.value.public.deploymentEnvironment,
          providerActivation: runtime.value.providers.activation,
          digitalDeliveryPolicy: readLocalPersistentDigitalDeliveryPolicy(),
        });
      }
    }
  }

  return <main className={`${styles.fusionAdminShell} ${styles.fusionAdminProducts}`}>
    <header className="admin-header">
      <div><p className="eyebrow">{brandName} · Restricted settings</p><h1>Settings</h1><p>Update the one approved customer-facing setting. Runtime and provider information below is informational only.</p></div>
      <div className="admin-header-actions"><div className="admin-header-links"><Link className="admin-back-link" href="/admin/orders">Orders</Link><Link className="admin-back-link" href="/admin/products">Products</Link><Link className="admin-back-link" href="/">View storefront ↗</Link></div><AdminLogoutButton /></div>
    </header>
    {projection
      ? <section className={`${styles.fusionAdminWorkspace} ${styles.settingsWorkspace}`}><AdminSettingsEditor initial={projection} /></section>
      : <section className={`${styles.fusionAdminWorkspace} ${styles.settingsWorkspace}`}><div className="admin-state admin-error" role="status">Restricted settings are unavailable in this runtime. No fallback settings source is used.</div></section>}
  </main>;
}
