import {
  pointsEarnedForSubtotal,
  type CustomerPointsSummary,
  type PointsLedgerEntry,
} from "../../domain/customer-points.ts";
import type { CustomerPointsRepository } from "../../application/customer-points.ts";

interface Reservation {
  readonly customerId: string;
  readonly orderReference: string;
  readonly points: number;
}

/** Process-memory LOCAL V1 ledger. Restart loss is intentional and documented. */
export class LocalMemoryCustomerPointsRepository implements CustomerPointsRepository {
  private readonly entries: PointsLedgerEntry[] = [];
  private readonly reservations = new Map<string, Reservation>();

  getSummary(customerId: string): CustomerPointsSummary {
    const ledger = this.entries.filter((entry) => entry.customerId === customerId).map((entry) => ({ ...entry }));
    const reserved = [...this.reservations.values()]
      .filter((reservation) => reservation.customerId === customerId)
      .reduce((total, reservation) => total + reservation.points, 0);
    const balance = ledger.reduce((total, entry) => total + entry.delta, 0) - reserved;
    return {
      customerId,
      balance: Math.max(0, balance),
      ledger,
      conversion: "100 points = USD 1",
      maxRedemptionPercent: 30,
    };
  }

  reserveForOrder(input: { readonly customerId: string; readonly orderReference: string; readonly points: number; readonly now: string }): { readonly status: "reserved" | "unchanged" | "rejected" } {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(input.customerId) || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(input.orderReference)) return { status: "rejected" };
    if (!Number.isSafeInteger(input.points) || input.points < 0) return { status: "rejected" };
    if (this.reservations.has(input.orderReference)) return { status: "unchanged" };
    if (input.points > this.getSummary(input.customerId).balance) return { status: "rejected" };
    this.reservations.set(input.orderReference, { customerId: input.customerId, orderReference: input.orderReference, points: input.points });
    return { status: "reserved" };
  }

  settleOrder(input: { readonly customerId: string; readonly orderReference: string; readonly subtotalCents: number; readonly now: string }): void {
    const reservation = this.reservations.get(input.orderReference);
    if (reservation && reservation.customerId === input.customerId) {
      if (reservation.points > 0 && !this.entries.some((entry) => entry.reason === "order_redemption" && entry.orderReference === input.orderReference)) {
        this.entries.push({ id: `points-${globalThis.crypto.randomUUID()}`, customerId: input.customerId, delta: -reservation.points, reason: "order_redemption", orderReference: input.orderReference, createdAt: input.now });
      }
      this.reservations.delete(input.orderReference);
    }
    if (this.entries.some((entry) => entry.reason === "purchase_earned" && entry.orderReference === input.orderReference)) return;
    const earned = pointsEarnedForSubtotal(input.subtotalCents);
    if (earned > 0) this.entries.push({ id: `points-${globalThis.crypto.randomUUID()}`, customerId: input.customerId, delta: earned, reason: "purchase_earned", orderReference: input.orderReference, createdAt: input.now });
  }

  releaseOrder(input: { readonly customerId: string; readonly orderReference: string }): void {
    const reservation = this.reservations.get(input.orderReference);
    if (reservation?.customerId === input.customerId) this.reservations.delete(input.orderReference);
  }
}
