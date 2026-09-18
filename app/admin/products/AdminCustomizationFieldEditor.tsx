"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminCustomizationNewFieldIdMapping,
} from "../../application/admin-customization-field-boundary.ts";
import {
  addCustomizationEditorField,
  defaultCustomizationConstraints,
  editorFieldsFromConfiguration,
  moveCustomizationEditorField,
  normalizeCustomizationEditorPositions,
  reconcileCustomizationEditorPublication,
  removeOrToggleCustomizationEditorField,
  type AdminCustomizationEditorField,
} from "../../application/admin-customization-field-editor-state.ts";
import type {
  CatalogValidationIssue,
} from "../../domain/catalog/validation.ts";
import type {
  AllowedImageMimeType,
  CustomizationField,
  CustomizationFieldKind,
  ImageCustomizationFieldConstraints,
  MultiSelectCustomizationFieldConstraints,
  SingleSelectCustomizationFieldConstraints,
  TextCustomizationFieldConstraints,
} from "../../domain/customization-field.ts";
import type { CatalogProduct } from "../../domain/catalog/index.ts";
import styles from "./admin-products.module.css";

type EditorField = AdminCustomizationEditorField;
type EditorStatus = "loading" | "ready" | "saving" | "saved" | "stale" | "error";

interface ConfigurationResponse {
  status: "found";
  value: {
    status: "configured";
    productId: string;
    configurationRevision: string;
    fields: readonly CustomizationField[];
  } | { status: "not_configured"; productId: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIssues(value: unknown): readonly CatalogValidationIssue[] {
  if (!isRecord(value) || !Array.isArray(value.issues)) return [];
  return value.issues.filter((issue): issue is CatalogValidationIssue => isRecord(issue)
    && typeof issue.path === "string"
    && typeof issue.message === "string"
    && typeof issue.code === "string");
}

function canonicalFields(value: unknown): readonly CustomizationField[] | null {
  if (!isRecord(value) || !Array.isArray(value.fields)) return null;
  const fields = value.fields.filter((field): field is CustomizationField => isRecord(field)
    && typeof field.id === "string"
    && typeof field.productId === "string"
    && typeof field.code === "string"
    && typeof field.configurationRevision === "string");
  return fields.length === value.fields.length ? fields : null;
}

export function AdminCustomizationFieldEditor({ product }: { product: CatalogProduct }) {
  const [fields, setFields] = useState<EditorField[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [issues, setIssues] = useState<readonly CatalogValidationIssue[]>([]);
  const [draftCounter, setDraftCounter] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const isDirty = useMemo(() => status === "ready" || status === "stale" || status === "error", [status]);

  const load = useCallback(async () => {
    setStatus("loading");
    setIssues([]);
    try {
      const response = await fetch(`/api/admin/catalog/products/${encodeURIComponent(product.id)}/customization`);
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(result) || result.status !== "found" || !isRecord(result.value)) {
        setStatus("error");
        return;
      }
      const configured = result as unknown as ConfigurationResponse;
      if (configured.value.status === "not_configured") {
        setFields([]);
        setRevision(null);
      } else {
        setFields(editorFieldsFromConfiguration(configured.value.fields));
        setRevision(configured.value.configurationRevision);
      }
      setHasLoaded(true);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [product.id]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => { void load(); }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  function addField(kind: CustomizationFieldKind) {
    const next = addCustomizationEditorField(fields, draftCounter, kind);
    setDraftCounter(next.draftCounter);
    setFields(next.fields);
    setStatus("ready");
  }

  function replace(index: number, field: EditorField) {
    setFields((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? field : candidate));
    setStatus("ready");
  }

  function move(index: number, direction: -1 | 1) {
    setFields((current) => moveCustomizationEditorField(current, index, direction));
    setStatus("ready");
  }

  function removeOrDeactivate(index: number) {
    setFields((current) => removeOrToggleCustomizationEditorField(current, index));
    setStatus("ready");
  }

  async function save() {
    setStatus("saving");
    setIssues([]);
    try {
      const response = await fetch(`/api/admin/catalog/products/${encodeURIComponent(product.id)}/customization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCurrentRevision: revision, fields: normalizeCustomizationEditorPositions(fields) }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (isRecord(result) && result.status === "applied" && isRecord(result.value)) {
        const canonical = canonicalFields(result.value);
        const mappings = Array.isArray(result.newFieldIdMappings)
          ? result.newFieldIdMappings as readonly AdminCustomizationNewFieldIdMapping[]
          : null;
        if (canonical && mappings && typeof result.value.configurationRevision === "string") {
          const reconciled = reconcileCustomizationEditorPublication(canonical, mappings);
          if (reconciled) {
            setFields(reconciled);
            setRevision(result.value.configurationRevision);
            setStatus("saved");
            return;
          }
        }
      }
      if (isRecord(result) && result.status === "stale_revision") {
        setStatus("stale");
        return;
      }
      setIssues(safeIssues(result));
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  return <section className={styles.customizationSection}>
    <div className={styles.skuHeading}>
      <div><h3>Customization fields</h3><p>Complete Product-owned field configuration. Existing field codes and stable identities remain immutable.</p></div>
      <span className={styles.configState}>{revision ? "Configured" : "Not configured"}</span>
    </div>
    <p className={styles.identityNote}>Product: {product.name} · /{product.slug} · {product.id}</p>
    {status === "loading" ? <p role="status" className={styles.message}>Loading customization configuration…</p> : null}
    {status === "error" && issues.length === 0 ? <p role="status" className={styles.message}>Customization configuration is temporarily unavailable.</p> : null}
    {status === "stale" ? <div className={styles.conflict}><p>This Product&apos;s customization configuration changed after you opened it. Your local edits have not been overwritten.</p><button type="button" onClick={() => void load()}>Reload current configuration</button></div> : null}
    {status !== "loading" && (hasLoaded || status !== "error") ? <>
      <div className={styles.inlineActions}><button type="button" onClick={() => addField("image")}>Add image field</button><button type="button" onClick={() => addField("short_text")}>Add short text field</button><button type="button" onClick={() => addField("long_text")}>Add long text field</button><button type="button" onClick={() => addField("single_select")}>Add single-select field</button><button type="button" onClick={() => addField("multi_select")}>Add multi-select field</button></div>
      <div className={styles.customizationStack}>{fields.map((field, index) => <FieldEditor key={field.identity.kind === "existing" ? field.identity.id : field.identity.draftId} field={field} index={index} total={fields.length} onChange={(next) => replace(index, next)} onMove={move} onDeactivate={() => removeOrDeactivate(index)} />)}</div>
      <div className={styles.saveBar}><span>{status === "saved" ? "Saved canonical configuration." : isDirty ? "Unsaved field configuration." : "Ready."}</span><button type="button" onClick={() => void save()} disabled={status === "saving" || status === "stale"}>{status === "saving" ? "Saving…" : "Save configuration"}</button></div>
      {issues.length > 0 ? <ul className={styles.issueList}>{issues.map((issue) => <li key={`${issue.path}:${issue.code}`}>{issue.path}: {issue.message}</li>)}</ul> : null}
    </> : null}
  </section>;
}

function FieldEditor({ field, index, total, onChange, onMove, onDeactivate }: { field: EditorField; index: number; total: number; onChange: (field: EditorField) => void; onMove: (index: number, direction: -1 | 1) => void; onDeactivate: () => void }) {
  const text = field.kind === "short_text" || field.kind === "long_text" ? field.constraints as TextCustomizationFieldConstraints : null;
  const image = field.kind === "image" ? field.constraints as ImageCustomizationFieldConstraints : null;
  const choiceSelect = field.kind === "single_select" || field.kind === "multi_select" ? field.constraints as SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints : null;
  const update = (patch: Partial<EditorField>) => onChange({ ...field, ...patch });
  return <fieldset className={styles.skuGroup}>
    <legend>{field.identity.kind === "existing" ? "Persisted field" : "New field"} · position {field.position}</legend>
    <div className={styles.skuGrid}>
      <label><span>Code</span><input value={field.identity.code} readOnly={field.identity.kind === "existing"} onChange={(event) => field.identity.kind === "new" && update({ identity: { ...field.identity, code: event.target.value } })} /></label>
      <label><span>Label</span><input value={field.label} onChange={(event) => update({ label: event.target.value })} /></label>
      <label><span>Field kind</span><select value={field.kind} onChange={(event) => update({ kind: event.target.value as CustomizationFieldKind, constraints: defaultCustomizationConstraints(event.target.value as CustomizationFieldKind) })}><option value="image">image</option><option value="short_text">short_text</option><option value="long_text">long_text</option><option value="single_select">single_select</option><option value="multi_select">multi_select</option></select></label>
      <label className={styles.checkField}><input type="checkbox" checked={field.required} onChange={(event) => update({ required: event.target.checked })} /><span>Required</span></label>
      <label className={styles.checkField}><input type="checkbox" checked={field.isActive} onChange={(event) => update({ isActive: event.target.checked })} /><span>Active</span></label>
    </div>
    {text ? <div className={styles.skuGrid}><label><span>Maximum text length</span><input type="number" min="1" value={text.maxLength} onChange={(event) => update({ constraints: { ...text, maxLength: Number(event.target.value) } })} /></label><label><span>Help text (optional)</span><input value={text.helpText ?? ""} onChange={(event) => update({ constraints: { maxLength: text.maxLength, ...(event.target.value.trim() ? { helpText: event.target.value } : {}) } })} /></label></div> : null}
    {image ? <div className={styles.skuGrid}><label><span>Maximum bytes</span><input type="number" min="1" value={image.maxBytes} onChange={(event) => update({ constraints: { ...image, maxBytes: Number(event.target.value) } })} /></label><label><span>Minimum width</span><input type="number" min="1" value={image.minDimensions.width} onChange={(event) => update({ constraints: { ...image, minDimensions: { ...image.minDimensions, width: Number(event.target.value) } } })} /></label><label><span>Minimum height</span><input type="number" min="1" value={image.minDimensions.height} onChange={(event) => update({ constraints: { ...image, minDimensions: { ...image.minDimensions, height: Number(event.target.value) } } })} /></label><label><span>Recommended width (optional)</span><input type="number" min="1" value={image.recommendedDimensions?.width ?? ""} onChange={(event) => update({ constraints: { ...image, ...(event.target.value === "" ? {} : { recommendedDimensions: { width: Number(event.target.value), height: image.recommendedDimensions?.height ?? image.minDimensions.height } }) } })} /></label><label><span>Recommended height (optional)</span><input type="number" min="1" value={image.recommendedDimensions?.height ?? ""} onChange={(event) => update({ constraints: { ...image, ...(event.target.value === "" ? {} : { recommendedDimensions: { width: image.recommendedDimensions?.width ?? image.minDimensions.width, height: Number(event.target.value) } }) } })} /></label><label><span>Minimum image count</span><input type="number" min="0" value={image.minImageCount} onChange={(event) => update({ constraints: { ...image, minImageCount: Number(event.target.value) } })} /></label><label><span>Maximum image count</span><input type="number" min="1" value={image.maxImageCount} onChange={(event) => update({ constraints: { ...image, maxImageCount: Number(event.target.value) } })} /></label><label className={styles.checkField}><input type="checkbox" checked={image.cropEnabled} onChange={(event) => update({ constraints: { ...image, cropEnabled: event.target.checked } })} /><span>Allow customer-input crop later</span></label><label className={styles.mimeField}><span>Allowed types</span>{(["image/jpeg", "image/png", "image/webp"] as const).map((mime: AllowedImageMimeType) => <span key={mime}><input type="checkbox" checked={image.allowedMimeTypes.includes(mime)} onChange={(event) => update({ constraints: { ...image, allowedMimeTypes: event.target.checked ? [...image.allowedMimeTypes, mime] : image.allowedMimeTypes.filter((value) => value !== mime) } })} />{mime}</span>)}</label></div> : null}
    {choiceSelect ? <ChoiceSelectEditor kind={field.kind === "multi_select" ? "multi_select" : "single_select"} value={choiceSelect} onChange={(constraints) => update({ constraints })} /> : null}
    <div className={styles.inlineActions}><button type="button" disabled={index === 0} onClick={() => onMove(index, -1)}>Move up</button><button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)}>Move down</button>{field.identity.kind === "new" ? <button type="button" className={styles.dangerButton} onClick={onDeactivate}>Remove unsaved field</button> : <button type="button" className={styles.dangerButton} onClick={onDeactivate}>{field.isActive ? "Deactivate field" : "Reactivate field"}</button>}</div>
  </fieldset>;
}

function ChoiceSelectEditor({ kind, value, onChange }: { kind: "single_select" | "multi_select"; value: SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints; onChange: (value: SingleSelectCustomizationFieldConstraints | MultiSelectCustomizationFieldConstraints) => void }) {
  const updateChoice = (index: number, patch: Partial<SingleSelectCustomizationFieldConstraints["choices"][number]>) => {
    onChange({ ...value, choices: value.choices.map((choice, choiceIndex) => choiceIndex === index ? { ...choice, ...patch } : choice) });
  };
  const addChoice = () => {
    const next = value.choices.length + 1;
    onChange({ ...value, choices: [...value.choices, { id: `new:choice-${next}`, code: `choice-${next}`, label: `Choice ${next}`, position: value.choices.length, isActive: true }] });
  };
  const removeChoice = (index: number) => {
    if (value.choices.length <= 1) return;
    onChange({ ...value, choices: value.choices.filter((_, choiceIndex) => choiceIndex !== index).map((choice, position) => ({ ...choice, position })) });
  };
  const multi = kind === "multi_select" ? value as MultiSelectCustomizationFieldConstraints : null;
  return <div className={styles.skuGrid}>
    {multi ? <><label><span>Minimum selections</span><input type="number" min="0" max="50" value={multi.minSelections} onChange={(event) => onChange({ ...multi, minSelections: Number(event.target.value) })} /></label><label><span>Maximum selections</span><input type="number" min="1" max="50" value={multi.maxSelections} onChange={(event) => onChange({ ...multi, maxSelections: Number(event.target.value) })} /></label></> : null}
    <label><span>Help text (optional)</span><input value={value.helpText ?? ""} onChange={(event) => onChange({ ...value, ...(event.target.value.trim() ? { helpText: event.target.value } : {}) })} /></label>
    <div className={styles.full}><span>Choices (ordered, stable IDs)</span>{value.choices.map((choice, index) => <div className={styles.inlineActions} key={choice.id}>
      <input aria-label={`Choice ${index + 1} code`} value={choice.code} readOnly={!choice.id.startsWith("new:")} onChange={(event) => choice.id.startsWith("new:") && updateChoice(index, { code: event.target.value })} />
      <input aria-label={`Choice ${index + 1} label`} value={choice.label} onChange={(event) => updateChoice(index, { label: event.target.value })} />
      <input aria-label={`Choice ${index + 1} position`} type="number" min="0" value={choice.position} onChange={(event) => updateChoice(index, { position: Number(event.target.value) })} />
      <label className={styles.checkField}><input type="checkbox" checked={choice.isActive} onChange={(event) => updateChoice(index, { isActive: event.target.checked })} /><span>Active</span></label>
      <button type="button" className={styles.dangerButton} onClick={() => removeChoice(index)} disabled={value.choices.length <= 1}>Remove</button>
    </div>)}<button type="button" onClick={addChoice}>Add choice</button></div>
  </div>;
}
