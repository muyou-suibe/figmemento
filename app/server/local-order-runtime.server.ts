import type { LocalOrderAccountReadPort, LocalOrderFulfillmentReadPort, LocalOrderRepository } from "../application/local-order-repository.ts";
import type { LocalOrderPaymentStatePort } from "../application/local-payment-repository.ts";
import { LocalMemoryLocalOrderRepository } from "../infrastructure/local-order/local-memory-local-order-repository.server.ts";

let sharedRepository: LocalMemoryLocalOrderRepository | null = null;

/** The one process-local repository shared by Local Order create and read routes. */
export function getSharedLocalOrderRepository(): LocalOrderRepository {
  sharedRepository ??= new LocalMemoryLocalOrderRepository();
  return sharedRepository;
}

/** Returns the same canonical store through the server-only Payment port. */
export function getSharedLocalOrderPaymentStatePort(): LocalOrderPaymentStatePort {
  sharedRepository ??= new LocalMemoryLocalOrderRepository();
  return sharedRepository;
}

/** Returns the same canonical process-memory Order store for Fulfillment reads. */
export function getSharedLocalOrderFulfillmentReadPort(): LocalOrderFulfillmentReadPort {
  sharedRepository ??= new LocalMemoryLocalOrderRepository();
  return sharedRepository;
}

/** Returns the account read projection over the canonical Local Order store. */
export function getSharedLocalOrderAccountReadPort(): LocalOrderAccountReadPort {
  sharedRepository ??= new LocalMemoryLocalOrderRepository();
  return sharedRepository;
}

/** Test-only runtime restart simulation; never called by application routes. */
export function resetSharedLocalOrderRepositoryForTests(): void {
  sharedRepository = null;
}
