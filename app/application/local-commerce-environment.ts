export const LOCAL_COMMERCE_PROJECT_ID = "figmemento-local-commerce";
export const LOCAL_COMMERCE_SCHEMA = "local_commerce";
export const LOCAL_COMMERCE_POSTGRES_MAJOR_VERSION = 17;
export const LOCAL_COMMERCE_MARKER_FORMAT = "figmemento-local-commerce-marker/v1";

export const DEFAULT_LOCAL_COMMERCE_PORTS = Object.freeze({
  shadowDb: 55420,
  api: 55421,
  db: 55422,
  studio: 55423,
  smtp: 55424,
  imageHelper: 55425,
});

export type LocalCommerceEnvironmentName = "development" | "test";
export type LocalCommerceProjectKind = "retained_development" | "disposable_test";
export type LocalCommercePortName = keyof typeof DEFAULT_LOCAL_COMMERCE_PORTS;

export type LocalCommercePorts = Record<LocalCommercePortName, number>;

export interface LocalCommerceEndpoints {
  apiUrl: string;
  rpcUrl: string;
  storageUrl: string;
  imageHelperUrl: string;
}

export interface LocalCommerceConfig {
  environment: LocalCommerceEnvironmentName;
  projectKind: LocalCommerceProjectKind;
  projectId: string;
  runId: string;
  postgresMajorVersion: number;
  ports: LocalCommercePorts;
  endpoints: LocalCommerceEndpoints;
}

export interface LocalCommerceProjectMarker {
  format: typeof LOCAL_COMMERCE_MARKER_FORMAT;
  projectId: string;
  environment: LocalCommerceEnvironmentName;
  projectKind: LocalCommerceProjectKind;
  runId: string;
  schema: typeof LOCAL_COMMERCE_SCHEMA;
  postgresMajorVersion: typeof LOCAL_COMMERCE_POSTGRES_MAJOR_VERSION;
  createdAt: string;
}

export interface LocalCommerceConfigIssue {
  code:
  | "missing_required_value"
  | "invalid_environment"
  | "invalid_project_kind"
  | "project_kind_environment_mismatch"
  | "invalid_project_id"
  | "invalid_run_id"
  | "invalid_postgres_version"
  | "invalid_port"
  | "duplicate_port"
  | "invalid_endpoint"
  | "non_loopback_endpoint"
  | "endpoint_port_mismatch";
  name: string;
}

export type LocalCommerceConfigResult =
  | {
      status: "ready";
      config: LocalCommerceConfig;
      issues: readonly [];
    }
  | {
      status: "invalid";
      config: null;
      issues: readonly LocalCommerceConfigIssue[];
    };

export interface LocalCommercePortAudit {
  status: "ready" | "blocked";
  occupiedPorts: readonly number[];
  duplicatePorts: readonly number[];
}

export interface LocalCommerceMarkerDecision {
  status: "allowed" | "denied";
  code:
  | "marker_initialization_allowed"
  | "invalid_configuration"
  | "new_project_confirmation_required"
  | "marker_already_exists";
}

export interface LocalCommerceResetDecision {
  status: "allowed" | "denied";
  code:
  | "disposable_reset_allowed"
  | "invalid_configuration"
  | "retained_project"
  | "disposable_confirmation_required"
  | "marker_required"
  | "marker_mismatch"
  | "run_id_mismatch";
}

const PORT_ENV_NAMES: Record<LocalCommercePortName, string> = {
  shadowDb: "LOCAL_COMMERCE_SHADOW_DB_PORT",
  api: "LOCAL_COMMERCE_API_PORT",
  db: "LOCAL_COMMERCE_DB_PORT",
  studio: "LOCAL_COMMERCE_STUDIO_PORT",
  smtp: "LOCAL_COMMERCE_SMTP_PORT",
  imageHelper: "LOCAL_COMMERCE_IMAGE_HELPER_PORT",
};

function trimmed(environment: Readonly<Record<string, string | undefined>>, name: string) {
  return environment[name]?.trim() || undefined;
}

function parsePort(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  issues: LocalCommerceConfigIssue[],
) {
  const raw = trimmed(environment, name);
  if (!raw) {
    issues.push({ code: "missing_required_value", name });
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    issues.push({ code: "invalid_port", name });
    return undefined;
  }
  return value;
}

