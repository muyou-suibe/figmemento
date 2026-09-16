import { CatalogShell } from "../../storefront/CatalogShell";
import { LocalSupplierOperatorTool } from "../../storefront/LocalSupplierOperatorTool";
import { readTrustedLocalSupplierConfig } from "../../config/local-supplier-runtime.ts";
import styles from "../../storefront/catalog-storefront.module.css";

export const metadata = { title: "Local Supplier Operations | FigMemento" };

export default function LocalSupplierOperatorPage() {
  let runtimeEnabled = false;
  try {
    const configuration = readTrustedLocalSupplierConfig();
    runtimeEnabled = configuration.source === "local_fake"
      && ["development", "test"].includes(configuration.runtimeMode);
  } catch {
    runtimeEnabled = false;
  }
  return (
    <CatalogShell>
      <main className={`${styles.main} ${styles.supplierOperatorPage}`} id="main-content">
        <LocalSupplierOperatorTool runtimeEnabled={runtimeEnabled} />
      </main>
    </CatalogShell>
  );
}
