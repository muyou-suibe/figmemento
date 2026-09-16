export const LOCAL_ADMIN_ORDERS_SOURCE_NOTICE = "LOCAL / TEST ONLY" as const;
export const LOCAL_PERSISTENT_ADMIN_ORDERS_SOURCE_NOTICE = "LOCAL / TEST PERSISTENT COMMERCE" as const;

export const ADMIN_ORDERS_PAGE_SIZE = 20 as const;

export const ADMIN_ORDER_FULFILLMENT_FILTERS = [
  "",
  "awaiting_review",
  "photo_review",
  "preview_pending",
  "preview_revision_requested",
  "preview_approved",
  "in_production",
  "quality_check",
  "ready_for_outbound",
  "shipment_created",
  "shipped",
  "delivered",
  "complete",
  "not_applicable",
  "issue",
] as const;

export type AdminOrderFulfillmentFilter = (typeof ADMIN_ORDER_FULFILLMENT_FILTERS)[number];

export const ADMIN_ORDER_PAYMENT_FILTERS = ["", "paid", "unpaid", "failed"] as const;

export type AdminOrderPaymentFilter = (typeof ADMIN_ORDER_PAYMENT_FILTERS)[number];

export type AdminOrderStatus = "pending" | "processing" | "completed" | "cancelled";
export type AdminOrderPaymentStatus = Exclude<AdminOrderPaymentFilter, "">;
export type AdminOrderFulfillmentStatus = Exclude<AdminOrderFulfillmentFilter, "">;
export type AdminOrderTrackingStatus = "not_created" | "pending" | "shipped" | "in_transit" | "delivered";

export interface AdminOrdersQueryInput {
  readonly q?: unknown;
  readonly fulfillment?: unknown;
  readonly payment?: unknown;
  readonly attention?: unknown;
  readonly page?: unknown;
}

export interface AdminOrdersQuery {
  readonly q: string;
  /** Provider-neutral equivalent of the production search-boundary input. */
  readonly searchTerm: string;
  readonly fulfillment: AdminOrderFulfillmentFilter;
  readonly payment: AdminOrderPaymentFilter;
  readonly attentionOnly: boolean;
  readonly page: number;
  readonly pageSize: typeof ADMIN_ORDERS_PAGE_SIZE;
}

export interface AdminOrderCustomerDisplay {
  readonly displayName: string;
  readonly displayEmail: string;
}

export interface AdminOrderCustomizationSummary {
  readonly label: string;
  readonly value: string;
}

export interface AdminOrderPhotoPresentation {
  readonly previewAvailable: false;
  readonly localSyntheticAsset: boolean;
}

export interface AdminOrderLineItem {
  readonly id: string;
  readonly productName: string;
  readonly quantity: number;
  readonly fulfillmentType: "physical" | "digital";
  readonly customizationSummary: readonly AdminOrderCustomizationSummary[];
  readonly photo: AdminOrderPhotoPresentation;
  readonly digitalDeliveryStatus: "not_available_locally" | null;
}

export interface AdminOrderTrackingDisplay {
  readonly carrier: string | null;
  readonly trackingNumber: string | null;
  readonly status: AdminOrderTrackingStatus;
}

export interface AdminOrderStatusHistoryEntry {
  readonly id: string;
  readonly action: string;
  readonly fromValue: string | null;
  readonly toValue: string;
  readonly actor: string;
  readonly createdAt: string;
}

export interface AdminOrderReadModel {
  readonly id: string;
  readonly publicReference: string;
  readonly customer: AdminOrderCustomerDisplay;
  readonly status: AdminOrderStatus;
  readonly paymentStatus: AdminOrderPaymentStatus;
  readonly fulfillmentStatus: AdminOrderFulfillmentStatus;
  readonly tracking: AdminOrderTrackingDisplay;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly couponCode: string | null;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly currency: "USD";
  readonly createdAt: string;
  readonly lineItems: readonly AdminOrderLineItem[];
  readonly statusHistory: readonly AdminOrderStatusHistoryEntry[];
  readonly needsAttention: boolean;
  readonly persistentControl?: {
    readonly fulfillmentId: string;
    readonly fulfillmentVersion: number;
    readonly revisionRequestsUsed: number;
    readonly currentManifestId: string | null;
    readonly currentManifestVersion: number | null;
    readonly approvalDeadlineAt: string | null;
    readonly hasAdminTimeout: boolean;
  } | null;
}

export interface AdminOrdersReadPage {
  readonly sourceNotice: typeof LOCAL_ADMIN_ORDERS_SOURCE_NOTICE | typeof LOCAL_PERSISTENT_ADMIN_ORDERS_SOURCE_NOTICE;
  readonly items: readonly AdminOrderReadModel[];
  readonly query: AdminOrdersQuery;
  readonly page: number;
  readonly pageSize: typeof ADMIN_ORDERS_PAGE_SIZE;
  readonly totalCount: number;
  readonly totalPages: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
}

