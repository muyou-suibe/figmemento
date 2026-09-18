"use client";

import { useId } from "react";
import type { CustomizationField } from "../domain/customization-field.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type SingleSelectCustomizationField = Extract<CustomizationField, { kind: "single_select" }>;

export function ProductCustomizationSingleSelectField(props: {
  readonly field: SingleSelectCustomizationField;
  readonly draft: ProductCustomizationDraft;
  readonly onDraftAction: (action: ProductCustomizationDraftAction) => void;
}) {
  const { t } = useReferenceLanguage();
  const controlId = useId();
  const current = props.draft.values.find((value) => value.fieldId === props.field.id);
  const selectedChoiceId = current?.kind === "single_select" ? current.choiceId : "";
  const choices = [...props.field.constraints.choices]
    .filter((choice) => choice.isActive)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));

  const selectChoice = (choiceId: string) => {
    if (!choiceId) {
      props.onDraftAction({ type: "remove_customization_value", fieldId: props.field.id });
      return;
    }
    props.onDraftAction({
      type: "set_single_select_value",
      value: { fieldId: props.field.id, fieldCode: props.field.code, kind: "single_select", choiceId },
    });
  };

  return (
    <fieldset className={styles.customizationSingleSelectField} data-customization-field-id={props.field.id}>
      <legend className={styles.customizationFieldLabel}>
        <span>{props.field.label}</span>
        <span className={styles.customizationRequirement}>{props.field.required ? t("Required") : t("Optional")}</span>
      </legend>
      {props.field.constraints.helpText && <p className={styles.customizationHelpText}>{props.field.constraints.helpText}</p>}
      <div className={styles.customizationChoiceList} role="radiogroup" aria-label={props.field.label}>
        {choices.map((choice) => {
          const choiceControlId = `${controlId}-${choice.id}`;
          return (
            <label className={styles.customizationChoiceOption} key={choice.id} htmlFor={choiceControlId}>
              <input
                id={choiceControlId}
                name={`customization-${props.field.id}`}
                type="radio"
                value={choice.id}
                checked={selectedChoiceId === choice.id}
                onChange={() => selectChoice(choice.id)}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </div>
      {!props.field.required && selectedChoiceId && (
        <button
          className={styles.customizationChoiceClear}
          type="button"
          onClick={() => selectChoice("")}
        >
          {t("Clear selection")}
        </button>
      )}
    </fieldset>
  );
}
