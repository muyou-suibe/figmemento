import {
  LOCAL_ADMIN_ORDERS_SOURCE_NOTICE,
  type AdminOrderCustomizationSummary,
  type AdminOrderExportRow,
  type AdminOrderFulfillmentStatus,
  type AdminOrderLineItem,
  type AdminOrderReadModel,
  type AdminOrdersQuery,
  type AdminOrdersQueryInput,
  type AdminOrdersReadPage,
  type AdminOrdersReadRepository,
  type AdminOrdersReadResult,
  normalizeAdminOrdersQuery,
  toSafeAdminOrderExportRow,
} from "../../application/admin-orders-read-repository.ts";

export type LocalAdminOrdersFailure = "unavailable" | "source_failure";

export interface LocalAdminOrdersReadRepositoryOptions {
  readonly fixtures?: readonly AdminOrderReadModel[];
  readonly failure?: LocalAdminOrdersFailure;
}

const FIXTURE_CREATED_AT = [
  "2026-08-28T08:00:00.000Z",
  "2026-08-28T08:15:00.000Z",
  "2026-08-28T08:30:00.000Z",
  "2026-08-28T08:45:00.000Z",
  "2026-08-28T09:00:00.000Z",
  "2026-08-28T09:15:00.000Z",
  "2026-08-28T09:30:00.000Z",
  "2026-08-28T09:45:00.000Z",
  "2026-08-28T10:00:00.000Z",
  "2026-08-28T10:15:00.000Z",
  "2026-08-28T10:30:00.000Z",
  "2026-08-28T10:45:00.000Z",
  "2026-08-28T11:00:00.000Z",
  "2026-08-28T11:15:00.000Z",
  "2026-08-28T11:30:00.000Z",
  "2026-08-28T11:45:00.000Z",
  "2026-08-28T12:00:00.000Z",
  "2026-08-28T12:15:00.000Z",
  "2026-08-28T12:30:00.000Z",
  "2026-08-28T12:45:00.000Z",
  "2026-08-28T13:00:00.000Z",
  "2026-08-28T13:15:00.000Z",
  "2026-08-28T13:30:00.000Z",
  "2026-08-28T13:45:00.000Z",
] as const;

const SYNTHETIC_PHOTO: AdminOrderLineItem["photo"] = {
  previewAvailable: false,
  localSyntheticAsset: true,
};

function summary(label: string, value: string): AdminOrderCustomizationSummary {
  return { label, value };
}

function lineItem(
  id: string,
  productName: string,
  quantity: number,
  fulfillmentType: "physical" | "digital",
  customizationSummary: readonly AdminOrderCustomizationSummary[],
): AdminOrderLineItem {
  return {
    id,
    productName,
    quantity,
    fulfillmentType,
    customizationSummary,
    photo: SYNTHETIC_PHOTO,
    digitalDeliveryStatus: fulfillmentType === "digital" ? "not_available_locally" : null,
  };
}

function fixtureOrder(
  sequence: number,
  values: Pick<AdminOrderReadModel, "status" | "paymentStatus" | "fulfillmentStatus" | "tracking" | "needsAttention"> & {
    readonly lineItems: readonly AdminOrderLineItem[];
    readonly totalCents: number;
    readonly discountCents?: number;
    readonly shippingCents?: number;
    readonly couponCode?: string | null;
    readonly publicReference?: string;
  },
): AdminOrderReadModel {
  const id = `local-admin-order-${String(sequence).padStart(3, "0")}`;
  const subtotalCents = values.totalCents - (values.shippingCents ?? 0) + (values.discountCents ?? 0);
  const previousState = values.fulfillmentStatus === "awaiting_review" ? null : "awaiting_review";
  return {
    id,
    publicReference: values.publicReference ?? `LOCAL-TEST-ORDER-${String(sequence).padStart(3, "0")}`,
    customer: {
      displayName: `Local Test Customer ${String(sequence).padStart(2, "0")}`,
      displayEmail: `customer-${String(sequence).padStart(2, "0")}@example.test`,
    },
    status: values.status,
    paymentStatus: values.paymentStatus,
    fulfillmentStatus: values.fulfillmentStatus,
    tracking: values.tracking,
    subtotalCents,
    discountCents: values.discountCents ?? 0,
    couponCode: values.couponCode ?? null,
    shippingCents: values.shippingCents ?? 0,
    totalCents: values.totalCents,
    currency: "USD",
    createdAt: FIXTURE_CREATED_AT[sequence - 1],
    lineItems: values.lineItems,
    statusHistory: [
      {
        id: `${id}-history-1`,
        action: "fixture_created",
        fromValue: null,
        toValue: previousState ?? values.fulfillmentStatus,
        actor: "local_fixture",
        createdAt: FIXTURE_CREATED_AT[sequence - 1],
      },
    ],
    needsAttention: values.needsAttention,
  };
}

