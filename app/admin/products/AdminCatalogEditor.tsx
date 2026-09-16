"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CatalogProduct,
  Category,
  ProductOption,
  ProductOptionValue,
  ProductAsset,
  ProductFulfillmentConfig,
  ProductVariant,
} from "../../domain/catalog/index.ts";
import { AdminSkuGraphEditor } from "./AdminSkuGraphEditor";
import { AdminProductAssetEditor } from "./AdminProductAssetEditor";
import { AdminProductFulfillmentEditor } from "./AdminProductFulfillmentEditor";
import { AdminCatalogLifecycleEditor } from "./AdminCatalogLifecycleEditor";
import { AdminCustomizationFieldEditor } from "./AdminCustomizationFieldEditor";
import styles from "./admin-products.module.css";

interface AdminCatalogEditorProps {
  categories: readonly Category[];
  products: readonly CatalogProduct[];
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  assets: readonly ProductAsset[];
  fulfillmentConfigs: readonly ProductFulfillmentConfig[];
}

interface MutationIssue {
  path: string;
  message: string;
}

function optionalField(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

function seoFromForm(form: FormData) {
  return {
    ...(optionalField(form, "seoTitle") ? { title: optionalField(form, "seoTitle") } : {}),
    ...(optionalField(form, "seoDescription") ? { description: optionalField(form, "seoDescription") } : {}),
    ...(optionalField(form, "canonicalPath") ? { canonicalPath: optionalField(form, "canonicalPath") } : {}),
    ...(optionalField(form, "imageAssetId") ? { imageAssetId: optionalField(form, "imageAssetId") } : {}),
  };
}

function useCatalogMutation() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(resource: "categories" | "products", id: string, body: unknown) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/catalog/${resource}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = typeof result === "object" && result !== null && "issues" in result && Array.isArray(result.issues)
          ? result.issues.filter((issue): issue is MutationIssue => (
              typeof issue === "object" &&
              issue !== null &&
              "path" in issue &&
              typeof issue.path === "string" &&
              "message" in issue &&
              typeof issue.message === "string"
            ))
          : [];
        setMessage(issues.length > 0
          ? issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
          : "The catalog update could not be saved.");
        return;
      }
      setMessage("Saved.");
      router.refresh();
    } catch {
      setMessage("The catalog update is temporarily unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return { saving, message, submit };
}

function CategoryEditor({ category }: { category: Category }) {
  const mutation = useCatalogMutation();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutation.submit("categories", category.id, {
      kind: "save_category",
      payload: {
        id: category.id,
        slug: String(form.get("slug") ?? ""),
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        seo: seoFromForm(form),
        lifecycle: category.lifecycle,
      },
    });
  }

  return (
    <details className={styles.editorCard}>
      <summary><span>{category.name}</span><small>{category.lifecycle} · /{category.slug}</small></summary>
      <AdminCatalogLifecycleEditor targetType="categories" targetId={category.id} lifecycle={category.lifecycle} />
      <form onSubmit={onSubmit} className={styles.form}>
        <ReadOnlyIdentity id={category.id} lifecycle={category.lifecycle} />
        <TextField name="slug" label="Slug" defaultValue={category.slug} required />
        <TextField name="name" label="Name" defaultValue={category.name} required />
        <TextArea name="description" label="Description" defaultValue={category.description} />
        <SeoFields seo={category.seo} />
        <button type="submit" disabled={mutation.saving}>{mutation.saving ? "Saving…" : "Save category content"}</button>
        {mutation.message && <p role="status" className={styles.message}>{mutation.message}</p>}
      </form>
    </details>
  );
}

