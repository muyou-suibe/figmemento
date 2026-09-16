import type { LocalTrackingConfiguration } from "../config/local-tracking-runtime.ts";
import { readTrustedLocalTrackingConfig } from "../config/local-tracking-runtime.ts";
import type { LocalTrackingActionInput } from "../domain/local-tracking.ts";
import type { LocalTrackingAggregateRepository, LocalTrackingAggregateResult, LocalTrackingCanonicalReadPorts } from "../application/local-tracking-repository.ts";
import { LocalMemoryLocalTrackingRepository } from "../infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import { getSharedLocalOrderFulfillmentReadPort } from "./local-order-runtime.server.ts";
import { getSharedLocalFulfillmentRepository } from "./local-fulfillment-runtime.server.ts";
import { resolveLocalTrackingOperatorAuthority, type LocalTrackingOperatorVerifier } from "./local-tracking-operator.server.ts";

export interface LocalTrackingRuntime {
  readonly configuration: LocalTrackingConfiguration;
  readonly ports: LocalTrackingCanonicalReadPorts;
  readonly repository: LocalTrackingAggregateRepository;
  readonly now: () => string;
}

function unavailable(): LocalTrackingAggregateResult {
  return { status: "unavailable", issues: [{ path: "$", code: "unavailable", message: "Tracking is unavailable." }] };
}

export function createLocalTrackingRuntime(options: {
  readonly configuration?: LocalTrackingConfiguration;
  readonly ports?: LocalTrackingCanonicalReadPorts;
  readonly repository?: LocalTrackingAggregateRepository;
  readonly now?: () => string;
} = {}): LocalTrackingRuntime {
  const configuration = options.configuration ?? readTrustedLocalTrackingConfig();
  if (configuration.source === "local_persistent" && !options.repository) {
    throw new Error("Persistent Tracking requires the canonical durable command boundary.");
  }
  const ports = options.ports ?? { orders: getSharedLocalOrderFulfillmentReadPort(), fulfillments: getSharedLocalFulfillmentRepository() };
  return { configuration, ports, repository: options.repository ?? new LocalMemoryLocalTrackingRepository(ports, { now: options.now }), now: options.now ?? (() => new Date().toISOString()) };
}

/** Server-only composition: operator authority is checked before any repository mutation. */
export function commitAuthorizedLocalTrackingOperatorAction(
  runtime: LocalTrackingRuntime,
  input: { readonly publicOrderReference: string; readonly action: LocalTrackingActionInput; readonly verifier: LocalTrackingOperatorVerifier | undefined },
): LocalTrackingAggregateResult {
  const authorization = resolveLocalTrackingOperatorAuthority(runtime.configuration, input.verifier);
  if (authorization.status !== "authorized") return unavailable();
  return runtime.repository.commit({ publicOrderReference: input.publicOrderReference, actorKind: "operator", actorContextId: authorization.authority.actorContextId, action: input.action });
}

let sharedTrackingRepository: LocalTrackingAggregateRepository | null = null;
export function getSharedLocalTrackingRepository(): LocalTrackingAggregateRepository {
  sharedTrackingRepository ??= new LocalMemoryLocalTrackingRepository({ orders: getSharedLocalOrderFulfillmentReadPort(), fulfillments: getSharedLocalFulfillmentRepository() });
  return sharedTrackingRepository;
}
export function getSharedLocalTrackingRuntime(): LocalTrackingRuntime {
  const configuration = readTrustedLocalTrackingConfig();
  if (configuration.source === "local_persistent") {
    throw new Error("Persistent Tracking cannot use the process-memory runtime.");
  }
  const ports = { orders: getSharedLocalOrderFulfillmentReadPort(), fulfillments: getSharedLocalFulfillmentRepository() };
  return { configuration, ports, repository: getSharedLocalTrackingRepository(), now: () => new Date().toISOString() };
}
export function resetSharedLocalTrackingRuntimeForTests(): void { sharedTrackingRepository = null; }
