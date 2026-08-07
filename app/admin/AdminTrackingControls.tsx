"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminTrackingControls({ orderNumber, initialCarrier, initialNumber, initialStatus }: { orderNumber: string; initialCarrier: string | null; initialNumber: string | null; initialStatus: string | null }) {
  const [carrier, setCarrier] = useState(initialCarrier || "");
  const [number, setNumber] = useState(initialNumber || "");
  const [trackingStatus, setTrackingStatus] = useState(initialStatus || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, trackingCarrier: carrier, trackingNumber: number, trackingStatus }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Saved" : result.error || "Save failed");
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return <div className="admin-tracking-control"><p>Tracking details</p><div><input aria-label={`Tracking carrier for ${orderNumber}`} value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Carrier" maxLength={80} /><input aria-label={`Tracking number for ${orderNumber}`} value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Tracking number" maxLength={120} /><input aria-label={`Tracking status for ${orderNumber}`} value={trackingStatus} onChange={(event) => setTrackingStatus(event.target.value)} placeholder="Status / ETA" maxLength={120} /><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>{message && <small>{message}</small>}</div>;
}
