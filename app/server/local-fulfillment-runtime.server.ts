import type { LocalFulfillmentConfiguration } from "../config/local-fulfillment-runtime.ts";
import { readTrustedLocalFulfillmentConfig } from "../config/local-fulfillment-runtime.ts";
import type {
  LocalFulfillmentActionInput,
} from "../domain/local-fulfillment.ts";
import type {
  LocalFulfillmentAggregateRepository,
  LocalFulfillmentAggregateResult,
} from "../application/local-fulfillment-repository.ts";
import type { LocalOrderFulfillmentReadPort } from "../application/local-order-repository.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import {
  getSharedLocalOrderFulfillmentReadPort,
  resetSharedLocalOrderRepositoryForTests,
} from "./local-order-runtime.server.ts";
import {
  resolveLocalFulfillmentOperatorAuthority,
  type LocalFulfillmentOperatorVerifier,
} from "./local-fulfillment-operator.server.ts";

export interface LocalFulfillmentRuntime {
  readonly configuration: LocalFulfillmentConfiguration;
  readonly orders: LocalOrderFulfillmentReadPort;
  readonly repository: LocalFulfillmentAggregateRepository;
  readonly now: () => string;
}

export interface LocalFulfillmentRuntimeOptions {
  readonly configuration?: LocalFulfillmentConfiguration;
  readonly orders?: LocalOrderFulfillmentReadPort;
  readonly repository?: LocalFulfillmentAggregateRepository;
  readonly now?: () => string;
}

function unavailable(): LocalFulfillmentAggregateResult {
  return {
    status: "unavailable",
    issues: [{ path: "$", code: "unavailable", message: "Fulfillment is unavailable." }],
  };
}

export function createLocalFulfillmentRuntime(options: LocalFulfillmentRuntimeOptions = {}): LocalFulfillmentRuntime {
  const orders = options.orders ?? getSharedLocalOrderFulfillmentReadPort();
  return {
    configuration: options.configuration ?? readTrustedLocalFulfillmentConfig(),
    orders,
    repository: options.repository ?? new LocalMemoryLocalFulfillmentRepository(orders, { now: options.now }),
    now: options.now ?? (() => new Date().toISOString()),
  };
}

/**
 * Server-only operator composition. Operator authorization is evaluated before
 * public-reference resolution and before the Fulfillment repository is asked to
 * commit anything. The public reference never grants authority.
 */
export function commitAuthorizedLocalFulfillmentOperatorAction(
  runtime: LocalFulfillmentRuntime,
  input: {
    readonly publicOrderReference: string;
    readonly action: LocalFulfillmentActionInput;
    readonly verifier: LocalFulfillmentOperatorVerifier | undefined;
  },
): LocalFulfillmentAggregateResult {
  const authorization = resolveLocalFulfillmentOperatorAuthority(runtime.configuration, input.verifier);
  if (authorization.status !== "authorized") return unavailable();

  const order = runtime.orders.findSnapshotForFulfillment(input.publicOrderReference);
  if (order.status !== "found") return unavailable();

  return runtime.repository.commit({
    internalOrderId: order.snapshot.internalId,
    orderReference: order.snapshot.publicReference,
    actorKind: authorization.authority.actorKind,
    actorContextId: authorization.authority.actorContextId,
    action: input.action,
    publishedAt: runtime.now(),
  });
}

/** Test-only whole local Fulfillment/Order process restart simulation. */
export function resetSharedLocalFulfillmentRuntimeForTests(): void {
  sharedFulfillmentRepository = null;
  resetSharedLocalOrderRepositoryForTests();
}

let sharedFulfillmentRepository: LocalFulfillmentAggregateRepository | null = null;

/** One process-lifetime Fulfillment repository over the shared Order store. */
export function getSharedLocalFulfillmentRepository(): LocalFulfillmentAggregateRepository {
  sharedFulfillmentRepository ??= new LocalMemoryLocalFulfillmentRepository(getSharedLocalOrderFulfillmentReadPort());
  return sharedFulfillmentRepository;
}

/** Returns a runtime that reuses the canonical process-memory stores. */
export function getSharedLocalFulfillmentRuntime(): LocalFulfillmentRuntime {
  const orders = getSharedLocalOrderFulfillmentReadPort();
  return {
    configuration: readTrustedLocalFulfillmentConfig(),
    orders,
    repository: getSharedLocalFulfillmentRepository(),
    now: () => new Date().toISOString(),
  };
}
