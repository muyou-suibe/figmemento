import assert from "node:assert/strict";
import test from "node:test";
import { createLocalTrackingOperatorHttpHandler } from "../app/server/local-tracking-operator-http.server.ts";
import { LocalTrackingOperatorService } from "../app/application/local-tracking-operator-service.ts";

function serviceStub() { return new LocalTrackingOperatorService({ runtime: { configuration: { source: "local_fake", runtimeMode: "test" }, ports: {}, repository: { commit() { return { status: "unavailable", issues: [] }; }, findByOrderIdentity() { return { status: "unavailable" }; } }, now: () => "2026-08-27T00:00:00.000Z" }, verifier: undefined }); }
function request(method, body, headers = {}) { return new Request("http://localhost:3000/api/local-tracking/operator/FM-LOCAL-OPERATETESTX0001", { method, headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
function requestWithoutOrigin(method, body, fetchSite) { return new Request("http://localhost:3000/api/local-tracking/operator/FM-LOCAL-OPERATETESTX0001", { method, headers: { ...(fetchSite === undefined ? {} : { "sec-fetch-site": fetchSite }), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }

test("operator HTTP is same-origin, bounded, and does not accept browser authority", async () => {
  const handler = createLocalTrackingOperatorHttpHandler({ createService: serviceStub });
  assert.equal((await handler(request("GET"), "FM-LOCAL-OPERATETESTX0001")).status, 404);
  assert.equal((await handler(request("POST", { trackingActionId: "operator-http-0001", actionKind: "create_shipment", status: "delivered" }), "FM-LOCAL-OPERATETESTX0001")).status, 400);
  assert.equal((await handler(request("POST", { trackingActionId: "operator-http-0001", actionKind: "create_shipment" }, { origin: "https://evil.example" }), "FM-LOCAL-OPERATETESTX0001")).status, 403);
  assert.equal((await handler(request("POST", { trackingActionId: "operator-http-0001", actionKind: "create_shipment" }), "FM-LOCAL-OPERATETESTX0001")).status, 404);
});

test("operator GET accepts same-origin browser requests without Origin", async () => {
  const handler = createLocalTrackingOperatorHttpHandler({ createService: serviceStub });
  assert.equal((await handler(requestWithoutOrigin("GET", undefined, "same-origin"), "FM-LOCAL-OPERATETESTX0001")).status, 404);
  assert.equal((await handler(requestWithoutOrigin("GET"), "FM-LOCAL-OPERATETESTX0001")).status, 404);
});

test("operator GET rejects cross-site metadata and evil Origin", async () => {
  const handler = createLocalTrackingOperatorHttpHandler({ createService: serviceStub });
  assert.equal((await handler(requestWithoutOrigin("GET", undefined, "cross-site"), "FM-LOCAL-OPERATETESTX0001")).status, 403);
  assert.equal((await handler(request("GET", undefined, { origin: "https://evil.example" }), "FM-LOCAL-OPERATETESTX0001")).status, 403);
});

test("operator POST keeps strict Origin protection", async () => {
  const handler = createLocalTrackingOperatorHttpHandler({ createService: serviceStub });
  const body = { trackingActionId: "operator-http-0002", actionKind: "create_shipment" };
  assert.equal((await handler(requestWithoutOrigin("POST", body, "same-origin"), "FM-LOCAL-OPERATETESTX0001")).status, 403);
  assert.equal((await handler(request("POST", body, { origin: "https://evil.example" }), "FM-LOCAL-OPERATETESTX0001")).status, 403);
  assert.equal((await handler(request("POST", body), "FM-LOCAL-OPERATETESTX0001")).status, 404);
});
