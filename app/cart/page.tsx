import type { Metadata } from "next";
import { CatalogShell } from "../storefront/CatalogShell";
import { CartExperience } from "../storefront/CartExperience";
import styles from "../storefront/catalog-storefront.module.css";

export const metadata: Metadata = { title: "Cart | FigMemento" };

export default function CartPage() {
  return <CatalogShell><main className={`${styles.main} ${styles.fusionCartPage}`} id="main-content"><CartExperience /></main></CatalogShell>;
}
