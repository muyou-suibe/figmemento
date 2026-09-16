import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toPublicProductAssetViews } from "../../application/catalog-assets";
import { loadPublicProductPage } from "../../application/catalog-pages";
import { buildProductMetadataModel } from "../../application/catalog-seo";
import { toPublicSelectorVariants } from "../../application/catalog-storefront";
import { loadPublicProductDetailWithCustomization } from "../../application/customization-product-detail";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment";
import { brandName } from "../../config/identity.ts";
import { getSeoPolicy } from "../../config/seo-policy.ts";
import { createServerCatalogRepository } from "../../infrastructure/catalog/server-catalog-repository";
import { createServerCustomizationFieldRepository } from "../../infrastructure/customization/server-customization-field-repository";
import { CatalogShell, FixtureCatalogNotice } from "../../storefront/CatalogShell";
import { CatalogStatus } from "../../storefront/CatalogStatus";
import { ProductDetailExperience } from "../../storefront/ProductDetailExperience";
import { toNextCatalogMetadata, unavailableCatalogMetadata } from "../../storefront/catalog-metadata";
import styles from "../../storefront/catalog-storefront.module.css";
import { ReferenceText } from "../../storefront/ReferenceLanguageProvider";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = await createServerCatalogRepository();
  if (source.status !== "found") return unavailableCatalogMetadata;
  const result = await loadPublicProductPage(source.value.repository, slug);
  if (result.status !== "found") return unavailableCatalogMetadata;
  return toNextCatalogMetadata(
    buildProductMetadataModel(result.value.product, result.value.assets, {
      brandName,
      siteUrl: getSeoPolicy().canonicalOrigin,
    }),
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const runtimeEnvironment = { ...process.env, ...createCatalogRuntimeEnvironment() };
  const source = await createServerCatalogRepository(runtimeEnvironment);
  if (source.status !== "found") return <CatalogStatus kind="source_failure" />;

  let customizationSource;
  try {
    customizationSource = createServerCustomizationFieldRepository(runtimeEnvironment);
  } catch {
    return <CatalogStatus kind="source_failure" />;
  }
  if (customizationSource.source !== source.value.source) return <CatalogStatus kind="source_failure" />;

  const result = await loadPublicProductDetailWithCustomization(
    source.value.repository,
    customizationSource.repository,
    slug,
  );
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") return <CatalogStatus kind="unavailable" />;
  if (result.status === "invalid_configuration") return <CatalogStatus kind="invalid_configuration" />;
  if (result.status === "source_failure") return <CatalogStatus kind="source_failure" />;
  if (result.status !== "found") return <CatalogStatus kind="source_failure" />;

  const detail = result.value.catalog;
  const leadTime = detail.fulfillment.leadTime;
  const leadTimeLabel = leadTime.minBusinessDays === leadTime.maxBusinessDays
    ? `${leadTime.minBusinessDays} business days`
    : `${leadTime.minBusinessDays}–${leadTime.maxBusinessDays} business days`;

  return (
    <CatalogShell categoryLinks={[detail.category]}>
      <main className={`${styles.main} ${styles.fusionPdpPage}`} id="main-content">
        <nav className={styles.breadcrumb} aria-labelledby="product-breadcrumb-label">
          <span id="product-breadcrumb-label" className={styles.visuallyHidden}><ReferenceText>Breadcrumb</ReferenceText></span>
          <Link href="/shop"><ReferenceText>Shop</ReferenceText></Link>
          <span aria-hidden="true">/</span>
          <Link href={`/category/${detail.category.slug}`}>{detail.category.name}</Link>
          <span aria-hidden="true">/</span>
          <span>{detail.product.name}</span>
        </nav>
        {source.value.source === "fixture" && <FixtureCatalogNotice />}
        <ProductDetailExperience
          productId={detail.product.id}
          productName={detail.product.name}
          productDescription={detail.product.description}
          categoryName={detail.category.name}
          listingPrice={detail.listingPrice}
          fulfillment={{
            fulfillmentType: humanize(detail.fulfillment.fulfillmentType),
            productionMode: humanize(detail.fulfillment.productionMode),
            leadTimeLabel,
            requiresShipping: detail.fulfillment.requiresShipping,
          }}
          options={detail.options}
          optionValues={detail.optionValues}
          variants={toPublicSelectorVariants(detail.variants)}
          assets={toPublicProductAssetViews(detail.product.id, detail.product.name, detail.assets)}
          customization={result.value.customization}
          persistentDraftEnabled={source.value.source === "local_persistent"}
        />
      </main>
    </CatalogShell>
  );
}
