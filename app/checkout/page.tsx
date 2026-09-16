import type { Metadata } from "next";
import { CatalogShell } from "../storefront/CatalogShell";
import { LocalCheckoutExperience } from "../storefront/LocalCheckoutExperience";
import { readTrustedLocalOrderConfig } from "../config/local-order-runtime.ts";
import { isLocalPersistentPageCapabilityReady } from "../server/local-persistent-page-capability.server.ts";
import styles from "../storefront/catalog-storefront.module.css";

export const metadata: Metadata = { title: "Local Checkout Review | FigMemento" };

export default function CheckoutPage() {
  let localOrderEnabled = false;
  try {
    const config = readTrustedLocalOrderConfig();
    localOrderEnabled = config.source === "local_fake" || config.source === "local_persistent"
      && isLocalPersistentPageCapabilityReady(config.runtimeMode, "order");
  } catch {
    localOrderEnabled = false;
  }
  return <CatalogShell><main className={`${styles.main} ${styles.fusionCheckoutPage}`} id="main-content"><LocalCheckoutExperience localOrderEnabled={localOrderEnabled} /></main></CatalogShell>;
}
