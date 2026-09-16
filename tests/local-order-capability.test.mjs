import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createPersistentOrderCapabilityCodec, persistentOrderCapabilityGate,
  readPersistentOrderCapabilityCookie, boundedPersistentOrderGrantExpiry } from "../app/server/local-order-capability.server.ts";
import { submitLocalOrderWithEstablishment } from "../app/client/local-order-submit.ts";

const now = 1_800_000_000;
const env = { NODE_ENV: "test", LOCAL_ORDER_SOURCE: "local_persistent",
  LOCAL_ORDER_CAPABILITY_SECRET: "ab".repeat(32), LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600" };
const identity = { projectId: "figmemento-local-commerce-test-run-5576dfd8", markerDigest: "cd".repeat(32) };
const make = (e = env, i = identity) => createPersistentOrderCapabilityCodec(e, i);
const request = (cookie) => new Request("http://localhost:3000/api/local-orders", {
  method: "POST", headers: cookie ? { cookie } : {},
});
const cookie = token => `figmemento-local-order-access=${token}`;

test("server-issued MAC token verifies to only a digest and expiry, without identifiers", async () => {
  const codec = await make();
  const token = await codec.issue(now);
  assert.match(token, /^v1_[0-9]+_[0-9]+_[0-9a-f]{64}_[0-9a-f]{64}$/);
  assert.ok(token.length <= 200);
  const verified = await codec.verify(token, now);
  assert.equal(verified.digest, createHash("sha256").update(token).digest("hex"));
  assert.deepEqual(Object.keys(verified), ["digest", "expiresAtSeconds"]);
  assert.equal(verified.expiresAtSeconds, now + 3600);
  assert.ok(!token.includes(identity.projectId));
  assert.notEqual(token, await codec.issue(now));
});

test("arbitrary format-valid token and tampering of every signed field reject", async () => {
  const codec = await make();
  const token = await codec.issue(now);
  const fields = token.split("_");
  const altered = fields.map((_, index) => fields.map((v, j) => index !== j ? v : j === 0 ? "v2"
    : j < 3 ? String(Number(v) + 1) : `${v.slice(0, -1)}${v.endsWith("a") ? "b" : "a"}`).join("_"));
  for (const value of ["a".repeat(64), "", undefined, ...altered]) assert.equal(await codec.verify(value, now), null);
});

test("exact expiry and future issuance reject; unchanged configuration recovers after codec reconstruction", async () => {
  const codec = await make(), token = await codec.issue(now);
  assert.ok(await codec.verify(token, now + 3599));
  assert.equal(await codec.verify(token, now + 3600), null);
  assert.equal(await codec.verify(token, now + 3601), null);
  assert.equal(await codec.verify(token, now - 1), null);
  assert.deepEqual(await (await make()).verify(token, now + 1), await codec.verify(token, now + 1));
});

test("MAC binds exact project/marker and independent signing secret", async () => {
  const token = await (await make()).issue(now);
  for (const codec of [await make(env, { ...identity, projectId: "other-project" }),
    await make(env, { ...identity, markerDigest: "ef".repeat(32) }),
    await make({ ...env, LOCAL_ORDER_CAPABILITY_SECRET: "12".repeat(32) })]) {
    assert.equal(await codec.verify(token, now), null);
  }
});

test("forbidden modes, missing independent secret or invalid explicit expiry fail closed", async () => {
  for (const NODE_ENV of ["production", "staging", "unknown", undefined]) assert.equal(await make({ ...env, NODE_ENV }), null);
  for (const LOCAL_ORDER_SOURCE of ["local_fake", "disabled", undefined]) assert.equal(await make({ ...env, LOCAL_ORDER_SOURCE }), null);
  for (const LOCAL_ORDER_CAPABILITY_TTL_SECONDS of [undefined, "0", "-1", "1.5", "Infinity", "2592001"]) {
    assert.equal(await make({ ...env, LOCAL_ORDER_CAPABILITY_TTL_SECONDS }), null);
  }
  assert.equal(await make({ ...env, LOCAL_ORDER_CAPABILITY_SECRET: undefined, PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: "ab".repeat(32) }), null);
});

test("establishment is empty 204, HttpOnly/no-store, with no business continuation", async () => {
  const codec = await make();
  const result = await persistentOrderCapabilityGate(request(), codec, now);
  assert.equal(result.status, "established");
  assert.equal(result.response.status, 204);
  assert.equal(await result.response.text(), "");
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.match(result.response.headers.get("set-cookie"), /Max-Age=3600; HttpOnly; SameSite=Lax$/);
  assert.equal(result.response.headers.has("location"), false);
  const next = await persistentOrderCapabilityGate(request(result.response.headers.get("set-cookie").split(";")[0]), codec, now);
  assert.equal(next.status, "verified");
  assert.equal("response" in next, false); // No reissue / rotation.
});

test("lost establishment response safely repeats without persistence; delivered cookie proceeds", async () => {
  const codec = await make();
  const lost = await persistentOrderCapabilityGate(request(), codec, now);
  const retry = await persistentOrderCapabilityGate(request(), codec, now);
  assert.equal(lost.status, "established");
  assert.equal(retry.status, "established");
  assert.notEqual(lost.response.headers.get("set-cookie"), retry.response.headers.get("set-cookie"));
  const saved = retry.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await persistentOrderCapabilityGate(request(saved), await make(), now + 1)).status, "verified");
});