function ProductEditor({
  product,
  categories,
  options,
  optionValues,
  variants,
  assets,
  fulfillmentConfig,
}: {
  product: CatalogProduct;
  categories: readonly Category[];
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  assets: readonly ProductAsset[];
  fulfillmentConfig?: ProductFulfillmentConfig;
}) {
  const mutation = useCatalogMutation();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutation.submit("products", product.id, {
      kind: "save_product",
      payload: {
        id: product.id,
        slug: String(form.get("slug") ?? ""),
        categoryId: String(form.get("categoryId") ?? ""),
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        seo: seoFromForm(form),
        lifecycle: product.lifecycle,
      },
    });
  }

  const category = categories.find((candidate) => candidate.id === product.categoryId);
  return (
    <details className={styles.editorCard}>
      <summary>
        <span>{product.name}</span>
        <small>{product.lifecycle} · {category?.name ?? "Missing category"} · /{product.slug}</small>
      </summary>
      <AdminCatalogLifecycleEditor targetType="products" targetId={product.id} lifecycle={product.lifecycle} />
      <form onSubmit={onSubmit} className={styles.form}>
        <ReadOnlyIdentity id={product.id} lifecycle={product.lifecycle} />
        <TextField name="slug" label="Slug" defaultValue={product.slug} required />
        <TextField name="name" label="Name" defaultValue={product.name} required />
        <label><span>Category</span><select name="categoryId" defaultValue={product.categoryId} required>{categories.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.lifecycle})</option>)}</select></label>
        <TextArea name="description" label="Description" defaultValue={product.description} />
        <SeoFields seo={product.seo} />
        <button type="submit" disabled={mutation.saving}>{mutation.saving ? "Saving…" : "Save product content"}</button>
        {mutation.message && <p role="status" className={styles.message}>{mutation.message}</p>}
      </form>
      <AdminSkuGraphEditor
        product={product}
        options={options}
        optionValues={optionValues}
        variants={variants}
      />
      <AdminProductAssetEditor product={product} assets={assets} variants={variants} />
      <AdminProductFulfillmentEditor product={product} config={fulfillmentConfig} />
      <AdminCustomizationFieldEditor product={product} />
    </details>
  );
}

function ReadOnlyIdentity({ id, lifecycle }: { id: string; lifecycle: string }) {
  return <div className={styles.readOnly}><span><b>Stable ID</b>{id}</span><span><b>Lifecycle</b>{lifecycle} · transitions are managed separately</span></div>;
}

function TextField({ name, label, defaultValue, required = false }: { name: string; label: string; defaultValue?: string; required?: boolean }) {
  return <label><span>{label}</span><input name={name} defaultValue={defaultValue} required={required} /></label>;
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return <label className={styles.full}><span>{label}</span><textarea name={name} defaultValue={defaultValue} required rows={5} /></label>;
}

function SeoFields({ seo }: { seo: Category["seo"] }) {
  return <fieldset className={styles.seo}><legend>SEO metadata</legend><TextField name="seoTitle" label="SEO title" defaultValue={seo.title} /><TextField name="canonicalPath" label="Canonical path" defaultValue={seo.canonicalPath} /><label className={styles.full}><span>SEO description</span><textarea name="seoDescription" defaultValue={seo.description} rows={3} /></label><TextField name="imageAssetId" label="SEO image asset ID" defaultValue={seo.imageAssetId} /></fieldset>;
}

export function AdminCatalogEditor({ categories, products, options, optionValues, variants, assets, fulfillmentConfigs }: AdminCatalogEditorProps) {
  return <div className={`${styles.workspace} ${styles.fusionAdminWorkspace}`}>
    <section><div className={styles.sectionHeading}><div><p className="eyebrow">Single-level taxonomy</p><h2>Categories</h2></div><span>{categories.length}</span></div><div className={styles.list}>{categories.map((category) => <CategoryEditor key={category.id} category={category} />)}</div></section>
    <section><div className={styles.sectionHeading}><div><p className="eyebrow">Catalog records</p><h2>Products</h2></div><span>{products.length}</span></div><div className={styles.list}>{products.map((product) => <ProductEditor key={product.id} product={product} categories={categories} options={options.filter((item) => item.productId === product.id)} optionValues={optionValues.filter((item) => item.productId === product.id)} variants={variants.filter((item) => item.productId === product.id)} assets={assets.filter((item) => item.productId === product.id)} fulfillmentConfig={fulfillmentConfigs.find((item) => item.productId === product.id)} />)}</div></section>
  </div>;
}
