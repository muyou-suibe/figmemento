import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminCatalogQueryBoundary } from "../../application/admin-catalog-boundary.ts";
import { getSessionCookieName } from "../../lib/admin-auth.ts";
import { ExistingAdminSessionVerifier } from "../../server/admin-catalog-session.server.ts";
import {
  createAdminCatalogReader,
} from "../../server/admin-catalog-source.server.ts";
import { readAdminCatalogSourceConfiguration } from "../../server/admin-source-resolution.server.ts";
import { AdminLogoutButton } from "../AdminLogoutButton";
import { AdminCatalogEditor } from "./AdminCatalogEditor";
import { brandName } from "../../config/identity.ts";
import styles from "./admin-products.module.css";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const cookieStore = await cookies();
  const boundary = new AdminCatalogQueryBoundary(
    new ExistingAdminSessionVerifier(cookieStore.get(getSessionCookieName())?.value),
    createAdminCatalogReader,
  );
  const result = await boundary.execute({});
  if (result.status === "unauthorized" || result.status === "authentication_failure") {
    redirect("/admin/login");
  }

  return <main className={`${styles.fusionAdminShell} ${styles.fusionAdminProducts}`}>
    <header className="admin-header">
      <div><p className="eyebrow">{brandName} · Catalog administration</p><h1>Products</h1><p>Edit Product content, Option/Variant graph, public Asset metadata, and basic Product fulfillment configuration. Lifecycle remains a separate protected workflow.</p></div>
      <div className="admin-header-actions"><div className="admin-header-links"><Link className="admin-back-link" href="/admin/orders">Orders</Link><Link className="admin-back-link" href="/shop">View shop ↗</Link></div><AdminLogoutButton /></div>
    </header>
    {readAdminCatalogSourceConfiguration().status === "local_fake" && <p className="admin-state">LOCAL / TEST ONLY — Catalog edits are process-memory only and reset when the development process restarts.</p>}
    {result.status === "found"
      ? <AdminCatalogEditor categories={result.value.categories} products={result.value.products} options={result.value.options} optionValues={result.value.optionValues} variants={result.value.variants} assets={result.value.assets} fulfillmentConfigs={result.value.fulfillmentConfigs} />
      : result.status === "invalid_configuration"
        ? <section className="admin-state admin-error">Catalog administration configuration is invalid.</section>
        : <section className="admin-state admin-error">Catalog administration is unavailable. The production C1 schema must be deployed through the approved migration workflow before this page can be used.</section>}
  </main>;
}
