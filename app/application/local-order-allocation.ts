/** Integer-only allocation of already server-resolved purchase amounts.
 * This function does not resolve prices, authorize a purchase or write state. */
export interface LocalOrderAllocationLine {
  readonly lineId: string;
  readonly subtotalCents: number;
  readonly discountEligible: boolean;
  readonly requiresShipping: boolean;
}

export interface LocalOrderAllocatedLine extends LocalOrderAllocationLine {
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly localArithmeticTotalCents: number;
  readonly tax: { readonly status: "not_activated"; readonly amount: null };
}

export const LOCAL_ORDER_MAX_MINOR_UNITS = 2_147_483_647;
const validAmount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= LOCAL_ORDER_MAX_MINOR_UNITS;
const max = BigInt(LOCAL_ORDER_MAX_MINOR_UNITS);
const zero = BigInt(0);
const one = BigInt(1);

/** Input order is the stable canonical Cart line order, never display sorting.
 * BigInt intermediates avoid rounding even when amount * weight exceeds 2^53. */
function distribute(amount: bigint, weights: readonly bigint[]): bigint[] {
  const result = weights.map(() => zero);
  if (amount === zero) return result;
  const sum = weights.reduce((a, b) => a + b, zero);
  if (sum === zero) return result;
  const fractions = weights.map((weight, index) => {
    const numerator = amount * weight;
    result[index] = numerator / sum;
    return { index, remainder: numerator % sum };
  });
  let remaining = amount - result.reduce((a, b) => a + b, zero);
  fractions.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const entry of fractions) {
    if (remaining === zero) break;
    result[entry.index] += one;
    remaining -= one;
  }
  return result;
}

export function allocateLocalOrderAmounts(input: {
  readonly lines: readonly LocalOrderAllocationLine[];
  readonly discountCents: number;
  readonly shippingCents: number;
}): { readonly status: "found"; readonly value: {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly localArithmeticTotalCents: number;
  readonly tax: { readonly status: "not_activated"; readonly amount: null };
  readonly lines: readonly LocalOrderAllocatedLine[];
} } | { readonly status: "unavailable" } {
  const unavailable = { status: "unavailable" as const };
  if (!input || !Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1000
    || !validAmount(input.discountCents) || !validAmount(input.shippingCents)) return unavailable;
  const ids = new Set<string>();
  for (const line of input.lines) {
    if (!line || typeof line.lineId !== "string" || !line.lineId.trim() || line.lineId.length > 200 || ids.has(line.lineId)
      || !validAmount(line.subtotalCents) || typeof line.discountEligible !== "boolean" || typeof line.requiresShipping !== "boolean") return unavailable;
    ids.add(line.lineId);
  }
  const subtotal = input.lines.reduce((a, l) => a + BigInt(l.subtotalCents), zero);
  const discount = BigInt(input.discountCents), shipping = BigInt(input.shippingCents);
  const eligibleSubtotal = input.lines.reduce((a, l) => a + (l.discountEligible ? BigInt(l.subtotalCents) : zero), zero);
  if (subtotal > max || discount > eligibleSubtotal || subtotal + shipping - discount > max) return unavailable;
  const physical = input.lines.filter(l => l.requiresShipping);
  if (!physical.length && shipping !== zero) return unavailable;
  const physicalSubtotal = physical.reduce((a, l) => a + BigInt(l.subtotalCents), zero);
  const discounts = distribute(discount, input.lines.map(l => l.discountEligible ? BigInt(l.subtotalCents) : zero));
  const shippingShares = distribute(shipping, input.lines.map(l => l.requiresShipping ? physicalSubtotal === zero ? one : BigInt(l.subtotalCents) : zero));
  const tax = { status: "not_activated" as const, amount: null };
  return { status: "found", value: {
    subtotalCents: Number(subtotal), discountCents: input.discountCents, shippingCents: input.shippingCents,
    localArithmeticTotalCents: Number(subtotal + shipping - discount), tax,
    lines: input.lines.map((line, index) => ({ ...line, discountCents: Number(discounts[index]),
      shippingCents: Number(shippingShares[index]),
      localArithmeticTotalCents: Number(BigInt(line.subtotalCents) + shippingShares[index] - discounts[index]), tax: { ...tax } })),
  } };
}
