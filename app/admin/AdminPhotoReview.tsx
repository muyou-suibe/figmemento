"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statuses = ["pending", "approved", "needs_reupload", "rejected"] as const;

export function AdminPhotoReview({ orderNumber, orderItemId, initialStatus = "pending" }: { orderNumber: string; orderItemId: string; initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, orderItemId, photoReviewStatus: status }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Saved" : result.error || "Save failed");
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return <span className="admin-photo-review"><select aria-label={`Photo review for ${orderNumber}`} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "..." : "Save"}</button>{message && <small>{message}</small>}</span>;
}
