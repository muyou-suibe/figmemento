"use client";

import { useId } from "react";
import type { CustomizationField } from "../domain/customization-field.ts";
import type { ProductCustomizationDraft, ProductCustomizationDraftAction } from "../domain/product-customization-draft.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type MultiSelectCustomizationField = Extract<CustomizationField, { kind: "multi_select" }>;

export function ProductCustomizationMultiSelectField(props: {
  readonly field: MultiSelectCustomizationField;
  readonly draft: ProductCustomizationDraft;
  readonly onDraftAction: (action: ProductCustomizationDraftAction) => void;
}) {
  const { t } = useReferenceLanguage();
  const controlId = useId();
  const current = props.draft.values.find((value) => value.fieldId === props.field.id);
  const selectedChoiceIds = new Set(current?.kind === "multi_select" ? current.choiceIds : []);
  const choices = [...props.field.constraints.choices]
    .filter((choice) => choice.isActive)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const max = props.field.constraints.maxSelections;

  const selectChoice = (choiceId: string, checked: boolean) => {
    const next = new Set(selectedChoiceIds);
    if (checked) {
      if (next.size >= max) return;
      next.add(choiceId);
    } else {
      next.delete(choiceId);
    }
    const choiceIds = choices.filter((choice) => next.has(choice.id)).map((choice) => choice.id);
    props.onDraftAction({
      type: "set_multi_select_value",
      value: { fieldId: props.field.id, fieldCode: props.field.code, kind: "multi_select", choiceIds },
    });
  };

  return (
    <fieldset className={styles.customizationSingleSelectField} data-customization-field-id={props.field.id}>
      <legend className={styles.customizationFieldLabel}>
        <span>{props.field.label}</span>
        <span className={styles.customizationRequirement}>{props.field.required ? t("Required") : t("Optional")}</span>
      </legend>
      <p className={styles.customizationHelpText}>
        {props.field.constraints.minSelections === props.field.constraints.maxSelections
          ? `${props.field.constraints.minSelections} selections`
          : `${props.field.constraints.minSelections}–${props.field.constraints.maxSelections} selections`}
      </p>
      {props.field.constraints.helpText && <p className={styles.customizationHelpText}>{props.field.constraints.helpText}</p>}
      <div className={styles.customizationChoiceList} role="group" aria-label={props.field.label}>
        {choices.map((choice) => {
          const choiceControlId = `${controlId}-${choice.id}`;
          const checked = selectedChoiceIds.has(choice.id);
          return (
            <label className={styles.customizationChoiceOption} key={choice.id} htmlFor={choiceControlId}>
              <input
                id={choiceControlId}
                name={`customization-${props.field.id}-${choice.id}`}
                type="checkbox"
                value={choice.id}
                checked={checked}
                disabled={!checked && selectedChoiceIds.size >= max}
                onChange={(event) => selectChoice(choice.id, event.target.checked)}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