function parseLoopbackEndpoint(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  expectedPort: number | undefined,
  expectedPath: string,
  issues: LocalCommerceConfigIssue[],
) {
  const value = trimmed(environment, name);
  if (!value) {
    issues.push({ code: "missing_required_value", name });
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({ code: "invalid_endpoint", name });
    return undefined;
  }

  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    !isLoopbackHostname(url.hostname)
  ) {
    issues.push({ code: "non_loopback_endpoint", name });
    return undefined;
  }

  if (expectedPort !== undefined && Number(url.port) !== expectedPort) {
    issues.push({ code: "endpoint_port_mismatch", name });
    return undefined;
  }

  if (url.pathname !== expectedPath && !(expectedPath === "/" && url.pathname === "")) {
    issues.push({ code: "invalid_endpoint", name });
    return undefined;
  }

  return value;
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && !url.username && !url.password && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function readLocalCommerceConfig(
  environment: Readonly<Record<string, string | undefined>>,
): LocalCommerceConfigResult {
  const issues: LocalCommerceConfigIssue[] = [];
  const environmentName = trimmed(environment, "LOCAL_COMMERCE_ENVIRONMENT");
  const projectKind = trimmed(environment, "LOCAL_COMMERCE_PROJECT_KIND");
  const projectId = trimmed(environment, "LOCAL_COMMERCE_PROJECT_ID");
  const runId = trimmed(environment, "LOCAL_COMMERCE_RUN_ID");
  const postgresVersion = trimmed(environment, "LOCAL_COMMERCE_DB_MAJOR_VERSION");

  if (!environmentName) issues.push({ code: "missing_required_value", name: "LOCAL_COMMERCE_ENVIRONMENT" });
  if (!projectKind) issues.push({ code: "missing_required_value", name: "LOCAL_COMMERCE_PROJECT_KIND" });
  if (!projectId) issues.push({ code: "missing_required_value", name: "LOCAL_COMMERCE_PROJECT_ID" });
  if (!runId) issues.push({ code: "missing_required_value", name: "LOCAL_COMMERCE_RUN_ID" });
  if (!postgresVersion) issues.push({ code: "missing_required_value", name: "LOCAL_COMMERCE_DB_MAJOR_VERSION" });

  const validEnvironment = environmentName === "development" || environmentName === "test";
  const validProjectKind = projectKind === "retained_development" || projectKind === "disposable_test";
  if (environmentName && !validEnvironment) {
    issues.push({ code: "invalid_environment", name: "LOCAL_COMMERCE_ENVIRONMENT" });
  }
  if (projectKind && !validProjectKind) {
    issues.push({ code: "invalid_project_kind", name: "LOCAL_COMMERCE_PROJECT_KIND" });
  }
  if (validEnvironment && validProjectKind) {
    const compatible =
      (environmentName === "development" && projectKind === "retained_development") ||
      (environmentName === "test" && projectKind === "disposable_test");
    if (!compatible) {
      issues.push({ code: "project_kind_environment_mismatch", name: "LOCAL_COMMERCE_PROJECT_KIND" });
    }
  }

  if (projectId && runId && validEnvironment && validProjectKind) {
    const expectedProjectId =
      projectKind === "retained_development"
        ? LOCAL_COMMERCE_PROJECT_ID
        : `${LOCAL_COMMERCE_PROJECT_ID}-test-${runId}`;
    if (projectId !== expectedProjectId) {
      issues.push({ code: "invalid_project_id", name: "LOCAL_COMMERCE_PROJECT_ID" });
    }
  }

  if (runId) {
    const validRunId =
      (projectKind === "retained_development" && runId === "retained-development") ||
      (projectKind === "disposable_test" && /^run-[a-z0-9]{8,64}$/.test(runId));
    if (!validRunId) issues.push({ code: "invalid_run_id", name: "LOCAL_COMMERCE_RUN_ID" });
  }

  if (postgresVersion && Number(postgresVersion) !== LOCAL_COMMERCE_POSTGRES_MAJOR_VERSION) {
    issues.push({ code: "invalid_postgres_version", name: "LOCAL_COMMERCE_DB_MAJOR_VERSION" });
  }

  const parsedPorts = {
    shadowDb: parsePort(environment, PORT_ENV_NAMES.shadowDb, issues),
    api: parsePort(environment, PORT_ENV_NAMES.api, issues),
    db: parsePort(environment, PORT_ENV_NAMES.db, issues),
    studio: parsePort(environment, PORT_ENV_NAMES.studio, issues),
    smtp: parsePort(environment, PORT_ENV_NAMES.smtp, issues),
    imageHelper: parsePort(environment, PORT_ENV_NAMES.imageHelper, issues),
  };
  const seenPorts = new Map<number, LocalCommercePortName>();
  for (const [name, value] of Object.entries(parsedPorts) as [LocalCommercePortName, number | undefined][]) {
    if (value === undefined) continue;
    const previous = seenPorts.get(value);
    if (previous) {
      issues.push({ code: "duplicate_port", name: `${PORT_ENV_NAMES[previous]},${PORT_ENV_NAMES[name]}` });
    } else {
      seenPorts.set(value, name);
    }
  }

  const endpoints = {
    apiUrl: parseLoopbackEndpoint(environment, "LOCAL_COMMERCE_API_URL", parsedPorts.api, "/", issues),
    rpcUrl: parseLoopbackEndpoint(environment, "LOCAL_COMMERCE_RPC_URL", parsedPorts.api, "/", issues),
    storageUrl: parseLoopbackEndpoint(
      environment,
      "LOCAL_COMMERCE_STORAGE_URL",
      parsedPorts.api,
      "/storage/v1",
      issues,
    ),
    imageHelperUrl: parseLoopbackEndpoint(
      environment,
      "LOCAL_COMMERCE_IMAGE_HELPER_URL",
      parsedPorts.imageHelper,
      "/",
      issues,
    ),
  };

  if (issues.length > 0) {
    return { status: "invalid", config: null, issues };
  }

  return {
    status: "ready",
    config: {
      environment: environmentName as LocalCommerceEnvironmentName,
      projectKind: projectKind as LocalCommerceProjectKind,
      projectId: projectId as string,
      runId: runId as string,
      postgresMajorVersion: Number(postgresVersion),
      ports: parsedPorts as LocalCommercePorts,
      endpoints: endpoints as LocalCommerceEndpoints,
    },
    issues: [],
  };
}

