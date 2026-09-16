import {
  ADMIN_ORDERS_PAGE_SIZE,
  LOCAL_PERSISTENT_ADMIN_ORDERS_SOURCE_NOTICE,
  normalizeAdminOrdersQuery,
  toSafeAdminOrderExportRow,
  type AdminOrderFulfillmentStatus,
  type AdminOrderReadModel,
  type AdminOrdersQueryInput,
  type AdminOrdersReadPage,
  type AdminOrdersReadRepository,
  type AdminOrdersReadResult,
  type AdminOrderExportRow,
} from "../../application/admin-orders-read-repository.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import type { RuntimeEnvironment } from "../../config/server.ts";
import { isRecord } from "../../domain/catalog/validation.ts";
import { createLocalPersistentSupabaseAdapter } from "../local-commerce/local-persistent-supabase-adapter.server.ts";

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const cents = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const fulfillmentStates = new Set<string>([
  "awaiting_review", "photo_review", "preview_pending", "preview_revision_requested",
  "preview_approved", "in_production", "quality_check", "ready_for_outbound",
  "shipment_created", "shipped", "delivered", "complete", "not_applicable", "issue",
]);

type PersistentReadResult = {
  readonly status: "found";
  readonly value: { readonly page: number; readonly pageSize: number; readonly totalCount: number; readonly items: readonly unknown[] };
} | { readonly status: "unavailable" };

function parseLineItem(raw: unknown) {
  if (!isRecord(raw) || !uuid(raw.id) || typeof raw.productName !== "string" || !raw.productName.trim()
    || typeof raw.skuCode !== "string" || !raw.skuCode.trim()
    || !Number.isSafeInteger(raw.quantity) || Number(raw.quantity) < 1
    || (raw.fulfillmentType !== "physical" && raw.fulfillmentType !== "digital")
    || !Number.isSafeInteger(raw.configurationRevision) || Number(raw.configurationRevision) < 1) return null;
  return {
    id: raw.id,
    productName: raw.productName,
    quantity: Number(raw.quantity),
    fulfillmentType: raw.fulfillmentType,
    customizationSummary: [
      { label: "SKU", value: raw.skuCode },
      { label: "Configuration revision", value: String(raw.configurationRevision) },
    ],
    photo: { previewAvailable: false as const, localSyntheticAsset: false },
    digitalDeliveryStatus: raw.fulfillmentType === "digital" ? "not_available_locally" as const : null,
  };
}

function parseOrder(raw: unknown): AdminOrderReadModel | null {
  if (!isRecord(raw) || ["ownerId", "capability", "sessionHash", "passwordHash", "storagePath", "objectPath", "signedUrl"].some((key) => key in raw)
    || !uuid(raw.orderId) || typeof raw.publicReference !== "string"
    || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(raw.publicReference) || !timestamp(raw.createdAt)
    || typeof raw.orderLifecycle !== "string" || !["pending_payment", "paid", "payment_failed", "cancelled", "closed"].includes(raw.orderLifecycle)
    || !Number.isSafeInteger(raw.orderVersion) || Number(raw.orderVersion) < 1
    || (raw.paymentStatus !== "paid" && raw.paymentStatus !== "unpaid" && raw.paymentStatus !== "failed")
    || typeof raw.fulfillmentStatus !== "string" || !fulfillmentStates.has(raw.fulfillmentStatus)
    || !isRecord(raw.customer) || !isRecord(raw.amounts) || !Array.isArray(raw.lineItems)) return null;
  const items = raw.lineItems.map(parseLineItem);
  if (items.some((item) => item === null)) return null;
  const displayName = typeof raw.customer.displayName === "string" && raw.customer.displayName.trim()
    ? raw.customer.displayName.trim().slice(0, 160) : "Local customer";
  const displayEmail = typeof raw.customer.displayEmail === "string" && raw.customer.displayEmail.includes("@")
    ? raw.customer.displayEmail.slice(0, 254) : "Not provided";
  if (!cents(raw.amounts.subtotalCents) || !cents(raw.amounts.discountCents)
    || !cents(raw.amounts.shippingCents) || !cents(raw.amounts.totalCents)
    || raw.amounts.currency !== "USD") return null;
  let persistentControl: AdminOrderReadModel["persistentControl"] = null;
  if (raw.fulfillment !== null) {
    if (!isRecord(raw.fulfillment) || !uuid(raw.fulfillment.id)
      || !Number.isSafeInteger(raw.fulfillment.version) || Number(raw.fulfillment.version) < 1
      || !Number.isSafeInteger(raw.fulfillment.revisionRequestsUsed) || Number(raw.fulfillment.revisionRequestsUsed) < 0
      || (raw.fulfillment.currentManifestId !== null && !uuid(raw.fulfillment.currentManifestId))
      || (raw.fulfillment.currentManifestVersion !== null && (!Number.isSafeInteger(raw.fulfillment.currentManifestVersion) || ![1, 2, 3].includes(Number(raw.fulfillment.currentManifestVersion))))
      || (raw.fulfillment.approvalDeadlineAt !== null && !timestamp(raw.fulfillment.approvalDeadlineAt))
      || typeof raw.fulfillment.hasAdminTimeout !== "boolean") return null;
    persistentControl = {
      fulfillmentId: raw.fulfillment.id,
      fulfillmentVersion: Number(raw.fulfillment.version),
      revisionRequestsUsed: Number(raw.fulfillment.revisionRequestsUsed),
      currentManifestId: raw.fulfillment.currentManifestId,
      currentManifestVersion: raw.fulfillment.currentManifestVersion === null ? null : Number(raw.fulfillment.currentManifestVersion),
      approvalDeadlineAt: raw.fulfillment.approvalDeadlineAt,
      hasAdminTimeout: raw.fulfillment.hasAdminTimeout,
    };
  }
  const fulfillmentStatus = raw.fulfillmentStatus as AdminOrderFulfillmentStatus;
  return {
    id: raw.orderId,
    publicReference: raw.publicReference,
    customer: { displayName, displayEmail },
    status: raw.orderLifecycle === "cancelled" ? "cancelled" : raw.orderLifecycle === "closed" ? "completed" : raw.orderLifecycle === "pending_payment" ? "pending" : "processing",
    paymentStatus: raw.paymentStatus,
    fulfillmentStatus,
    tracking: { carrier: null, trackingNumber: null, status: "not_created" },
    subtotalCents: raw.amounts.subtotalCents,
    discountCents: raw.amounts.discountCents,
    couponCode: typeof raw.amounts.couponCode === "string" ? raw.amounts.couponCode.slice(0, 80) : null,
    shippingCents: raw.amounts.shippingCents,
    totalCents: raw.amounts.totalCents,
    currency: "USD",
    createdAt: raw.createdAt,
    lineItems: items as AdminOrderReadModel["lineItems"],
    statusHistory: [],
    needsAttention: ["awaiting_review", "photo_review", "preview_pending", "preview_revision_requested", "quality_check", "issue"].includes(fulfillmentStatus),
    persistentControl,
  };
}

