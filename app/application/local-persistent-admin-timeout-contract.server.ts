import { isRecord } from '../domain/catalog/validation.ts';

// Independently approved Task 7.6 policy, not inherited from customer notes.
export const ADMIN_TIMEOUT_REASON_MAX_UTF16 = 500;
export const PREVIEW_APPROVAL_TIMEOUT_SECONDS = 259200;
export function parsePersistentAdminTimeout(raw: unknown) {
  if (!isRecord(raw) || Object.keys(raw).some(key => ![
    'fulfillmentActionId', 'actionKind', 'expectedAggregateVersion',
    'expectedPreviewVersion', 'manifestId', 'reason',
  ].includes(key))) return null;
  if (raw.actionKind !== 'operator_timeout' || typeof raw.fulfillmentActionId !== 'string'
    || !/^[A-Za-z0-9_-]{16,200}$/.test(raw.fulfillmentActionId)
    || typeof raw.expectedAggregateVersion !== 'number' || !Number.isSafeInteger(raw.expectedAggregateVersion)
    || raw.expectedAggregateVersion < 1 || typeof raw.expectedPreviewVersion !== 'number'
    || ![1, 2, 3].includes(raw.expectedPreviewVersion) || typeof raw.manifestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw.manifestId)
    || typeof raw.reason !== 'string') return null;
  const reason = raw.reason.trim();
  if (!reason || reason.length > ADMIN_TIMEOUT_REASON_MAX_UTF16) return null;
  return { actionKind: 'operator_timeout' as const, fulfillmentActionId: raw.fulfillmentActionId,
    expectedAggregateVersion: raw.expectedAggregateVersion, expectedPreviewVersion: raw.expectedPreviewVersion,
    manifestId: raw.manifestId, reason };
}
