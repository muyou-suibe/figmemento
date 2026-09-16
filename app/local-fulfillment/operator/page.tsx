import { CatalogShell } from "../../storefront/CatalogShell";
import { LocalFulfillmentOperatorTool } from "../../storefront/LocalFulfillmentOperatorTool";
import { readTrustedLocalFulfillmentConfig } from "../../config/local-fulfillment-runtime.ts";
import styles from "../../storefront/catalog-storefront.module.css";

export const metadata = { title: "Local Fulfillment Operator | FigMemento" };

export default function LocalFulfillmentOperatorPage() {
  let runtimeEnabled = false;
  try {
    const configuration = readTrustedLocalFulfillmentConfig();
    runtimeEnabled = configuration.source === "local_fake" && ["development", "test"].includes(configuration.runtimeMode);
  } catch {
    runtimeEnabled = false;
  }
  return <CatalogShell><main className={`${styles.main} ${styles.fusionFulfillmentPage}`} id="main-content"><LocalFulfillmentOperatorTool runtimeEnabled={runtimeEnabled} /></main></CatalogShell>;
}
