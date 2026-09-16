import type { Metadata } from "next";
import { CatalogShell } from "../../../storefront/CatalogShell";
import { LocalOrderSuccessExperience } from "../../../storefront/LocalOrderSuccessExperience";
import { readTrustedLocalPaymentConfig } from "../../../config/local-payment-runtime.ts";
import { isLocalPersistentPageCapabilityReady } from "../../../server/local-persistent-page-capability.server.ts";
import styles from "../../../storefront/catalog-storefront.module.css";

export const metadata: Metadata = { title: "Local Order | FigMemento" };

interface LocalOrderSuccessPageProps {
  params: Promise<{ reference: string }>;
}

export default async function LocalOrderSuccessPage({ params }: LocalOrderSuccessPageProps) {
  const { reference } = await params;
  let localPaymentEnabled = false;
  try {
    const config = readTrustedLocalPaymentConfig();
    localPaymentEnabled = config.source === "local_fake" || config.source === "local_persistent"
      && isLocalPersistentPageCapabilityReady(config.runtimeMode, "payment");
  } catch {
    localPaymentEnabled = false;
  }
  return <CatalogShell><main className={`${styles.main} ${styles.fusionOrderPage}`} id="main-content"><LocalOrderSuccessExperience publicReference={reference} localPaymentEnabled={localPaymentEnabled} /></main></CatalogShell>;
}
