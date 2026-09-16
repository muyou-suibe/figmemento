"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CatalogProduct,
  ProductOption,
  ProductOptionKind,
  ProductOptionValue,
  ProductVariant,
  VariantSupplyMethod,
} from "../../domain/catalog/index.ts";
import type { ProductSkuGraph } from "../../application/admin-sku-graph.ts";
import styles from "./admin-products.module.css";

interface AdminSkuGraphEditorProps {
  product: CatalogProduct;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
}

interface MutationIssue {
  path: string;
  message: string;
}

const optionKinds: readonly ProductOptionKind[] = [
  "size",
  "person_count",
  "material",
  "color",
  "other_sku",
];
const supplyMethods: readonly VariantSupplyMethod[] = [
  "made_to_order",
  "digital_delivery",
];

function newDraftId(): string {
  return `new:${globalThis.crypto.randomUUID()}`;
}

function mutationIssues(value: unknown): readonly MutationIssue[] {
  if (typeof value !== "object" || value === null || !("issues" in value) || !Array.isArray(value.issues)) {
    return [];
  }
  return value.issues.filter((issue): issue is MutationIssue => (
    typeof issue === "object" &&
    issue !== null &&
    "path" in issue &&
    typeof issue.path === "string" &&
    "message" in issue &&
    typeof issue.message === "string"
  ));
}

function savedGraph(value: unknown): ProductSkuGraph | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("productId" in value) ||
    typeof value.productId !== "string" ||
    !("options" in value) ||
    !Array.isArray(value.options) ||
    !("optionValues" in value) ||
    !Array.isArray(value.optionValues) ||
    !("variants" in value) ||
    !Array.isArray(value.variants)
  ) return null;
  return value as ProductSkuGraph;
}

function requestBody(graph: ProductSkuGraph) {
  return {
    productId: graph.productId,
    options: graph.options.map((option) => ({
      id: option.id,
      code: option.code,
      name: option.name,
      kind: option.kind,
      required: option.required,
      position: option.position,
    })),
    optionValues: graph.optionValues.map((value) => ({
      id: value.id,
      optionId: value.optionId,
      code: value.code,
      label: value.label,
      position: value.position,
    })),
    variants: graph.variants.map((variant) => ({
      id: variant.id,
      skuCode: variant.skuCode,
      priceCents: variant.priceCents,
      currency: "USD",
      weightGrams: variant.weightGrams,
      isActive: variant.isActive,
      isAvailable: variant.isAvailable,
      isDefault: variant.isDefault,
      supplyMethod: variant.supplyMethod,
      selectedOptions: variant.selectedOptions,
    })),
  };
}

