"use client";

import { useCallback, useRef, useState } from "react";
import { isActiveTextCustomizationField } from "../application/customization-text-field-feedback.ts";
import type { CustomizationField } from "../domain/customization-field.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import styles from "./catalog-storefront.module.css";
import { ProductCustomizationImageField } from "./ProductCustomizationImageField.tsx";
import { ProductCustomizationTextField } from "./ProductCustomizationTextField.tsx";
import { ProductCustomizationSingleSelectField } from "./ProductCustomizationSingleSelectField.tsx";
import { ProductCustomizationMultiSelectField } from "./ProductCustomizationMultiSelectField.tsx";
import { ProductCustomizationNumericField } from "./ProductCustomizationNumericField.tsx";
import { ProductCustomizationGenericFileField } from "./ProductCustomizationGenericFileField.tsx";
import { isCustomizationFieldVisible } from "../domain/customization-validation.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";
import type { BrowserRestoredDraft, PersistentCustomizationDraftController } from "../client/local-persistent-draft.ts";
import type { PublicProductAssetView } from "../application/catalog-assets.ts";

/**
 * Product-owned sibling boundary. Field sequence remains the configuration's
 * authoritative position sequence across text and image controls.
 */
export interface ProductCustomizationFormShellProps {
  readonly configurationRevision: string;
  readonly fields: readonly CustomizationField[];
  readonly draft: ProductCustomizationDraft;
  readonly onDraftAction: (action: ProductCustomizationDraftAction) => void;
  readonly onBeginCustomization?: () => void;
  readonly persistentDraft?: PersistentCustomizationDraftController;
  readonly restoredDraft?: BrowserRestoredDraft | null;
  readonly exampleAssets?: readonly PublicProductAssetView[];
}

export function ProductCustomizationFormShell(props: ProductCustomizationFormShellProps) {
  const { t } = useReferenceLanguage();
  const [touchedFieldIds, setTouchedFieldIds] = useState<ReadonlySet<string>>(() => new Set());
  const customizationStarted = useRef(false);
  const dispatchAction = useCallback((action: ProductCustomizationDraftAction) => {
    if (!customizationStarted.current) {
      customizationStarted.current = true;
      props.onBeginCustomization?.();
    }
    props.onDraftAction(action);
  }, [props]);
  const markTouched = useCallback((fieldId: string) => {
    setTouchedFieldIds((current) => current.has(fieldId) ? current : new Set([...current, fieldId]));
  }, []);
  const activeFields = props.fields.filter((field) => field.isActive && isCustomizationFieldVisible(field, props.draft.values));

  return (
    <section
      className={styles.customizationShell}
      aria-labelledby="product-customization-heading"
      data-configuration-revision={props.configurationRevision}
      data-field-count={props.fields.length}
      data-product-id={props.draft.productId}
    >
      <h2 className={styles.selectorHeading} id="product-customization-heading">{t("Personalize your gift")}</h2>
      {activeFields.length > 0 ? activeFields.map((field) => (
        isActiveTextCustomizationField(field) ? (
          <ProductCustomizationTextField
            key={field.id}
            field={field}
            fields={props.fields}
            draft={props.draft}
            touched={touchedFieldIds.has(field.id)}
            onTouched={markTouched}
            onDraftAction={dispatchAction}
          />
        ) : field.kind === "single_select" ? (
          <ProductCustomizationSingleSelectField
            key={field.id}
            field={field}
            draft={props.draft}
            onDraftAction={dispatchAction}
          />
        ) : field.kind === "multi_select" ? (
          <ProductCustomizationMultiSelectField
            key={field.id}
            field={field}
            draft={props.draft}
            onDraftAction={dispatchAction}
          />
        ) : field.kind === "numeric" ? (
          <ProductCustomizationNumericField key={field.id} field={field} draft={props.draft} onDraftAction={dispatchAction} />
        ) : field.kind === "generic_file" ? (
          <ProductCustomizationGenericFileField key={field.id} field={field} draft={props.draft} onDraftAction={dispatchAction} />
        ) : field.kind === "image" ? (
          <ProductCustomizationImageField
            key={`${field.id}:${props.restoredDraft?.draft.draftId ?? "local"}:${props.restoredDraft?.draft.confirmedRevision ?? 0}`}
            field={field}
            draft={props.draft}
            onDraftAction={dispatchAction}
            persistentDraft={props.persistentDraft}
            restoredSlots={props.restoredDraft?.draft.slots.filter(slot => slot.fieldId === field.id).map(slot => ({
              ...slot,
              receipt: props.restoredDraft?.receipts.find(receipt => receipt.slotId === slot.slotId)?.receipt,
            }))}
            exampleAssets={props.exampleAssets}
          />
        ) : null
      )) : (
        <p>{t("Product-specific customization controls will appear here.")}</p>
      )}
    </section>
  );
}
