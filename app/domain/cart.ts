import type { Customization } from "./customization.ts";
import type { OrderRequestItem } from "./order.ts";
import type { Product } from "./product.ts";

export type CartItem = Product & {
  customization?: Customization;
};

export type CartOrderItemPayload = OrderRequestItem;
