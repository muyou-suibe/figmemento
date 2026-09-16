"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PersistentControl {
  readonly fulfillmentVersion: number;
  readonly revisionRequestsUsed: number;
  readonly currentManifestId: string | null;
  readonly currentManifestVersion: number | null;
  readonly approvalDeadlineAt: string | null;
  readonly hasAdminTimeout: boolean;
}

function actionId(): string {
  return `admin_timeout_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function AdminPersistentOrderControls({
  publicReference,
  control,
}: {
  readonly publicReference: string;
  readonly control: PersistentControl | null;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const timeoutReady = control?.currentManifestId && control.currentManifestVersion && control.approvalDeadlineAt;

  async function confirmTimeout() {
    if (!control?.currentManifestId || !control.currentManifestVersion) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/local-fulfillment/admin/${encodeURIComponent(publicReference)}/timeout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fulfillmentActionId: actionId(),
        actionKind: "operator_timeout",
        expectedAggregateVersion: control.fulfillmentVersion,
        expectedPreviewVersion: control.currentManifestVersion,
        manifestId: control.currentManifestId,
        reason,
      }),
    });
    const result = await response.json().catch(() => null) as { status?: string } | null;
    setMessage(response.ok ? "Timeout confirmation recorded." : result?.status === "conflict" ? "The current preview changed. Refresh and try again." : "Timeout confirmation unavailable.");
    setSaving(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="admin-status-control" aria-label={`Persistent controls for ${publicReference}`}>
      <p><strong>LOCAL / TEST PERSISTENT</strong> — controls use canonical commerce commands.</p>
      <p>{control ? `Fulfillment version ${control.fulfillmentVersion} · revisions ${control.revisionRequestsUsed ?? 0}/2` : "Fulfillment has not been admitted."}</p>
      {control?.hasAdminTimeout ? <p>Signed Admin timeout confirmation is recorded for the current workflow.</p> : timeoutReady ? <>
        <label>
          <span>Timeout confirmation reason</span>
          <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={() => void confirmTimeout()} disabled={saving || reason.trim().length === 0}>
          {saving ? "Confirming…" : "Confirm current preview timeout"}
        </button>
      </> : <p>Timeout confirmation is unavailable until a current manifest and server-owned deadline exist.</p>}
      <button type="button" disabled aria-disabled="true">Other persistent controls are not adapted in Task 8.2</button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
