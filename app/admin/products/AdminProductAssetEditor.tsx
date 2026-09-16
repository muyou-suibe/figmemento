"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  parseProductAsset,
  type CatalogProduct,
  type ProductAsset,
  type ProductAssetMediaType,
  type ProductAssetRole,
  type ProductVariant,
  type PublicAssetSource,
} from "../../domain/catalog/index.ts";
import styles from "./admin-products.module.css";

interface AdminProductAssetEditorProps {
  product: CatalogProduct;
  assets: readonly ProductAsset[];
  variants: readonly ProductVariant[];
}

interface MutationIssue {
  path: string;
  message: string;
}

const mediaTypes: readonly ProductAssetMediaType[] = ["image", "video"];
const roles: readonly ProductAssetRole[] = ["thumbnail", "gallery", "detail", "example", "seo"];
const sourceKinds: readonly PublicAssetSource["kind"][] = ["url", "public_reference"];

function newDraftId(): string {
  return `new:${globalThis.crypto.randomUUID()}`;
}

function ordered(assets: readonly ProductAsset[]): ProductAsset[] {
  return [...assets].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
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

function returnedAsset(value: unknown): ProductAsset | null {
  if (typeof value !== "object" || value === null || !("value" in value)) return null;
  const parsed = parseProductAsset(value.value);
  return parsed.ok ? parsed.value : null;
}

function optionalPositiveInteger(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

export function AdminProductAssetEditor({
  product,
  assets: initialAssets,
  variants,
}: AdminProductAssetEditorProps) {
  const router = useRouter();
  const [assets, setAssets] = useState(() => ordered(initialAssets));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function update(id: string, patch: Partial<ProductAsset>) {
    setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...patch } : asset));
  }

  function addAsset() {
    const id = newDraftId();
    setAssets((current) => [...current, {
      id,
      productId: product.id,
      mediaType: "image",
      role: "gallery",
      position: current.length,
      visibility: "public",
      source: { kind: "url", value: "" },
    }]);
    setMessage("Complete the already-public media reference, then save this draft.");
  }

  async function mutate(body: unknown, id: string) {
    setActiveId(id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/catalog/products/${encodeURIComponent(product.id)}/assets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = mutationIssues(result);
        setMessage(issues.length > 0
          ? issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
          : "The ProductAsset metadata change could not be saved.");
        return null;
      }
      router.refresh();
      return returnedAsset(result);
    } catch {
      setMessage("The ProductAsset metadata service is temporarily unavailable.");
      return null;
    } finally {
      setActiveId(null);
    }
  }

  async function save(asset: ProductAsset) {
    const operation = asset.id.startsWith("new:") ? "create" : "update";
    const saved = await mutate({ operation, productId: product.id, asset }, asset.id);
    if (!saved) return;
    setAssets((current) => ordered(current.map((candidate) => candidate.id === asset.id ? saved : candidate)));
    setMessage(operation === "create" ? "Public ProductAsset metadata added." : "ProductAsset metadata updated.");
  }

  async function remove(asset: ProductAsset) {
    if (asset.id.startsWith("new:")) {
      setAssets((current) => current.filter((candidate) => candidate.id !== asset.id));
      setMessage("Unsaved Asset draft removed locally.");
      return;
    }
    const removed = await mutate({ operation: "remove", productId: product.id, assetId: asset.id }, asset.id);
    if (!removed) return;
    setAssets((current) => current.filter((candidate) => candidate.id !== asset.id));
    setMessage("ProductAsset metadata removed. No media binary or private object was touched.");
  }

  return <section className={styles.assetSection}>
    <div className={styles.skuHeading}>
      <div>
        <h3>Public marketing media</h3>
        <p>Metadata only: enter an already-public HTTPS URL or provider-neutral public reference. No upload or private customer media access is available here.</p>
      </div>
      <button type="button" onClick={addAsset}>Add public asset</button>
    </div>
    <div className={styles.skuStack}>
      {ordered(assets).map((asset) => <fieldset key={asset.id} className={styles.skuGroup}>
        <legend>{asset.role} · {asset.mediaType} · {asset.id.startsWith("new:") ? "unsaved draft" : asset.id}</legend>
        <div className={styles.skuGrid}>
          <label><span>Media type</span><select value={asset.mediaType} onChange={(event) => update(asset.id, { mediaType: event.target.value as ProductAssetMediaType })}>{mediaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>Role</span><select value={asset.role} onChange={(event) => update(asset.id, { role: event.target.value as ProductAssetRole })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label><span>Position</span><input type="number" min="0" step="1" value={asset.position} onChange={(event) => update(asset.id, { position: event.target.valueAsNumber })} /></label>
          <label><span>Source kind</span><select value={asset.source.kind} onChange={(event) => update(asset.id, { source: { kind: event.target.value as PublicAssetSource["kind"], value: asset.source.value } })}>{sourceKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
          <label className={styles.full}><span>Already-public source value</span><input value={asset.source.value} placeholder={asset.source.kind === "url" ? "https://…" : "public-provider:reference"} onChange={(event) => update(asset.id, { source: { ...asset.source, value: event.target.value } })} /></label>
          <label><span>Variant association</span><select value={asset.variantId ?? ""} onChange={(event) => update(asset.id, { variantId: event.target.value || undefined })}><option value="">Product-level asset</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.skuCode}</option>)}</select></label>
          <label><span>Alt / description</span><input value={asset.altText ?? ""} onChange={(event) => update(asset.id, { altText: event.target.value || undefined })} /></label>
          <label><span>Title</span><input value={asset.title ?? ""} onChange={(event) => update(asset.id, { title: event.target.value || undefined })} /></label>
          <label><span>Width</span><input type="number" min="1" step="1" value={asset.width ?? ""} onChange={(event) => update(asset.id, { width: optionalPositiveInteger(event.target.value) })} /></label>
          <label><span>Height</span><input type="number" min="1" step="1" value={asset.height ?? ""} onChange={(event) => update(asset.id, { height: optionalPositiveInteger(event.target.value) })} /></label>
        </div>
        <div className={styles.inlineActions}>
          <button type="button" disabled={activeId === asset.id} onClick={() => void save(asset)}>{activeId === asset.id ? "Saving…" : asset.id.startsWith("new:") ? "Add metadata" : "Save metadata"}</button>
          <button type="button" disabled={activeId === asset.id} className={styles.dangerButton} onClick={() => void remove(asset)}>Remove metadata</button>
        </div>
      </fieldset>)}
      {assets.length === 0 && <p className={styles.assetEmpty}>No public marketing assets are configured for this Product.</p>}
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </section>;
}
