import type {
  AdminCustomizationFieldReplacement,
  AdminCustomizationNewFieldIdMapping,
} from "./admin-customization-field-boundary.ts";
import type {
  CustomizationField,
  CustomizationFieldKind,
  ImageCustomizationFieldConstraints,
  MultiSelectCustomizationFieldConstraints,
  SingleSelectCustomizationFieldConstraints,
  TextCustomizationFieldConstraints,
  NumericCustomizationFieldConstraints,
  GenericFileCustomizationFieldConstraints,
} from "../domain/customization-field.ts";

export type AdminCustomizationEditorField = AdminCustomizationFieldReplacement;

export function defaultCustomizationConstraints(
  kind: CustomizationFieldKind,
): TextCustomizationFieldConstraints | ImageCustomizationFieldConstraints | SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints | NumericCustomizationFieldConstraints | GenericFileCustomizationFieldConstraints {
  return kind === "image"
    ? {
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxBytes: 2_000_000,
        minDimensions: { width: 800, height: 600 },
        minImageCount: 1,
        maxImageCount: 1,
        cropEnabled: false,
      }
    : kind === "single_select"
      ? { choices: [{ id: "new:choice-1", code: "choice-1", label: "Choice 1", position: 0, isActive: true }] }
      : kind === "multi_select"
      ? { choices: [{ id: "new:choice-1", code: "choice-1", label: "Choice 1", position: 0, isActive: true }], minSelections: 0, maxSelections: 1 }
      : kind === "numeric"
        ? { min: 0, max: 100, step: 1 }
      : kind === "generic_file"
        ? { allowedMimeTypes: ["application/pdf", "text/plain"], maxBytes: 5_000_000, minFileCount: 0, maxFileCount: 1 }
      : { maxLength: 100 };
}

export function normalizeCustomizationEditorPositions(
  fields: readonly AdminCustomizationEditorField[],
): AdminCustomizationEditorField[] {
  return fields.map((field, position) => ({ ...field, position }));
}

export function editorFieldsFromConfiguration(
  fields: readonly CustomizationField[],
): AdminCustomizationEditorField[] {
  return fields.map((field) => ({
    identity: { kind: "existing" as const, id: field.id, code: field.code },
    label: field.label,
    kind: field.kind,
    required: field.required,
    isActive: field.isActive,
    position: field.position,
    constraints: field.constraints,
  })).toSorted((left, right) => left.position - right.position);
}

export function addCustomizationEditorField(
  fields: readonly AdminCustomizationEditorField[],
  draftCounter: number,
  kind: CustomizationFieldKind,
): { fields: AdminCustomizationEditorField[]; draftCounter: number } {
  const nextCounter = draftCounter + 1;
  return {
    draftCounter: nextCounter,
    fields: normalizeCustomizationEditorPositions([...fields, {
      identity: { kind: "new", draftId: `new:field-${nextCounter}`, code: `field-${nextCounter}` },
      label: kind === "image" ? "Photo" : kind === "short_text" ? "Text" : kind === "long_text" ? "Long text" : kind === "single_select" ? "Choose one" : kind === "multi_select" ? "Choose many" : kind === "numeric" ? "Number" : "Attachment",
      kind,
      required: false,
      isActive: true,
      position: fields.length,
      constraints: defaultCustomizationConstraints(kind),
    }]),
  };
}

export function moveCustomizationEditorField(
  fields: readonly AdminCustomizationEditorField[],
  index: number,
  direction: -1 | 1,
): AdminCustomizationEditorField[] {
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= fields.length) return [...fields];
  const next = [...fields];
  [next[index], next[destination]] = [next[destination], next[index]];
  return normalizeCustomizationEditorPositions(next);
}

/** Existing identities remain in the complete replacement; new local drafts may disappear. */
export function removeOrToggleCustomizationEditorField(
  fields: readonly AdminCustomizationEditorField[],
  index: number,
): AdminCustomizationEditorField[] {
  const field = fields[index];
  if (!field) return [...fields];
  if (field.identity.kind === "new") {
    return normalizeCustomizationEditorPositions(fields.filter((_, candidateIndex) => candidateIndex !== index));
  }
  return fields.map((candidate, candidateIndex) => candidateIndex === index
    ? { ...candidate, isActive: !candidate.isActive }
    : candidate);
}

/** Canonical persisted fields replace request-local draft identities after save. */
export function reconcileCustomizationEditorPublication(
  fields: readonly CustomizationField[],
  mappings: readonly AdminCustomizationNewFieldIdMapping[],
): AdminCustomizationEditorField[] | null {
  const ids = new Set(fields.map((field) => field.id));
  if (mappings.some((mapping) => !ids.has(mapping.stableFieldId))) return null;
  return editorFieldsFromConfiguration(fields);
}
