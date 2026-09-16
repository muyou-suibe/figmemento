import {
  normalizeAdminOrdersQuery,
  type AdminOrdersQuery,
  type AdminOrdersQueryInput,
  type AdminOrdersReadPage,
  type AdminOrderExportRow,
} from "../application/admin-orders-read-repository.ts";
import {
  isAdminAcceptanceConfigurationError,
} from "./admin-source-resolution.server.ts";
import {
  resolveAdminOrdersReadSource,
  type AdminOrdersSourceSelection,
} from "./admin-orders-source.server.ts";

export type AdminOrdersCompositionResult<TLocal, TProduction> =
  | { readonly status: "local_fake"; readonly query: AdminOrdersQuery; readonly value: TLocal }
  | { readonly status: "local_persistent"; readonly query: AdminOrdersQuery; readonly value: TLocal }
  | { readonly status: "production"; readonly query: AdminOrdersQuery; readonly value: TProduction }
  | { readonly status: "invalid_configuration" }
  | { readonly status: "unavailable"; readonly source: "local_fake" | "local_persistent" | "production" }
  | { readonly status: "source_failure"; readonly source: "local_fake" | "local_persistent" | "production" };

export interface AdminOrdersCompositionDependencies<TProduction> {
  readonly resolveSource?: () => AdminOrdersSourceSelection;
  readonly loadProduction: (query: AdminOrdersQuery) => Promise<TProduction>;
}

function sourceFailure<TLocal, TProduction>(source: "local_fake" | "local_persistent" | "production"): AdminOrdersCompositionResult<TLocal, TProduction> {
  return { status: "source_failure", source };
}

function resolveSourceSafely(
  resolveSource: () => AdminOrdersSourceSelection,
): AdminOrdersSourceSelection | AdminOrdersCompositionResult<never, never> {
  try {
    return resolveSource();
  } catch (error) {
    if (isAdminAcceptanceConfigurationError(error)) return { status: "invalid_configuration" };
    return { status: "unavailable", source: "production" };
  }
}

/**
 * Composition seam called only after the route has completed Admin
 * authorization. It normalizes the query once, keeps local reads on the
 * existing repository, and invokes the production loader only for the
 * production selection.
 */
export async function loadAdminOrdersPageAfterAuthorization<TProduction>(
  input: AdminOrdersQueryInput,
  dependencies: AdminOrdersCompositionDependencies<TProduction>,
): Promise<AdminOrdersCompositionResult<AdminOrdersReadPage, TProduction>> {
  const query = normalizeAdminOrdersQuery(input);
  const selected = resolveSourceSafely(dependencies.resolveSource ?? resolveAdminOrdersReadSource);
  if (selected.status === "invalid_configuration" || selected.status === "unavailable") return selected;

  if ("repository" in selected) {
    try {
      const result = await selected.repository.read({
        q: query.q,
        fulfillment: query.fulfillment,
        payment: query.payment,
        attention: query.attentionOnly ? "1" : undefined,
        page: query.page,
      });
      if (result.status === "found") return { status: selected.status, query: result.value.query, value: result.value };
      if (result.status === "unavailable") return { status: "unavailable", source: selected.status };
      return sourceFailure<AdminOrdersReadPage, TProduction>(selected.status);
    } catch {
      return sourceFailure<AdminOrdersReadPage, TProduction>(selected.status);
    }
  }

  try {
    return { status: "production", query, value: await dependencies.loadProduction(query) };
  } catch {
    return sourceFailure<AdminOrdersReadPage, TProduction>("production");
  }
}

export async function loadAdminOrdersExportAfterAuthorization<TProduction>(
  input: AdminOrdersQueryInput,
  dependencies: AdminOrdersCompositionDependencies<TProduction>,
): Promise<AdminOrdersCompositionResult<readonly AdminOrderExportRow[], TProduction>> {
  const query = normalizeAdminOrdersQuery(input);
  const selected = resolveSourceSafely(dependencies.resolveSource ?? resolveAdminOrdersReadSource);
  if (selected.status === "invalid_configuration" || selected.status === "unavailable") return selected;

  if ("repository" in selected) {
    try {
      const result = await selected.repository.readExportRows({
        q: query.q,
        fulfillment: query.fulfillment,
        payment: query.payment,
        attention: query.attentionOnly ? "1" : undefined,
      });
      if (result.status === "found") return { status: selected.status, query, value: result.value };
      if (result.status === "unavailable") return { status: "unavailable", source: selected.status };
      return sourceFailure<readonly AdminOrderExportRow[], TProduction>(selected.status);
    } catch {
      return sourceFailure<readonly AdminOrderExportRow[], TProduction>(selected.status);
    }
  }

  try {
    return { status: "production", query, value: await dependencies.loadProduction(query) };
  } catch {
    return sourceFailure<readonly AdminOrderExportRow[], TProduction>("production");
  }
}
