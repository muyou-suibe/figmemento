import { readCustomerAuthConfig, type RuntimeEnvironment } from "../config/server.ts";
import type { CustomerAuthProvider } from "../application/customer-auth-provider.ts";
import {
  createDisabledCustomerAuthProvider,
  createLocalFakeCustomerAuthProvider,
} from "../application/customer-auth-local-provider.server.ts";
import {
  createLocalPersistentCustomerAuthProvider,
  type PersistentCustomerAuthProviderDependencies,
} from "../application/customer-auth-persistent-provider.server.ts";

export interface CustomerAuthRuntime {
  readonly provider: CustomerAuthProvider;
  readonly runtimeMode: "development" | "test" | "production" | "unknown";
  readonly source: "disabled" | "local_fake" | "local_persistent";
}

const localFakeProvider = createLocalFakeCustomerAuthProvider();
const disabledProvider = createDisabledCustomerAuthProvider();

export function createCustomerAuthRuntime(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
  dependencies: PersistentCustomerAuthProviderDependencies = {},
): CustomerAuthRuntime {
  const configuration = readCustomerAuthConfig(environment, runtimeMode);
  return {
    provider: configuration.source === "local_fake"
      ? localFakeProvider
      : configuration.source === "local_persistent"
        ? createLocalPersistentCustomerAuthProvider(environment, dependencies)
        : disabledProvider,
    runtimeMode: configuration.runtimeMode,
    source: configuration.source,
  };
}

export function getCustomerAuthRuntime(): CustomerAuthRuntime {
  return createCustomerAuthRuntime();
}
