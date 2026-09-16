import type { LocalPaymentAggregateRepository } from "../application/local-payment-repository.ts";
import { LocalMemoryLocalPaymentRepository } from "../infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import {
  getSharedLocalOrderPaymentStatePort,
  resetSharedLocalOrderRepositoryForTests,
} from "./local-order-runtime.server.ts";

let sharedPaymentRepository: LocalPaymentAggregateRepository | null = null;

/** Payment singleton over the same process-local canonical Local Order store. */
export function getSharedLocalPaymentRepository(): LocalPaymentAggregateRepository {
  sharedPaymentRepository ??= new LocalMemoryLocalPaymentRepository(
    getSharedLocalOrderPaymentStatePort(),
  );
  return sharedPaymentRepository;
}

/** Test-only whole local Payment/Order restart simulation. */
export function resetSharedLocalPaymentRuntimeForTests(): void {
  sharedPaymentRepository = null;
  resetSharedLocalOrderRepositoryForTests();
}
