import { CatalogShell } from "../storefront/CatalogShell";
import { AboutEditorial } from "../storefront/ReferenceEditorial";
import { createServerCatalogRepository } from "../infrastructure/catalog/server-catalog-repository";

export default async function AboutPage() {
  const source = await createServerCatalogRepository();
  const categories = source.status === "found" ? await source.value.repository.listPublicCategories() : undefined;
  return <CatalogShell page="editorial-reference" categoryLinks={categories?.status === "found" ? categories.value : []}><AboutEditorial /></CatalogShell>;
}
