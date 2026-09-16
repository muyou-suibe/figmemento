"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  parseProductFulfillmentConfig,
  type CatalogProduct,
  type FulfillmentType,
  type ProductFulfillmentConfig,
  type ProductionMode,
} from "../../domain/catalog/index.ts";
import styles from "./admin-products.module.css";

interface AdminProductFulfillmentEditorProps {
  product: CatalogProduct;
  config?: ProductFulfillmentConfig;
}

interface MutationIssue {
  path: string;
  message: string;
}

function newDraftId(): string {
  return `new:${globalThis.crypto.randomUUID()}`;
}

function mutationIssues(value: unknown): readonly MutationIssue[] {
  if (typeof value !== "object" || value === null || !("issues" in value) || !Array.isArray(value.issues)) {
    return [];
  }
  return value.issues.filter((issue): issue is MutationIssue => (
    typeof issue === "object"
    && issue !== null
    && "path" in issue
    && typeof issue.path === "string"
    && "message" in issue
    && typeof issue.message === "string"
  ));
}

function returnedConfig(value: unknown): ProductFulfillmentConfig | null {
  if (typeof value !== "object" || value === null || !("value" in value)) return null;
  const parsed = parseProductFulfillmentConfig(value.value);
  return parsed.ok ? parsed.value : null;
}

function integerInput(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function AdminProductFulfillmentEditor({
  product,
  config: initialConfig,
}: AdminProductFulfillmentEditorProps) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [draftId] = useState(() => newDraftId());
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType | "">(
    initialConfig?.fulfillmentType ?? "",
  );
  const [requiresShipping, setRequiresShipping] = useState<"" | "true" | "false">(
    initialConfig ? String(initialConfig.requiresShipping) as "true" | "false" : "",
  );
  const [productionMode, setProductionMode] = useState<ProductionMode | "">(
    initialConfig?.productionMode ?? "",
  );
  const [minimumDays, setMinimumDays] = useState(
    initialConfig ? String(initialConfig.leadTime.minBusinessDays) : "",
  );
  const [maximumDays, setMaximumDays] = useState(
    initialConfig ? String(initialConfig.leadTime.maxBusinessDays) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const operation = config ? "update" : "create";
    const payload = {
      id: config?.id ?? draftId,
      productId: product.id,
      fulfillmentType,
      requiresShipping: requiresShipping === "" ? null : requiresShipping === "true",
      productionMode,
      leadTime: {
        minBusinessDays: integerInput(minimumDays),
        maxBusinessDays: integerInput(maximumDays),
      },
    };
    try {
      const response = await fetch(
        `/api/admin/catalog/products/${encodeURIComponent(product.id)}/fulfillment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, productId: product.id, config: payload }),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = mutationIssues(result);
        setMessage(issues.length > 0
          ? issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
          : "The FulfillmentConfig could not be saved.");
        return;
      }
      const saved = returnedConfig(result);
      if (saved) setConfig(saved);
      setMessage(operation === "create" ? "Fulfillment configuration created." : "Fulfillment configuration updated.");
      router.refresh();
    } catch {
      setMessage("The FulfillmentConfig service is temporarily unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.fulfillmentSection}>
    <div className={styles.skuHeading}>
      <div>
        <h3>Product fulfillment configuration</h3>
        <p>Lead time runs from production-ready order to completed manufacturing or digital creation. It excludes preview waiting and international transit.</p>
      </div>
      <span className={styles.configState}>{config ? "Configured" : "Not configured — enter approved values explicitly"}</span>
    </div>
    <form onSubmit={save} className={styles.skuGrid}>
      <label><span>Fulfillment type</span><select required value={fulfillmentType} onChange={(event) => setFulfillmentType(event.target.value as FulfillmentType | "")}><option value="">Select…</option><option value="physical">physical</option><option value="digital">digital</option></select></label>
      <label><span>Requires shipping</span><select required value={requiresShipping} onChange={(event) => setRequiresShipping(event.target.value as "" | "true" | "false")}><option value="">Select…</option><option value="true">true</option><option value="false">false</option></select></label>
      <label><span>Production mode</span><select required value={productionMode} onChange={(event) => setProductionMode(event.target.value as ProductionMode | "")}><option value="">Select…</option><option value="custom_manufacturing">custom_manufacturing</option><option value="digital_creation">digital_creation</option></select></label>
      <label><span>Minimum production lead days</span><input required type="number" min="0" step="1" value={minimumDays} onChange={(event) => setMinimumDays(event.target.value)} /></label>
      <label><span>Maximum production lead days</span><input required type="number" min="0" step="1" value={maximumDays} onChange={(event) => setMaximumDays(event.target.value)} /></label>
      <div className={styles.fulfillmentAction}><button type="submit" disabled={saving}>{saving ? "Validating…" : config ? "Update fulfillment configuration" : "Create fulfillment configuration"}</button></div>
    </form>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </section>;
}
