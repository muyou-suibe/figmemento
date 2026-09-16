import type { Metadata } from "next";
import { brandName } from "../config/identity.ts";
import { buildShopMetadataModel } from "../application/catalog-seo";
import { loadPublicShopPage } from "../application/catalog-pages";
import { getSeoPolicy } from "../config/seo-policy.ts";
import { CatalogBrowser } from "../storefront/CatalogBrowser";
import { CatalogCategoryGuide } from "../storefront/CatalogDiscovery";
import { CatalogShell, FixtureCatalogNotice } from "../storefront/CatalogShell";
import { CatalogStatus } from "../storefront/CatalogStatus";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";
import { toNextCatalogMetadata } from "../storefront/catalog-metadata";
import styles from "../storefront/catalog-storefront.module.css";
import { createServerCatalogRepository } from "../infrastructure/catalog/server-catalog-repository";

export const metadata: Metadata = toNextCatalogMetadata(
  buildShopMetadataModel({ brandName, siteUrl: getSeoPolicy().canonicalOrigin }),
);

export default async function ShopPage() {
  const source = await createServerCatalogRepository();
  if (source.status !== "found") return <CatalogStatus kind="source_failure" />;

  const catalog = await loadPublicShopPage(source.value.repository);
  if (catalog.status !== "found") {
    return <CatalogStatus kind={catalog.status === "invalid_configuration" ? "invalid_configuration" : "source_failure"} />;
  }

  return (
    <CatalogShell categoryLinks={catalog.value.categories} page="shop-reference">
      <main className={`${styles.discoveryShopPage} ${styles.referenceShopPage}`} id="main-content">
        <section className={styles.referenceShopMasthead}>
          <p className={styles.referenceShopKicker}><ReferenceText>Vol. I · August 2026 · Twenty-one keepsakes</ReferenceText></p>
          <h1><ReferenceText>THE SHOP</ReferenceText></h1>
          <p className={styles.referenceShopIntro}><ReferenceText>Every piece begins with a photograph of someone you love</ReferenceText></p>
          <div className={styles.referenceShopMeta}><span><ReferenceText>Est. 2025</ReferenceText></span><span>◆</span><span><ReferenceText>Worldwide delivery</ReferenceText></span><span>◆</span><span><ReferenceText>Handcrafted</ReferenceText></span></div>
        </section>
        {source.value.source === "fixture" && <div className={styles.referenceShopFixtureNotice}><FixtureCatalogNotice /></div>}
        <CatalogBrowser referenceShop categories={catalog.value.categories} products={catalog.value.products} />
        <CatalogCategoryGuide reference categories={catalog.value.categories} products={catalog.value.products} />
        <section className={styles.referenceShopPromo}>
          <strong><ReferenceText>Spend $69</ReferenceText></strong>
          <span><ReferenceText>ship the world, on us</ReferenceText></span>
          <p><ReferenceText>Free worldwide shipping on orders over $69 — because a keepsake shouldn&apos;t cost extra to reach the person it belongs to.</ReferenceText></p>
          <a className={styles.referenceShopPromoAction} href="/shop"><ReferenceText>Start an order</ReferenceText></a>
        </section>
      </main>
    </CatalogShell>
  );
}
