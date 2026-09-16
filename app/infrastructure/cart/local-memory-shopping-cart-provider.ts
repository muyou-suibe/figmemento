import {
  type AcceptedCartItem,
  type CartProviderResult,
  type ShoppingCartProvider,
  type ShoppingCartRecord,
  type StoredCartLine,
  MAX_CART_LINE_QUANTITY,
  parseCartQuantity,
} from "../../domain/shopping-cart.ts";

export interface LocalCartIdGenerator {
  nextId(): string;
}

export function createCryptographicLocalCartIdGenerator(): LocalCartIdGenerator {
  return { nextId: () => globalThis.crypto.randomUUID() };
}

function cloneLine(line: StoredCartLine): StoredCartLine {
  return {
    lineId: line.lineId,
    handoff: structuredClone(line.handoff),
    snapshot: structuredClone(line.snapshot),
    customization: structuredClone(line.customization),
    quantity: line.quantity,
  };
}

function cloneCart(cart: ShoppingCartRecord): ShoppingCartRecord {
  return { cartId: cart.cartId, lines: cart.lines.map(cloneLine) };
}

/** Process-local only. It deliberately has no database, filesystem, or API. */
export class LocalMemoryShoppingCartProvider implements ShoppingCartProvider {
  private readonly carts = new Map<string, ShoppingCartRecord>();
  private readonly ids: LocalCartIdGenerator;

  constructor(ids: LocalCartIdGenerator = createCryptographicLocalCartIdGenerator()) {
    this.ids = ids;
  }

  async getCart(cartId: string): Promise<CartProviderResult<ShoppingCartRecord>> {
    const cart = this.carts.get(cartId);
    return cart ? { status: "found", value: cloneCart(cart) } : { status: "not_found" };
  }

  async createCart(): Promise<CartProviderResult<ShoppingCartRecord>> {
    const cartId = this.ids.nextId();
    if (!cartId || this.carts.has(cartId)) return { status: "source_failure" };
    const cart = { cartId, lines: [] } satisfies ShoppingCartRecord;
    this.carts.set(cartId, cart);
    return { status: "found", value: cloneCart(cart) };
  }

  async addLine(cartId: string, item: AcceptedCartItem): Promise<CartProviderResult<ShoppingCartRecord>> {
    const cart = this.carts.get(cartId);
    if (!cart) return { status: "not_found" };
    const lineId = this.ids.nextId();
    if (!lineId) return { status: "source_failure" };
    const line: StoredCartLine = {
      lineId,
      handoff: structuredClone(item.handoff),
      snapshot: structuredClone(item.snapshot),
      customization: structuredClone(item.customization),
      quantity: 1,
    };
    const next = { ...cart, lines: [...cart.lines, line] } satisfies ShoppingCartRecord;
    this.carts.set(cartId, next);
    return { status: "found", value: cloneCart(next) };
  }

  async updateLine(cartId: string, lineId: string, quantity: number): Promise<CartProviderResult<ShoppingCartRecord>> {
    const parsedQuantity = parseCartQuantity(quantity);
    if (parsedQuantity === null || parsedQuantity > MAX_CART_LINE_QUANTITY) return { status: "source_failure" };
    const cart = this.carts.get(cartId);
    if (!cart) return { status: "not_found" };
    if (!cart.lines.some((line) => line.lineId === lineId)) return { status: "not_found" };
    const next = {
      ...cart,
      lines: cart.lines.map((line) => line.lineId === lineId ? { ...line, quantity: parsedQuantity } : line),
    } satisfies ShoppingCartRecord;
    this.carts.set(cartId, next);
    return { status: "found", value: cloneCart(next) };
  }

  async removeLine(cartId: string, lineId: string): Promise<CartProviderResult<ShoppingCartRecord>> {
    const cart = this.carts.get(cartId);
    if (!cart) return { status: "not_found" };
    if (!cart.lines.some((line) => line.lineId === lineId)) return { status: "not_found" };
    const next = { ...cart, lines: cart.lines.filter((line) => line.lineId !== lineId) } satisfies ShoppingCartRecord;
    this.carts.set(cartId, next);
    return { status: "found", value: cloneCart(next) };
  }

  async clearCart(cartId: string): Promise<CartProviderResult<ShoppingCartRecord>> {
    const cart = this.carts.get(cartId);
    if (!cart) return { status: "not_found" };
    const next = { ...cart, lines: [] } satisfies ShoppingCartRecord;
    this.carts.set(cartId, next);
    return { status: "found", value: cloneCart(next) };
  }
}
