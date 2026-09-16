import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brandName } from "../../config/identity.ts";
import { buildCategoryMetadataModel } from "../../application/catalog-seo";
import { loadPublicCategoryPage } from "../../application/catalog-pages";
import { getSeoPolicy } from "../../config/seo-policy.ts";
import { CatalogShell, FixtureCatalogNotice } from "../../storefront/CatalogShell";
import { CatalogStatus } from "../../storefront/CatalogStatus";
import styles from "../../storefront/catalog-storefront.module.css";
import { createServerCatalogRepository } from "../../infrastructure/catalog/server-catalog-repository";
import { toNextCatalogMetadata, unavailableCatalogMetadata } from "../../storefront/catalog-metadata";
import { ReferenceCategoryComposition } from "../../storefront/ReferenceCategoryComposition";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = await createServerCatalogRepository();
  if (source.status !== "found") return unavailableCatalogMetadata;
  const result = await loadPublicCategoryPage(source.value.repository, slug);
  if (result.status !== "found") return unavailableCatalogMetadata;
  return toNextCatalogMetadata(buildCategoryMetadataModel(result.value.category, {
    brandName,
    siteUrl: getSeoPolicy().canonicalOrigin,
  }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const source = await createServerCatalogRepository();
  if (source.status !== "found") return <CatalogStatus kind="source_failure" />;

  const result = await loadPublicCategoryPage(source.value.repository, slug);
  if (result.status === "not_found") notFound();
  if (result.status !== "found") {
    return <CatalogStatus kind={result.status === "invalid_configuration" ? "invalid_configuration" : "source_failure"} />;
  }
  const { category, categories, products } = result.value;

  return (
    <CatalogShell page="category-reference" categoryLinks={categories}>
      <main className={styles.discoveryCategoryPage} id="main-content">
        {source.value.source === "fixture" && <FixtureCatalogNotice />}
        <ReferenceCategoryComposition slug={slug} category={category} products={products} />
      </main>
    </CatalogShell>
  );
}