export function createLocalPersistentAdminOrdersReadRepository(
  environment: RuntimeEnvironment = process.env,
  dependencies: { readonly connect?: typeof createLocalPersistentSupabaseAdapter } = {},
): AdminOrdersReadRepository {
  const readPage = async (input: AdminOrdersQueryInput = {}): Promise<AdminOrdersReadResult<AdminOrdersReadPage>> => {
    const query = normalizeAdminOrdersQuery(input);
    try {
      const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin"] });
      if (composition.status !== "ready") return { status: "unavailable", reason: "local_admin_orders_unavailable" };
      const connection = await (dependencies.connect ?? createLocalPersistentSupabaseAdapter)(environment);
      if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
        || connection.composition.markerDigest !== composition.value.markerDigest) {
        return { status: "unavailable", reason: "local_admin_orders_unavailable" };
      }
      const result = await connection.adapter.callRestrictedRpc<PersistentReadResult>("admin_orders_read", {
        p_project_id: composition.value.projectId,
        p_marker_digest: composition.value.markerDigest,
        p_actor_kind: "admin",
        p_actor_id: "configured-admin",
        p_search: query.searchTerm,
        p_fulfillment: query.fulfillment,
        p_payment: query.payment,
        p_attention: query.attentionOnly,
        p_page: query.page,
        p_page_size: query.pageSize,
      });
      if (result.status !== "found" || result.value.status !== "found" || !isRecord(result.value.value)
        || !Array.isArray(result.value.value.items) || !Number.isSafeInteger(result.value.value.totalCount)
        || result.value.value.totalCount < 0 || result.value.value.page !== query.page
        || result.value.value.pageSize !== ADMIN_ORDERS_PAGE_SIZE) {
        return { status: "unavailable", reason: "local_admin_orders_unavailable" };
      }
      const items = result.value.value.items.map(parseOrder);
      if (items.some((item) => item === null)) return { status: "source_failure", operation: "admin_orders_read" };
      const totalCount = Number(result.value.value.totalCount);
      const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_ORDERS_PAGE_SIZE));
      return { status: "found", value: {
        sourceNotice: LOCAL_PERSISTENT_ADMIN_ORDERS_SOURCE_NOTICE,
        items: items as readonly AdminOrderReadModel[], query, page: query.page,
        pageSize: ADMIN_ORDERS_PAGE_SIZE, totalCount, totalPages,
        hasPreviousPage: query.page > 1, hasNextPage: query.page < totalPages,
      } };
    } catch {
      return { status: "unavailable", reason: "local_admin_orders_unavailable" };
    }
  };
  return {
    read: readPage,
    async readExportRows(input = {}) {
      const page = await readPage({ ...input, page: 1 });
      if (page.status !== "found") return page.status === "unavailable" ? page : { status: "source_failure", operation: "admin_orders_export" };
      if (page.value.totalCount > ADMIN_ORDERS_PAGE_SIZE) return { status: "unavailable", reason: "local_admin_orders_unavailable" };
      return { status: "found", value: page.value.items.map(toSafeAdminOrderExportRow) as readonly AdminOrderExportRow[] };
    },
  };
}
