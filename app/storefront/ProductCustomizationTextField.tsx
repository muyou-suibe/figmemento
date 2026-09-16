"use client";

import { useId, type ChangeEvent } from "react";
import {
  createTextCustomizationDraftAction,
  getCustomizationTextFieldFeedback,
  getVisibleCustomizationTextFieldIssues,
} from "../application/customization-text-field-feedback.ts";
import type { CustomizationField } from "../domain/customization-field.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type TextCustomizationField = Extract<CustomizationField, {
  kind: "short_text" | "long_text";
}>;

export interface ProductCustomizationTextFieldProps {
  readonly field: TextCustomizationField;
  readonly fields: readonly CustomizationField[];
  readonly draft: ProductCustomizationDraft;
  readonly touched: boolean;
  readonly onTouched: (fieldId: string) => void;
  readonly onDraftAction: (action: ProductCustomizationDraftAction) => void;
}

export function ProductCustomizationTextField(props: ProductCustomizationTextFieldProps) {
  const { t } = useReferenceLanguage();
  const controlId = useId();
  const helpId = `${controlId}-help`;
  const limitId = `${controlId}-limit`;
  const feedbackId = `${controlId}-feedback`;
  const feedback = getCustomizationTextFieldFeedback({
    draft: props.draft,
    fields: props.fields,
    field: props.field,
  });
  const visibleIssues = getVisibleCustomizationTextFieldIssues(feedback.issues, props.touched);
  const describedBy = [
    ...(props.field.constraints.helpText ? [helpId] : []),
    limitId,
    ...(visibleIssues.length > 0 ? [feedbackId] : []),
  ];
  const isInvalid = visibleIssues.length > 0;
  const actionFor = (rawValue: string) => createTextCustomizationDraftAction(props.field, rawValue);
  const commonProps = {
    id: controlId,
    name: `customization-${props.field.id}`,
    value: feedback.rawValue,
    "aria-describedby": describedBy.join(" "),
    "aria-invalid": isInvalid || undefined,
    "aria-required": props.field.required || undefined,
    onBlur: () => props.onTouched(props.field.id),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      props.onTouched(props.field.id);
      props.onDraftAction(actionFor(event.currentTarget.value));
    },
  };

  return (
    <div className={styles.customizationTextField} data-customization-field-id={props.field.id}>
      <label className={styles.customizationFieldLabel} htmlFor={controlId}>
        <span>{props.field.label}</span>
        <span className={styles.customizationRequirement}>
          {props.field.required ? t("Required") : t("Optional")}
        </span>
      </label>
      {props.field.constraints.helpText && (
        <p className={styles.customizationHelpText} id={helpId}>{props.field.constraints.helpText}</p>
      )}
      {props.field.kind === "short_text" ? (
        <input {...commonProps} className={styles.customizationTextInput} type="text" />
      ) : (
        <textarea {...commonProps} className={styles.customizationTextarea} rows={4} />
      )}
      <div className={styles.customizationFieldMeta}>
        <span id={limitId}>{t("Maximum")} {props.field.constraints.maxLength} {t("characters")}</span>
        <span aria-label={`${feedback.rawValue.length} ${t("characters entered")}`}>
          {feedback.rawValue.length}/{props.field.constraints.maxLength}
        </span>
      </div>
      {visibleIssues.length > 0 && (
        <div className={styles.customizationFeedback} id={feedbackId} aria-live="polite">
          {visibleIssues.map((issue) => <p key={`${issue.path}:${issue.code}`}>{t(issue.message)}</p>)}
        </div>
      )}
    </div>
  );
}