test("forged/expired/duplicate cookie is replaced, and new digest cannot equal old grant", async () => {
  const codec = await make(), original = await codec.issue(now);
  const oldDigest = (await codec.verify(original, now)).digest;
  for (const header of [cookie("x".repeat(32)), `${cookie(original)}; ${cookie(original)}`]) {
    const result = await persistentOrderCapabilityGate(request(header), codec, now);
    assert.equal(result.status, "established");
    const next = readPersistentOrderCapabilityCookie(request(result.response.headers.get("set-cookie").split(";")[0]));
    assert.notEqual((await codec.verify(next, now)).digest, oldDigest);
  }
  assert.equal((await persistentOrderCapabilityGate(request(cookie(original)), codec, now + 3600)).status, "established");
});

test("grant expiry bounded by capability and fresh guest/member authority without extension", async () => {
  const codec = await make(), original = await codec.issue(now), cap = await codec.verify(original, now);
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now + 30, now), new Date((now + 30) * 1000).toISOString());
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now + 30.125, now), new Date((now + 30) * 1000 + 125).toISOString());
  for (const expiry of [NaN, Infinity, -Infinity]) assert.equal(boundedPersistentOrderGrantExpiry(cap, expiry, now), null);
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now + 7200, now), new Date((now + 3600) * 1000).toISOString());
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now, now), null);
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now - 1, now), null);
  assert.equal(boundedPersistentOrderGrantExpiry(cap, now + 7200, now + 3600), null);
  assert.equal(boundedPersistentOrderGrantExpiry({ digest: cap.digest, expiresAtSeconds: cap.expiresAtSeconds }, now + 7200, now), null);
});

test("client resubmits exact serialized attempt once, never reads a cookie/token", async () => {
  const body = JSON.stringify({ creationAttemptId: "attempt-a", email: "synthetic@example.test" });
  const calls = [];
  const response = await submitLocalOrderWithEstablishment(body, async (init) => {
    calls.push({ ...init });
    return calls.length === 1 ? new Response(null, { status: 204 }) : Response.json({ status: "created" });
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].body, body);
  assert.equal(calls[1].credentials, "same-origin");
});

test("second establishment stops; transport failure does not trigger retry-until-pass", async () => {
  let calls = 0;
  assert.equal((await submitLocalOrderWithEstablishment("{}", async () => { calls++; return new Response(null, { status: 204 }); })).status, 204);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(submitLocalOrderWithEstablishment("{}", async () => { calls++; throw new Error("response lost"); }));
  assert.equal(calls, 1);
});

test("normal fake success and bounded failures are returned with one unchanged request", async () => {
  for (const status of [200, 400, 409, 503]) {
    let calls = 0;
    const response = new Response("{}", { status });
    assert.equal(await submitLocalOrderWithEstablishment("{}", async () => { calls++; return response; }), response);
    assert.equal(calls, 1);
  }
});
