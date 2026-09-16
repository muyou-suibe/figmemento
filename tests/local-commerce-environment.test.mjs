import assert from "node:assert/strict";
import test from "node:test";
import {
  auditPortPlan,
  createProjectMarker,
  evaluateDestructiveReset,
  evaluateMarkerInitialization,
  readLocalCommerceConfig,
  summarizeLocalCommerceConfig,
  validateProjectMarker,
} from "../app/application/local-commerce-environment.ts";

const developmentEnvironment = {
  LOCAL_COMMERCE_ENVIRONMENT: "development",
  LOCAL_COMMERCE_PROJECT_KIND: "retained_development",
  LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce",
  LOCAL_COMMERCE_RUN_ID: "retained-development",
  LOCAL_COMMERCE_DB_MAJOR_VERSION: "17",
  LOCAL_COMMERCE_SHADOW_DB_PORT: "55420",
  LOCAL_COMMERCE_API_PORT: "55421",
  LOCAL_COMMERCE_DB_PORT: "55422",
  LOCAL_COMMERCE_STUDIO_PORT: "55423",
  LOCAL_COMMERCE_SMTP_PORT: "55424",
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55425",
  LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_RPC_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_STORAGE_URL: "http://127.0.0.1:55421/storage/v1",
  LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55425",
};

function configFrom(environment) {
  const result = readLocalCommerceConfig(environment);
  assert.equal(result.status, "ready");
  return result.config;
}

test("accepts the explicit retained development project and loopback origins", () => {
  const result = readLocalCommerceConfig(developmentEnvironment);
  assert.equal(result.status, "ready");
  assert.equal(result.config.projectId, "figmemento-local-commerce");
  assert.deepEqual(result.config.ports, {
    shadowDb: 55420,
    api: 55421,
    db: 55422,
    studio: 55423,
    smtp: 55424,
    imageHelper: 55425,
  });
});

test("rejects missing configuration and non-loopback endpoints", () => {
  const missing = readLocalCommerceConfig({});
  assert.equal(missing.status, "invalid");
  assert.ok(missing.issues.some((issue) => issue.code === "missing_required_value"));

  const remote = readLocalCommerceConfig({
    ...developmentEnvironment,
    LOCAL_COMMERCE_API_URL: "https://commerce.example.test:55421",
  });
  assert.equal(remote.status, "invalid");
  assert.ok(remote.issues.some((issue) => issue.code === "non_loopback_endpoint"));
});

test("rejects endpoint port drift and duplicate reserved ports", () => {
  const wrongPort = readLocalCommerceConfig({
    ...developmentEnvironment,
    LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55429",
  });
  assert.equal(wrongPort.status, "invalid");
  assert.ok(wrongPort.issues.some((issue) => issue.code === "endpoint_port_mismatch"));

  const duplicate = readLocalCommerceConfig({
    ...developmentEnvironment,
    LOCAL_COMMERCE_DB_PORT: "55421",
  });
  assert.equal(duplicate.status, "invalid");
  assert.ok(duplicate.issues.some((issue) => issue.code === "duplicate_port"));
});

test("reserved port preflight blocks occupied ports without selecting another port", () => {
  const config = configFrom(developmentEnvironment);
  const result = auditPortPlan(config.ports, [3000, 55422]);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.occupiedPorts, [55422]);
  assert.deepEqual(result.duplicatePorts, []);
});

test("marker initialization requires confirmation and never overwrites an existing marker", () => {
  const config = configFrom(developmentEnvironment);
  const configResult = readLocalCommerceConfig(developmentEnvironment);
  const marker = createProjectMarker(config, "2026-09-10T00:00:00.000Z");

  assert.deepEqual(evaluateMarkerInitialization({ config: configResult, existingMarker: null, confirmedNewProject: false }), {
    status: "denied",
    code: "new_project_confirmation_required",
  });
  assert.deepEqual(evaluateMarkerInitialization({ config: configResult, existingMarker: marker, confirmedNewProject: true }), {
    status: "denied",
    code: "marker_already_exists",
  });
  assert.deepEqual(evaluateMarkerInitialization({ config: configResult, existingMarker: null, confirmedNewProject: true }), {
    status: "allowed",
    code: "marker_initialization_allowed",
  });
});

test("marker validation binds the project, schema, run, and PostgreSQL version", () => {
  const config = configFrom(developmentEnvironment);
  const marker = createProjectMarker(config, "2026-09-10T00:00:00.000Z");
  assert.equal(validateProjectMarker(marker, config), true);
  assert.equal(validateProjectMarker({ ...marker, projectId: "other-project" }, config), false);
  assert.equal(validateProjectMarker({ ...marker, schema: "public" }, config), false);
});

test("disposable reset requires exact test identity, marker, and explicit confirmations", () => {
  const environment = {
    ...developmentEnvironment,
    LOCAL_COMMERCE_ENVIRONMENT: "test",
    LOCAL_COMMERCE_PROJECT_KIND: "disposable_test",
    LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce-test-run-ab12cd34",
    LOCAL_COMMERCE_RUN_ID: "run-ab12cd34",
  };
  const config = configFrom(environment);
  const marker = createProjectMarker(config, "2026-09-10T00:00:00.000Z");
  const allowed = evaluateDestructiveReset({
    config,
    marker,
    currentRunId: "run-ab12cd34",
    allowDisposableReset: true,
    confirmedDisposableTarget: true,
  });
  assert.deepEqual(allowed, { status: "allowed", code: "disposable_reset_allowed" });
});

test("reset refuses the retained development project, old run, missing marker, and label-only authorization", () => {
  const development = configFrom(developmentEnvironment);
  assert.equal(
    evaluateDestructiveReset({
      config: development,
      marker: null,
      currentRunId: "retained-development",
      allowDisposableReset: true,
      confirmedDisposableTarget: true,
    }).code,
    "retained_project",
  );

  const environment = {
    ...developmentEnvironment,
    LOCAL_COMMERCE_ENVIRONMENT: "test",
    LOCAL_COMMERCE_PROJECT_KIND: "disposable_test",
    LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce-test-run-ab12cd34",
    LOCAL_COMMERCE_RUN_ID: "run-ab12cd34",
  };
  const config = configFrom(environment);
  const marker = createProjectMarker(config, "2026-09-10T00:00:00.000Z");
  assert.equal(
    evaluateDestructiveReset({
      config,
      marker: null,
      currentRunId: "run-ab12cd34",
      allowDisposableReset: true,
      confirmedDisposableTarget: true,
    }).code,
    "marker_required",
  );
  assert.equal(
    evaluateDestructiveReset({
      config,
      marker,
      currentRunId: "run-old9999",
      allowDisposableReset: true,
      confirmedDisposableTarget: true,
    }).code,
    "run_id_mismatch",
  );
  assert.equal(
    evaluateDestructiveReset({
      config,
      marker,
      currentRunId: "run-ab12cd34",
      allowDisposableReset: true,
      confirmedDisposableTarget: false,
    }).code,
    "disposable_confirmation_required",
  );
  assert.equal(
    evaluateDestructiveReset({
      config: { ...config, endpoints: { ...config.endpoints, apiUrl: "http://commerce.example.test:55421" } },
      marker,
      currentRunId: "run-ab12cd34",
      allowDisposableReset: true,
      confirmedDisposableTarget: true,
    }).code,
    "invalid_configuration",
  );
});

test("diagnostic projection contains configuration only and no credential fields", () => {
  const config = configFrom(developmentEnvironment);
  const projection = JSON.stringify(summarizeLocalCommerceConfig(config));
  assert.doesNotMatch(projection, /secret|token|password|credential/i);
});
