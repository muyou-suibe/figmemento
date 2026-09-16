import { normalizeCustomerEmail } from "../domain/customer-auth.ts";
import { getSharedLocalNewsletterRepository } from "./local-newsletter-runtime.server.ts";
import { getSharedLocalOrderAccountReadPort } from "./local-order-runtime.server.ts";
import { getSharedCustomerPointsAccountReadPort } from "./customer-points-runtime.server.ts";
import { readAuthenticatedCustomer } from "./customer-auth-http.server.ts";

export interface LocalCustomerCommerceContext {
  readonly customerId?: string;
  readonly firstOrderEligible: boolean;
  readonly pointsBalance: number;
}

/** Reads only server-owned account, newsletter, and points facts for Checkout. */
export async function readLocalCustomerCommerceContext(
  request: Request,
  checkoutEmail: string,
): Promise<LocalCustomerCommerceContext> {
  const customer = await readAuthenticatedCustomer(request);
  const normalizedEmail = normalizeCustomerEmail(checkoutEmail);
  const accountOrders = customer ? getSharedLocalOrderAccountReadPort().findSnapshotsForCustomer(customer.id) : [];
  const newsletter = normalizedEmail ? getSharedLocalNewsletterRepository().findByEmail?.(normalizedEmail) : null;
  return {
    ...(customer ? { customerId: customer.id } : {}),
    firstOrderEligible: customer
      ? accountOrders.every((order) => order.paymentStatus !== "succeeded")
      : newsletter !== null,
    pointsBalance: customer ? getSharedCustomerPointsAccountReadPort().getSummary(customer.id).balance : 0,
  };
}
