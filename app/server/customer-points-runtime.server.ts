import type { CustomerPointsAccountReadPort, CustomerPointsRepository } from "../application/customer-points.ts";
import { LocalMemoryCustomerPointsRepository } from "../infrastructure/customer-points/local-memory-customer-points-repository.server.ts";

let sharedRepository: LocalMemoryCustomerPointsRepository | null = null;

export function getSharedCustomerPointsRepository(): CustomerPointsRepository {
  sharedRepository ??= new LocalMemoryCustomerPointsRepository();
  return sharedRepository;
}

export function getSharedCustomerPointsAccountReadPort(): CustomerPointsAccountReadPort {
  sharedRepository ??= new LocalMemoryCustomerPointsRepository();
  return sharedRepository;
}

export function resetSharedCustomerPointsRuntimeForTests(): void {
  sharedRepository = null;
}
