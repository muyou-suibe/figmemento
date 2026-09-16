import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readLocalContactConfig } from "../app/config/local-contact-runtime.ts";
import { parseLocalContactMessageRequest } from "../app/domain/contact-message.ts";
import { LocalMemoryContactMessageRepository } from "../app/infrastructure/contact/local-memory-contact-message-repository.server.ts";
import { createLocalContactHttpHandler } from "../app/server/local-contact-http.server.ts";

function request(body, options = {}) {
  return new Request("http://localhost:3000/api/local-contact", {
    method: options.method ?? "POST",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function makeHandler(options = {}) {
  const repository = options.repository ?? new LocalMemoryContactMessageRepository({ nextId: () => "contact-test-1" });
  let repositoryCalls = 0;
  const handler = createLocalContactHttpHandler({
    readConfig: options.readConfig ?? (() => ({ source: "local_fake", runtimeMode: "test" })),
    getRepository: () => {
      repositoryCalls += 1;
      return repository;
    },
    createId: options.createId ?? (() => "contact-test-1"),
    now: () => "2026-09-10T00:00:00.000Z",
  });
  return { handler, repository, getRepositoryCalls: () => repositoryCalls };
}

test("valid contact message is normalized and received by the local repository", async () => {
  const value = makeHandler();
  const response = await value.handler(request({
    name: "  FigMemento visitor  ",
    email: " Person@Example.COM ",
    publicOrderReference: " FM-LOCAL-ABC123 ",
    message: "  Please tell me about this keepsake.  ",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "received" });
  assert.equal(value.repository.count(), 1);
});

test("invalid and authority-shaped contact requests do not mutate local state", async () => {
  for (const body of [
    { name: "", email: "person@example.com", message: "Hello" },
    { name: "Person", email: "not-an-email", message: "Hello" },
    { name: "Person", email: "person@example.com", message: "" },
    { name: "Person", email: "person@example.com", message: "Hello", status: "received" },
    { name: "Person", email: "person@example.com", message: "Hello", provider: "mail" },
    { name: "Person", email: "person@example.com", message: "Hello", createdAt: "now" },
  ]) {
    const value = makeHandler();
    const response = await value.handler(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid_message" });
    assert.equal(value.repository.count(), 0);
    assert.equal(value.getRepositoryCalls(), 0);
  }
});

test("same-origin and method boundaries are enforced before repository access", async () => {
  const crossOrigin = makeHandler();
  const crossOriginResponse = await crossOrigin.handler(request({ name: "Person", email: "person@example.com", message: "Hello" }, { headers: { origin: "https://attacker.test" } }));
  assert.equal(crossOriginResponse.status, 403);
  assert.equal(crossOrigin.getRepositoryCalls(), 0);

  const wrongMethod = makeHandler();
  const methodResponse = await wrongMethod.handler(request(undefined, { method: "GET" }));
  assert.equal(methodResponse.status, 405);
  assert.equal(wrongMethod.getRepositoryCalls(), 0);
});

test("local contact source is explicit and production never falls back to process memory", async () => {
  assert.deepEqual(readLocalContactConfig({ NODE_ENV: "development", LOCAL_CONTACT_SOURCE: "local_fake" }, "development"), {
    source: "local_fake",
    runtimeMode: "development",
  });
  assert.deepEqual(readLocalContactConfig({ NODE_ENV: "development" }, "development"), {
    source: "disabled",
    runtimeMode: "development",
  });
  assert.throws(
    () => readLocalContactConfig({ NODE_ENV: "production", LOCAL_CONTACT_SOURCE: "local_fake" }, "production"),
    /Local fake Contact is allowed only in development or test/,
  );

  const value = makeHandler({ readConfig: () => ({ source: "disabled", runtimeMode: "production" }) });
  const response = await value.handler(request({ name: "Person", email: "person@example.com", message: "Hello" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.equal(value.getRepositoryCalls(), 0);
});

test("contact parser is bounded and returns only server-owned normalized input", () => {
  assert.deepEqual(parseLocalContactMessageRequest({
    name: " Person ",
    email: " Person@Example.COM ",
    message: " Hello ",
  }), {
    ok: true,
    value: { name: "Person", normalizedEmail: "person@example.com", message: "Hello" },
  });
  assert.equal(parseLocalContactMessageRequest({ name: "Person", email: "person@example.com", message: "Hello", coupon: "WELCOME10" }).ok, false);
  assert.equal(parseLocalContactMessageRequest({ name: "Person", email: "person@example.com", message: "x".repeat(4001) }).ok, false);
});

test("Contact UI uses the local interactive boundary without deceptive delivery claims", async () => {
  const [page, editorial, component] = await Promise.all([
    readFile(new URL("../app/contact/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ReferenceEditorial.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ContactMessageForm.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /ContactEditorial/);
  assert.match(editorial, /<ContactMessageForm \/>/);
  assert.match(component, /onSubmit=\{submit\}/);
  assert.doesNotMatch(component, /<form[^>]*action="#"/);
  assert.match(component, /type="email"/);
  assert.match(component, /role="status"/);
  assert.match(component, /disabled=\{status === "submitting"\}/);
  assert.match(component, /No email has been sent/);
});
