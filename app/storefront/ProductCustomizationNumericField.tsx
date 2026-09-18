"use client";

import type { CustomizationField } from "../domain/customization-field.ts";
import type { ProductCustomizationDraft, ProductCustomizationDraftAction } from "../domain/product-customization-draft.ts";
import styles from "./catalog-storefront.module.css";

export function ProductCustomizationNumericField({ field, draft, onDraftAction }: { field: Extract<CustomizationField, { kind: "numeric" }>; draft: ProductCustomizationDraft; onDraftAction: (action: ProductCustomizationDraftAction) => void }) {
  const current = draft.values.find((value) => value.fieldId === field.id);
  const value = current?.kind === "numeric" ? current.value : "";
  return <label className={styles.textField}><span>{field.label}{field.required ? " *" : ""}</span><input type="number" min={field.constraints.min} max={field.constraints.max} step={field.constraints.step} value={value} onChange={(event) => onDraftAction({ type: "set_numeric_value", value: { fieldId: field.id, fieldCode: field.code, kind: "numeric", value: Number(event.target.value) } })} /><small>{field.constraints.helpText ?? `Choose a value from ${field.constraints.min} to ${field.constraints.max}.`}</small></label>;
}
