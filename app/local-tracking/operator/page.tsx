import { CatalogShell } from "../../storefront/CatalogShell";
import { LocalTrackingOperatorTool } from "../../storefront/LocalTrackingExperience";
import { readTrustedLocalTrackingConfig } from "../../config/local-tracking-runtime.ts";
import styles from "../../storefront/catalog-storefront.module.css";

export const metadata = { title: "Local Tracking Operator | FigMemento" };
export default function LocalTrackingOperatorPage() {
  let runtimeEnabled = false;
  try { const config = readTrustedLocalTrackingConfig(); runtimeEnabled = config.source === "local_fake" && ["development", "test"].includes(config.runtimeMode); } catch { runtimeEnabled = false; }
  return <CatalogShell><main className={`${styles.main} ${styles.fusionTrackingPage}`} id="main-content"><LocalTrackingOperatorTool runtimeEnabled={runtimeEnabled} /></main></CatalogShell>;
}
