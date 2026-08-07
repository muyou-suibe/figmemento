export function omitPrivateOrderLookupFields(order: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(order).filter(([key]) => key !== "id" && key !== "order_items" && key !== "customer_email"),
  );
}
