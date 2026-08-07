"use client";

import { useState } from "react";

export function AdminCleanupUploads() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async (dryRun: boolean) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/cleanup-uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun, olderThanHours: 24 }) });
      const result = await response.json() as { candidates?: number; deleted?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Cleanup failed.");
      setMessage(dryRun ? `${result.candidates ?? 0} unused draft(s) older than 24 hours found.` : `${result.deleted ?? 0} unused draft(s) removed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setLoading(false);
    }
  };

  return <section className="admin-cleanup"><div><strong>Temporary uploads</strong><small>Unused drafts older than 24 hours can be safely removed.</small></div><div className="admin-cleanup-actions"><button type="button" onClick={() => void run(true)} disabled={loading}>Scan</button><button type="button" onClick={() => void run(false)} disabled={loading}>Delete unused</button></div>{message && <small role="status">{message}</small>}</section>;
}
