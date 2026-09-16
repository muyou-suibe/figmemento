import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import { projectLocalShipment, type LocalTrackingReadResult } from "../domain/local-tracking.ts";
import type { LocalOrderBrowserCapability, LocalOrderRepository } from "./local-order-repository.ts";
import type { LocalTrackingAggregateRepository } from "./local-tracking-repository.ts";
import { readTrustedLocalTrackingConfig, type LocalTrackingConfiguration } from "../config/local-tracking-runtime.ts";

export interface LocalTrackingCustomerReadInput {
  readonly publicOrderReference: string;
  readonly browserCapability?: LocalOrderBrowserCapability;
}

export interface LocalTrackingCustomerServiceDependencies {
  readonly readConfig?: () => LocalTrackingConfiguration;
  readonly getOrderRepository: () => LocalOrderRepository;
  readonly getTrackingRepository: () => LocalTrackingAggregateRepository;
}

export type LocalTrackingCustomerFailure = {
  readonly status: "unavailable";
  readonly issues: readonly [{ readonly path: string; readonly code: "unavailable"; readonly message: string }];
};

export type LocalTrackingCustomerServiceResult = LocalTrackingReadResult | LocalTrackingCustomerFailure;

function unavailable(): LocalTrackingCustomerFailure {
  return { status: "unavailable", issues: [{ path: "$", code: "unavailable", message: "Tracking is unavailable." }] };
}

/** Customer Tracking is a read-only composition over canonical Order and Tracking stores. */
export class LocalTrackingCustomerService {
  private readonly dependencies: LocalTrackingCustomerServiceDependencies;

  constructor(dependencies: LocalTrackingCustomerServiceDependencies) {
    this.dependencies = dependencies;
  }

  async read(input: LocalTrackingCustomerReadInput): Promise<LocalTrackingCustomerServiceResult> {
    if (!isLocalOrderPublicReference(input.publicOrderReference) || !input.browserCapability) return unavailable();

    let configuration: LocalTrackingConfiguration;
    try {
      configuration = (this.dependencies.readConfig ?? readTrustedLocalTrackingConfig)();
    } catch {
      return unavailable();
    }
    if (configuration.source !== "local_fake" || !["development", "test"].includes(configuration.runtimeMode)) return unavailable();

    let authorized;
    try {
      authorized = await this.dependencies.getOrderRepository().findAuthorizedSnapshot(input.publicOrderReference, input.browserCapability);
    } catch {
      return unavailable();
    }
    if (authorized.status !== "found" || authorized.snapshot.status !== "paid" || authorized.snapshot.paymentStatus !== "succeeded") return unavailable();

    let aggregate;
    try {
      aggregate = this.dependencies.getTrackingRepository().findByOrderIdentity({
        internalOrderId: authorized.snapshot.internalId,
        publicOrderReference: authorized.snapshot.publicReference,
      });
    } catch {
      return unavailable();
    }
    if (aggregate.status !== "found") return unavailable();
    return projectLocalShipment(aggregate.aggregate.shipment);
  }
}
