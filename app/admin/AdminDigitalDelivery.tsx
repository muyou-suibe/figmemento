"use client";

import { ChangeEvent, useState } from "react";

export function AdminDigitalDelivery({ orderNumber, orderItemId, initialName }: { orderNumber: string; orderItemId: string; initialName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState(initialName ? `Delivered file: ${initialName}` : "");
  const [saving, setSaving] = useState(false);

  async function upload() {
    if (!file) return;
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.set("orderNumber", orderNumber);
    form.set("orderItemId", orderItemId);
    form.set("file", file);
    try {
      const response = await fetch("/api/admin/digital-delivery", { method: "POST", body: form });
      const result = await response.json() as { error?: string; fileName?: string };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setMessage(`Saved: ${result.fileName || file.name}`);
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="admin-digital-delivery"><small>Digital delivery</small><div><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.zip" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)} /><button type="button" onClick={() => void upload()} disabled={!file || saving}>{saving ? "Uploading..." : "Upload"}</button></div>{message && <small>{message}</small>}</div>;
}