export function auditPortPlan(ports: LocalCommercePorts, occupiedPorts: Iterable<number>): LocalCommercePortAudit {
  const entries = Object.values(ports);
  const counts = new Map<number, number>();
  for (const port of entries) counts.set(port, (counts.get(port) ?? 0) + 1);
  const duplicatePorts = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([port]) => port)
    .sort((left, right) => left - right);
  const occupied = [...new Set([...occupiedPorts].filter((port) => entries.includes(port)))].sort(
    (left, right) => left - right,
  );
  return {
    status: duplicatePorts.length === 0 && occupied.length === 0 ? "ready" : "blocked",
    occupiedPorts: occupied,
    duplicatePorts,
  };
}

export function createProjectMarker(config: LocalCommerceConfig, createdAt: string): LocalCommerceProjectMarker {
  return {
    format: LOCAL_COMMERCE_MARKER_FORMAT,
    projectId: config.projectId,
    environment: config.environment,
    projectKind: config.projectKind,
    runId: config.runId,
    schema: LOCAL_COMMERCE_SCHEMA,
    postgresMajorVersion: LOCAL_COMMERCE_POSTGRES_MAJOR_VERSION,
    createdAt,
  };
}

export function validateProjectMarker(marker: unknown, config: LocalCommerceConfig) {
  if (!marker || typeof marker !== "object") return false;
  const candidate = marker as Partial<LocalCommerceProjectMarker>;
  return (
    candidate.format === LOCAL_COMMERCE_MARKER_FORMAT &&
    candidate.projectId === config.projectId &&
    candidate.environment === config.environment &&
    candidate.projectKind === config.projectKind &&
    candidate.runId === config.runId &&
    candidate.schema === LOCAL_COMMERCE_SCHEMA &&
    candidate.postgresMajorVersion === LOCAL_COMMERCE_POSTGRES_MAJOR_VERSION &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

export function evaluateMarkerInitialization(input: {
  config: LocalCommerceConfigResult;
  existingMarker: unknown;
  confirmedNewProject: boolean;
}): LocalCommerceMarkerDecision {
  if (input.config.status !== "ready") return { status: "denied", code: "invalid_configuration" };
  if (input.existingMarker) return { status: "denied", code: "marker_already_exists" };
  if (!input.confirmedNewProject) return { status: "denied", code: "new_project_confirmation_required" };
  return { status: "allowed", code: "marker_initialization_allowed" };
}

export function evaluateDestructiveReset(input: {
  config: LocalCommerceConfig | null;
  marker: unknown;
  currentRunId: string | undefined;
  allowDisposableReset: boolean;
  confirmedDisposableTarget: boolean;
}): LocalCommerceResetDecision {
  if (!input.config) return { status: "denied", code: "invalid_configuration" };
  if (!Object.values(input.config.endpoints).every(isLoopbackUrl)) {
    return { status: "denied", code: "invalid_configuration" };
  }
  if (input.config.environment !== "test" || input.config.projectKind !== "disposable_test") {
    return { status: "denied", code: "retained_project" };
  }
  if (!input.allowDisposableReset || !input.confirmedDisposableTarget) {
    return { status: "denied", code: "disposable_confirmation_required" };
  }
  if (!input.marker) return { status: "denied", code: "marker_required" };
  if (!validateProjectMarker(input.marker, input.config)) {
    return { status: "denied", code: "marker_mismatch" };
  }
  if (input.currentRunId !== input.config.runId) return { status: "denied", code: "run_id_mismatch" };
  return { status: "allowed", code: "disposable_reset_allowed" };
}

export function summarizeLocalCommerceConfig(config: LocalCommerceConfig) {
  return {
    environment: config.environment,
    projectKind: config.projectKind,
    projectId: config.projectId,
    runId: config.runId,
    postgresMajorVersion: config.postgresMajorVersion,
    ports: config.ports,
    endpoints: config.endpoints,
  };
}
