"use client";

import type { CustomizationField } from "../domain/customization-field.ts";
import type { ProductCustomizationDraft, ProductCustomizationDraftAction } from "../domain/product-customization-draft.ts";
import { parseCustomerUploadReceipt } from "../domain/customer-upload.ts";
import styles from "./catalog-storefront.module.css";

/**
 * Generic-file receipts are server-issued. This presentation intentionally
 * does not turn a browser File or object URL into a customization authority;
 * the existing private upload boundary supplies receipts before this value is
 * accepted by the configured-item validator.
 */
export function ProductCustomizationGenericFileField({ field, draft, onDraftAction }: { field: Extract<CustomizationField, { kind: "generic_file" }>; draft: ProductCustomizationDraft; onDraftAction: (action: ProductCustomizationDraftAction) => void }) {
  const current = draft.values.find((value) => value.fieldId === field.id);
  const count = current?.kind === "generic_file" ? current.files.length : 0;
  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/uploads?productId=${encodeURIComponent(draft.productId)}&fieldId=${encodeURIComponent(field.id)}`, { method: "POST", body: form });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("receipt" in body)) return;
      const receipt = parseCustomerUploadReceipt(body.receipt);
      if (!receipt.ok || !field.constraints.allowedMimeTypes.includes(receipt.value.contentType as typeof field.constraints.allowedMimeTypes[number])) return;
      const files = current?.kind === "generic_file" ? [...current.files, { receiptId: receipt.value.receiptId }] : [{ receiptId: receipt.value.receiptId }];
      if (files.length > field.constraints.maxFileCount) return;
      onDraftAction({ type: "set_generic_file_value", value: { fieldId: field.id, fieldCode: field.code, kind: "generic_file", files } });
    } catch {
      // The existing upload boundary reports a bounded failure; no browser
      // File, URL, MIME claim, or storage locator becomes draft authority.
    }
  };
  return <div className={styles.uploadField}><strong>{field.label}{field.required ? " *" : ""}</strong><label><span>Choose a private file</span><input type="file" accept={field.constraints.allowedMimeTypes.join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label><span>{count > 0 ? `${count} private file${count === 1 ? "" : "s"} attached.` : "Private file receipt required."}</span><small>{field.constraints.helpText ?? "Allowed files are verified server-side before purchase."}</small></div>;
}