export function createLocalAdminOrdersFixtures(): readonly AdminOrderReadModel[] {
  const couplePhoto = [
    summary("Reference image", "Synthetic local preview; private asset access is unavailable."),
    summary("Gift note", "A small keepsake for a meaningful shared moment."),
  ];
  const longCopy = "Synthetic long customization copy for wrapping acceptance: this local-only note represents a long customer-facing description without storing real customer content or an upload locator.";
  const base = [
    fixtureOrder(1, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "awaiting_review",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: true,
      totalCents: 8990, lineItems: [lineItem("local-admin-line-001-1", "Custom Couple Figure", 1, "physical", couplePhoto)],
    }),
    fixtureOrder(2, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "in_production",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: false,
      totalCents: 6990, lineItems: [lineItem("local-admin-line-002-1", "Custom Glass Light Picture", 1, "physical", [summary("Finish", "Warm glass light")])],
    }),
    fixtureOrder(3, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "quality_check",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: true,
      totalCents: 10990, lineItems: [lineItem("local-admin-line-003-1", "Pet Portrait Figurine", 1, "physical", [summary("Reference image", "Synthetic local preview; no private locator")])],
    }),
    fixtureOrder(4, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "shipped",
      tracking: { carrier: "Local Test Courier", trackingNumber: "LOCAL-TEST-TRACK-004", status: "shipped" }, needsAttention: false,
      totalCents: 4590, lineItems: [lineItem("local-admin-line-004-1", "Photo Brick Figure", 1, "physical", [summary("Size", "Standard")])],
    }),
    fixtureOrder(5, {
      status: "completed", paymentStatus: "paid", fulfillmentStatus: "delivered",
      tracking: { carrier: "Local Test Courier", trackingNumber: "LOCAL-TEST-TRACK-005", status: "delivered" }, needsAttention: false,
      totalCents: 3990, lineItems: [lineItem("local-admin-line-005-1", "Photo to Mini Figure", 1, "physical", [summary("Size", "Mini")])],
    }),
    fixtureOrder(6, {
      status: "pending", paymentStatus: "unpaid", fulfillmentStatus: "awaiting_review",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: false,
      totalCents: 2490, lineItems: [lineItem("local-admin-line-006-1", "Custom Photo Puzzle", 1, "physical", [summary("Pieces", "500")])],
    }),
    fixtureOrder(7, {
      status: "cancelled", paymentStatus: "failed", fulfillmentStatus: "issue",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: true,
      totalCents: 2790, lineItems: [lineItem("local-admin-line-007-1", "Custom Pet Portrait", 1, "physical", [summary("Issue", "Synthetic payment failure display")])],
    }),
    fixtureOrder(8, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "awaiting_review",
      tracking: { carrier: null, trackingNumber: null, status: "pending" }, needsAttention: true,
      totalCents: 3990, lineItems: [lineItem("local-admin-line-008-1", "Custom Glass Light Picture", 1, "physical", couplePhoto)],
    }),
    fixtureOrder(9, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "in_production",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: false,
      totalCents: 990, lineItems: [lineItem("local-admin-line-009-1", "AI Illustrated Portrait", 1, "digital", [summary("Delivery", "Synthetic digital display only")])],
    }),
    fixtureOrder(10, {
      status: "processing", paymentStatus: "paid", fulfillmentStatus: "quality_check",
      tracking: { carrier: null, trackingNumber: null, status: "not_created" }, needsAttention: true,
      totalCents: 1290, discountCents: 100, shippingCents: 500, couponCode: "LOCAL-TEST-SAVE",
      publicReference: "LOCAL-TEST-ORDER-WITH-A-DELIBERATELY-LONG-REFERENCE-FOR-WRAPPING-ACCEPTANCE-010",
      lineItems: [lineItem("local-admin-line-010-1", "Custom Product With A Deliberately Long Name For Wrapping Acceptance", 2, "physical", [summary("Customization note", longCopy), summary("Reference image", "Synthetic local preview; private storage is never read")])],
    }),
    ...Array.from({ length: 14 }, (_, offset) => {
      const sequence = offset + 11;
      const status: AdminOrderFulfillmentStatus = sequence % 3 === 0 ? "shipped" : sequence % 3 === 1 ? "awaiting_review" : "in_production";
      return fixtureOrder(sequence, {
        status: status === "shipped" ? "completed" : "processing",
        paymentStatus: "paid",
        fulfillmentStatus: status,
        tracking: status === "shipped"
          ? { carrier: "Local Test Courier", trackingNumber: `LOCAL-TEST-TRACK-${String(sequence).padStart(3, "0")}`, status: "in_transit" }
          : { carrier: null, trackingNumber: null, status: "not_created" },
        needsAttention: status === "awaiting_review",
        totalCents: 1990 + sequence * 10,
        lineItems: [lineItem(`local-admin-line-${String(sequence).padStart(3, "0")}-1`, "Synthetic Local Gift", 1, "physical", [summary("Mode", "Local fixture")])],
      });
    }),
  ];
  return base;
}

