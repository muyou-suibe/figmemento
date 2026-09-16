export type CustomerPointsReason = "purchase_earned" | "order_redemption";

export interface PointsLedgerEntry {
  readonly id: string;
  readonly customerId: string;
  readonly delta: number;
  readonly reason: CustomerPointsReason;
  readonly orderReference?: string;
  readonly createdAt: string;
}

export interface CustomerPointsSummary {
  readonly customerId: string;
  readonly balance: number;
  readonly ledger: readonly PointsLedgerEntry[];
  readonly conversion: "100 points = USD 1";
  readonly maxRedemptionPercent: 30;
}

export function pointsEarnedForSubtotal(subtotalCents: number): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) return 0;
  return Math.floor(subtotalCents / 100);
}

export function pointsDiscountCents(points: number): number {
  if (!Number.isSafeInteger(points) || points < 0) return 0;
  return points;
}

export function maxRedeemablePoints(eligibleOrderValueCents: number, balance: number): number {
  if (!Number.isSafeInteger(eligibleOrderValueCents) || eligibleOrderValueCents < 0) return 0;
  if (!Number.isSafeInteger(balance) || balance < 0) return 0;
  return Math.min(balance, Math.floor(eligibleOrderValueCents * 30 / 100));
}
