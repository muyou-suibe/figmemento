import type { CustomerPointsSummary, PointsLedgerEntry } from "../domain/customer-points.ts";

export interface CustomerPointsRepository {
  getSummary(customerId: string): CustomerPointsSummary;
  reserveForOrder(input: { readonly customerId: string; readonly orderReference: string; readonly points: number; readonly now: string }): { readonly status: "reserved" | "unchanged" | "rejected" };
  settleOrder(input: { readonly customerId: string; readonly orderReference: string; readonly subtotalCents: number; readonly now: string }): void;
  releaseOrder(input: { readonly customerId: string; readonly orderReference: string }): void;
}

export interface CustomerPointsAccountReadPort {
  getSummary(customerId: string): CustomerPointsSummary;
}

export type { PointsLedgerEntry };