export function AdminSkuGraphEditor({
  product,
  options: initialOptions,
  optionValues: initialOptionValues,
  variants: initialVariants,
}: AdminSkuGraphEditorProps) {
  const router = useRouter();
  const [graph, setGraph] = useState<ProductSkuGraph>({
    productId: product.id,
    options: [...initialOptions],
    optionValues: [...initialOptionValues],
    variants: [...initialVariants],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateOption(id: string, patch: Partial<ProductOption>) {
    setGraph((current) => ({
      ...current,
      options: current.options.map((option) => option.id === id ? { ...option, ...patch } : option),
    }));
  }

  function addOption() {
    setGraph((current) => ({
      ...current,
      options: [...current.options, {
        id: newDraftId(),
        productId: product.id,
        code: "",
        name: "",
        kind: "size",
        required: true,
        position: current.options.length,
      }],
    }));
  }

  function removeOption(id: string) {
    setGraph((current) => {
      const removedValueIds = new Set(
        current.optionValues.filter((value) => value.optionId === id).map((value) => value.id),
      );
      return {
        ...current,
        options: current.options.filter((option) => option.id !== id),
        optionValues: current.optionValues.filter((value) => value.optionId !== id),
        variants: current.variants.map((variant) => ({
          ...variant,
          selectedOptions: variant.selectedOptions.filter(
            (selection) => selection.optionId !== id && !removedValueIds.has(selection.valueId),
          ),
        })),
      };
    });
  }

  function addOptionValue(optionId: string) {
    setGraph((current) => ({
      ...current,
      optionValues: [...current.optionValues, {
        id: newDraftId(),
        productId: product.id,
        optionId,
        code: "",
        label: "",
        position: current.optionValues.filter((value) => value.optionId === optionId).length,
      }],
    }));
  }

  function updateOptionValue(id: string, patch: Partial<ProductOptionValue>) {
    setGraph((current) => ({
      ...current,
      optionValues: current.optionValues.map((value) => value.id === id ? { ...value, ...patch } : value),
    }));
  }

  function removeOptionValue(id: string) {
    setGraph((current) => ({
      ...current,
      optionValues: current.optionValues.filter((value) => value.id !== id),
      variants: current.variants.map((variant) => ({
        ...variant,
        selectedOptions: variant.selectedOptions.filter((selection) => selection.valueId !== id),
      })),
    }));
  }

  function addVariant() {
    setGraph((current) => ({
      ...current,
      variants: [...current.variants, {
        id: newDraftId(),
        productId: product.id,
        skuCode: "",
        priceCents: -1,
        currency: "USD",
        weightGrams: -1,
        isActive: false,
        isAvailable: false,
        isDefault: current.variants.length === 0,
        supplyMethod: "made_to_order",
        selectedOptions: [],
      }],
    }));
  }

  function updateVariant(id: string, patch: Partial<ProductVariant>) {
    setGraph((current) => ({
      ...current,
      variants: current.variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant),
    }));
  }

  function selectVariantValue(variantId: string, optionId: string, valueId: string) {
    setGraph((current) => ({
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.id !== variantId) return variant;
        const withoutOption = variant.selectedOptions.filter((selection) => selection.optionId !== optionId);
        return {
          ...variant,
          selectedOptions: valueId ? [...withoutOption, { optionId, valueId }] : withoutOption,
        };
      }),
    }));
  }

  function setDefaultVariant(id: string, checked: boolean) {
    setGraph((current) => ({
      ...current,
      variants: current.variants.map((variant) => ({
        ...variant,
        isDefault: checked ? variant.id === id : variant.id === id ? false : variant.isDefault,
      })),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/catalog/products/${encodeURIComponent(product.id)}/sku-graph`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody(graph)),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = mutationIssues(result);
        setMessage(issues.length > 0
          ? issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
          : "The complete SKU graph could not be saved.");
        return;
      }
      const returned = typeof result === "object" && result !== null && "value" in result
        ? savedGraph(result.value)
        : null;
      if (returned) setGraph(returned);
      setMessage("SKU graph saved atomically.");
      router.refresh();
    } catch {
      setMessage("The SKU graph update is temporarily unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.skuForm} onSubmit={save}>
    <div className={styles.skuHeading}>
      <div><h3>SKU configuration</h3><p>One complete graph is validated and saved atomically. Draft edits are never persisted individually.</p></div>
      <button type="button" onClick={addOption}>Add option</button>
    </div>

    <div className={styles.skuStack}>
      {graph.options.map((option) => <fieldset key={option.id} className={styles.skuGroup}>
        <legend>Option · {option.name || "Incomplete draft"}</legend>
        <div className={styles.skuGrid}>
          <label><span>Code</span><input value={option.code} onChange={(event) => updateOption(option.id, { code: event.target.value })} /></label>
          <label><span>Name</span><input value={option.name} onChange={(event) => updateOption(option.id, { name: event.target.value })} /></label>
          <label><span>Kind</span><select value={option.kind} onChange={(event) => updateOption(option.id, { kind: event.target.value as ProductOptionKind })}>{optionKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
          <label><span>Position</span><input type="number" min="0" step="1" value={option.position} onChange={(event) => updateOption(option.id, { position: event.target.valueAsNumber })} /></label>
          <label className={styles.checkField}><input type="checkbox" checked={option.required} onChange={(event) => updateOption(option.id, { required: event.target.checked })} /><span>Required for every Variant</span></label>
        </div>
        <div className={styles.inlineActions}><button type="button" onClick={() => addOptionValue(option.id)}>Add value</button><button type="button" className={styles.dangerButton} onClick={() => removeOption(option.id)}>Remove option and local selections</button></div>
        <div className={styles.valueList}>{graph.optionValues.filter((value) => value.optionId === option.id).map((value) => <div key={value.id} className={styles.valueRow}>
          <input aria-label="Value code" placeholder="value-code" value={value.code} onChange={(event) => updateOptionValue(value.id, { code: event.target.value })} />
          <input aria-label="Value label" placeholder="Customer label" value={value.label} onChange={(event) => updateOptionValue(value.id, { label: event.target.value })} />
          <input aria-label="Value position" type="number" min="0" step="1" value={value.position} onChange={(event) => updateOptionValue(value.id, { position: event.target.valueAsNumber })} />
          <button type="button" className={styles.dangerButton} onClick={() => removeOptionValue(value.id)}>Remove</button>
        </div>)}</div>
      </fieldset>)}
    </div>

    <div className={styles.skuHeading}>
      <div><h3>Variants</h3><p>USD price and real gram weight are Variant-authoritative. New drafts start invalid until completed.</p></div>
      <button type="button" onClick={addVariant}>Add variant</button>
    </div>
    <div className={styles.skuStack}>{graph.variants.map((variant) => <fieldset key={variant.id} className={styles.skuGroup}>
      <legend>Variant · {variant.skuCode || "Incomplete draft"}</legend>
      <div className={styles.skuGrid}>
        <label><span>SKU code</span><input value={variant.skuCode} onChange={(event) => updateVariant(variant.id, { skuCode: event.target.value })} /></label>
        <label><span>Price (USD cents)</span><input type="number" min="0" step="1" value={variant.priceCents} onChange={(event) => updateVariant(variant.id, { priceCents: event.target.valueAsNumber })} /></label>
        <label><span>Currency</span><input value="USD" readOnly /></label>
        <label><span>Weight (grams)</span><input type="number" min="0" step="1" value={variant.weightGrams} onChange={(event) => updateVariant(variant.id, { weightGrams: event.target.valueAsNumber })} /></label>
        <label><span>Supply method</span><select value={variant.supplyMethod} onChange={(event) => updateVariant(variant.id, { supplyMethod: event.target.value as VariantSupplyMethod })}>{supplyMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
        {graph.options.map((option) => <label key={option.id}><span>{option.name || option.code || "Option"}</span><select value={variant.selectedOptions.find((selection) => selection.optionId === option.id)?.valueId ?? ""} onChange={(event) => selectVariantValue(variant.id, option.id, event.target.value)}><option value="">Select…</option>{graph.optionValues.filter((value) => value.optionId === option.id).map((value) => <option key={value.id} value={value.id}>{value.label || value.code || "Incomplete value"}</option>)}</select></label>)}
      </div>
      <div className={styles.flagRow}>
        <label><input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(variant.id, { isActive: event.target.checked })} /> Active</label>
        <label><input type="checkbox" checked={variant.isAvailable} onChange={(event) => updateVariant(variant.id, { isAvailable: event.target.checked })} /> Available</label>
        <label><input type="checkbox" checked={variant.isDefault} onChange={(event) => setDefaultVariant(variant.id, event.target.checked)} /> Default</label>
        <button type="button" className={styles.dangerButton} onClick={() => setGraph((current) => ({ ...current, variants: current.variants.filter((item) => item.id !== variant.id) }))}>Remove variant</button>
      </div>
    </fieldset>)}</div>

    <div className={styles.saveBar}><button type="submit" disabled={saving}>{saving ? "Validating and saving…" : "Save complete SKU graph"}</button><span>Product lifecycle, assets and fulfillment are unchanged.</span></div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </form>;
}