export interface AdminOrderExportRow {
  readonly publicReference: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly paymentStatus: AdminOrderPaymentStatus;
  readonly fulfillmentStatus: AdminOrderFulfillmentStatus;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly currency: "USD";
  readonly createdAt: string;
}

export type AdminOrdersReadResult<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: "local_admin_orders_unavailable" }
  | { readonly status: "source_failure"; readonly operation: "admin_orders_read" | "admin_orders_export" };

export interface AdminOrdersReadRepository {
  read(query?: AdminOrdersQueryInput): Promise<AdminOrdersReadResult<AdminOrdersReadPage>>;
  readExportRows(query?: AdminOrdersQueryInput): Promise<AdminOrdersReadResult<readonly AdminOrderExportRow[]>>;
}

export type AdminOrderControlId =
  | "order_status_display"
  | "payment_status_display"
  | "fulfillment_status_control"
  | "photo_review_control"
  | "digital_delivery_control"
  | "tracking_control"
  | "cleanup_uploads_control";

export type AdminOrderControlDisposition =
  | "READ_ONLY_DISPLAY"
  | "DISABLED_LOCAL_MODE"
  | "BOUNDED_UNAVAILABLE"
  | "NOT_PRESENT_FOR_FIXTURE"
  | "PRODUCTION_ONLY";

export interface AdminOrderControlDispositionEntry {
  readonly control: AdminOrderControlId;
  readonly disposition: AdminOrderControlDisposition;
  readonly reason: string;
}

export const LOCAL_ADMIN_ORDER_CONTROL_DISPOSITIONS: readonly AdminOrderControlDispositionEntry[] = [
  {
    control: "order_status_display",
    disposition: "READ_ONLY_DISPLAY",
    reason: "Local Orders exposes the synthetic order state as display data only.",
  },
  {
    control: "payment_status_display",
    disposition: "READ_ONLY_DISPLAY",
    reason: "Local payment state is synthetic display data and has no payment mutation.",
  },
  {
    control: "fulfillment_status_control",
    disposition: "DISABLED_LOCAL_MODE",
    reason: "Local Orders does not implement an Order or Fulfillment workflow.",
  },
  {
    control: "photo_review_control",
    disposition: "DISABLED_LOCAL_MODE",
    reason: "Local Orders does not implement production photo review mutations.",
  },
  {
    control: "digital_delivery_control",
    disposition: "BOUNDED_UNAVAILABLE",
    reason: "No local digital-delivery file or mutation is available.",
  },
  {
    control: "tracking_control",
    disposition: "DISABLED_LOCAL_MODE",
    reason: "Local Orders does not implement production tracking mutations.",
  },
  {
    control: "cleanup_uploads_control",
    disposition: "BOUNDED_UNAVAILABLE",
    reason: "Local Orders never accesses or cleans private upload storage.",
  },
] as const;

function isFulfillmentFilter(value: unknown): value is AdminOrderFulfillmentFilter {
  return typeof value === "string" && (ADMIN_ORDER_FULFILLMENT_FILTERS as readonly string[]).includes(value);
}

function isPaymentFilter(value: unknown): value is AdminOrderPaymentFilter {
  return typeof value === "string" && (ADMIN_ORDER_PAYMENT_FILTERS as readonly string[]).includes(value);
}

function positiveInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

function normalizeSearchTerm(value: string): string {
  const unsafeSearchCharacters = new Set(["(", ")", ",", ".", "%"]);
  let result = "";
  for (const character of value) result += unsafeSearchCharacters.has(character) ? " " : character;
  return result;
}

export function normalizeAdminOrdersQuery(input: AdminOrdersQueryInput = {}): AdminOrdersQuery {
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
  const searchTerm = normalizeSearchTerm(q);
  const fulfillment = isFulfillmentFilter(input.fulfillment) ? input.fulfillment : "";
  const payment = isPaymentFilter(input.payment) ? input.payment : "";
  const attentionOnly = input.attention === "1";
  return {
    q,
    searchTerm,
    fulfillment,
    payment,
    attentionOnly,
    page: positiveInteger(input.page),
    pageSize: ADMIN_ORDERS_PAGE_SIZE,
  };
}

function safeExportText(value: string): string {
  const first = value.slice(0, 1);
  return first === "=" || first === "+" || first === "-" || first === "@" ? `'${value}` : value;
}

export function toSafeAdminOrderExportRow(order: AdminOrderReadModel): AdminOrderExportRow {
  return {
    publicReference: safeExportText(order.publicReference),
    customerName: safeExportText(order.customer.displayName),
    customerEmail: safeExportText(order.customer.displayEmail),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
  };
}
