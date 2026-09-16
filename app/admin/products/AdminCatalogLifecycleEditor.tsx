"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CatalogLifecycle } from "../../domain/catalog/index.ts";
import styles from "./admin-products.module.css";

interface AdminCatalogLifecycleEditorProps {
  targetType: "categories" | "products";
  targetId: string;
  lifecycle: CatalogLifecycle;
}

interface MutationIssue {
  path: string;
  message: string;
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

function returnedLifecycle(value: unknown): CatalogLifecycle | null {
  if (typeof value !== "object" || value === null || !("value" in value)) return null;
  const result = value.value;
  if (typeof result !== "object" || result === null || !("currentLifecycle" in result)) return null;
  return result.currentLifecycle === "draft"
    || result.currentLifecycle === "published"
    || result.currentLifecycle === "retired"
    ? result.currentLifecycle
    : null;
}

export function AdminCatalogLifecycleEditor({
  targetType,
  targetId,
  lifecycle: initialLifecycle,
}: AdminCatalogLifecycleEditorProps) {
  const router = useRouter();
  const [lifecycle, setLifecycle] = useState(initialLifecycle);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function transition(action: "publish" | "unpublish" | "retire") {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/catalog/${targetType}/${encodeURIComponent(targetId)}/lifecycle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = mutationIssues(result);
        setMessage(issues.length > 0
          ? issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
          : "The lifecycle update could not be applied.");
        return;
      }
      const returned = returnedLifecycle(result);
      if (returned) setLifecycle(returned);
      setMessage(returned === lifecycle ? "Lifecycle was already up to date." : "Lifecycle updated and audited.");
      router.refresh();
    } catch {
      setMessage("The lifecycle service is temporarily unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.lifecycleSection}>
    <div>
      <b>Publication lifecycle</b>
      <span>{lifecycle}</span>
    </div>
    <div className={styles.lifecycleActions}>
      {lifecycle !== "published" && <button type="button" disabled={saving} onClick={() => void transition("publish")}>Publish</button>}
      {lifecycle !== "draft" && <button type="button" disabled={saving} onClick={() => void transition("unpublish")}>Unpublish</button>}
      {lifecycle !== "retired" && <button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void transition("retire")}>Retire</button>}
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </section>;
}