function cloneOrder(order: AdminOrderReadModel): AdminOrderReadModel {
  return {
    ...order,
    customer: { ...order.customer },
    tracking: { ...order.tracking },
    lineItems: order.lineItems.map((item) => ({
      ...item,
      photo: { ...item.photo },
      customizationSummary: item.customizationSummary.map((entry) => ({ ...entry })),
    })),
    statusHistory: order.statusHistory.map((entry) => ({ ...entry })),
  };
}

const ATTENTION_FULFILLMENT_STATUSES: readonly AdminOrderFulfillmentStatus[] = ["awaiting_review", "quality_check", "issue"];

function matchesQuery(order: AdminOrderReadModel, query: AdminOrdersQuery): boolean {
  const search = query.searchTerm.toLowerCase();
  const matchesSearch = search === ""
    || order.publicReference.toLowerCase().includes(search)
    || order.customer.displayEmail.toLowerCase().includes(search);
  const matchesFulfillment = query.fulfillment === "" || order.fulfillmentStatus === query.fulfillment;
  const matchesPayment = query.payment === "" || order.paymentStatus === query.payment;
  const matchesAttention = !query.attentionOnly || ATTENTION_FULFILLMENT_STATUSES.includes(order.fulfillmentStatus);
  return matchesSearch && matchesFulfillment && matchesPayment && matchesAttention;
}

export class LocalAdminOrdersReadRepository implements AdminOrdersReadRepository {
  private readonly fixtures: readonly AdminOrderReadModel[];
  private readonly failure: LocalAdminOrdersFailure | undefined;

  constructor(options: LocalAdminOrdersReadRepositoryOptions = {}) {
    this.fixtures = (options.fixtures ?? createLocalAdminOrdersFixtures()).map(cloneOrder);
    this.failure = options.failure;
  }

  async read(queryInput: AdminOrdersQueryInput = {}): Promise<AdminOrdersReadResult<AdminOrdersReadPage>> {
    if (this.failure === "unavailable") return { status: "unavailable", reason: "local_admin_orders_unavailable" };
    if (this.failure === "source_failure") return { status: "source_failure", operation: "admin_orders_read" };

    const query = normalizeAdminOrdersQuery(queryInput);
    const filtered = this.fixtures.filter((order) => matchesQuery(order, query));
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    const items = offset >= totalCount ? [] : filtered.slice(offset, offset + query.pageSize).map(cloneOrder);
    return {
      status: "found",
      value: {
        sourceNotice: LOCAL_ADMIN_ORDERS_SOURCE_NOTICE,
        items,
        query,
        page: query.page,
        pageSize: query.pageSize,
        totalCount,
        totalPages,
        hasPreviousPage: query.page > 1,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  async readExportRows(queryInput: AdminOrdersQueryInput = {}): Promise<AdminOrdersReadResult<readonly AdminOrderExportRow[]>> {
    if (this.failure === "unavailable") return { status: "unavailable", reason: "local_admin_orders_unavailable" };
    if (this.failure === "source_failure") return { status: "source_failure", operation: "admin_orders_export" };
    const query = normalizeAdminOrdersQuery(queryInput);
    return {
      status: "found",
      value: this.fixtures.filter((order) => matchesQuery(order, query)).map(toSafeAdminOrderExportRow),
    };
  }
}

export function createLocalAdminOrdersReadRepository(
  options: LocalAdminOrdersReadRepositoryOptions = {},
): AdminOrdersReadRepository {
  return new LocalAdminOrdersReadRepository(options);
}
