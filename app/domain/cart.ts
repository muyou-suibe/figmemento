import type { Customization } from "./customization";
import type { Product } from "./product";

export type CartItem = Product & {
  customization?: Customization;
};

export type CartOrderItemPayload = {
  slug: string;
  quantity?: number;
  customization?: Customization;
};
