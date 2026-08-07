"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statuses = ["awaiting_payment", "awaiting_review", "in_production", "quality_check", "shipped", "delivered", "issue"] as const;

export function AdminOrderControls({ orderNumber, initialStatus, paymentStatus = "paid" }: { orderNumber: string; initialStatus: string; paymentStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, fulfillmentStatus: status }) });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? "Saved" : result.error || "Save failed");
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return <div className="admin-status-control"><select aria-label={`Fulfillment status for ${orderNumber}`} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => { const disabled = (paymentStatus !== "paid" && ["in_production", "quality_check", "shipped", "delivered"].includes(item)) || (paymentStatus === "paid" && item === "awaiting_payment"); return <option key={item} value={item} disabled={disabled}>{item.replaceAll("_", " ")}{disabled ? " · payment required" : ""}</option>; })}</select><button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save"}</button>{message && <small>{message}</small>}</div>;
}
