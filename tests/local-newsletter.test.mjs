import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseLocalNewsletterRequest,
} from "../app/domain/newsletter-subscription.ts";
import {
  readLocalNewsletterConfig,
} from "../app/config/local-newsletter-runtime.ts";
import { LocalMemoryNewsletterSubscriptionRepository } from "../app/infrastructure/newsletter/local-memory-newsletter-repository.server.ts";
import { createLocalNewsletterHttpHandler } from "../app/server/local-newsletter-http.server.ts";

function request(body, options = {}) {
  return new Request("http://localhost:3000/api/local-newsletter", {
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
  const repository = options.repository ?? new LocalMemoryNewsletterSubscriptionRepository({
    nextId: () => "newsletter-test-1",
  });
  let repositoryCalls = 0;
  const handler = createLocalNewsletterHttpHandler({
    readConfig: options.readConfig ?? (() => ({ source: "local_fake", runtimeMode: "test" })),
    getRepository: () => {
      repositoryCalls += 1;
      return repository;
    },
    now: () => "2026-09-10T00:00:00.000Z",
  });
  return { handler, repository, getRepositoryCalls: () => repositoryCalls };
}

test("newsletter request normalizes email and creates one local subscription", async () => {
  const value = makeHandler();
  const response = await value.handler(request({ email: " Test@Example.COM " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "subscribed" });
  assert.equal(value.repository.count(), 1);
  const record = value.repository.subscribe({ normalizedEmail: "test@example.com", now: "2026-09-10T00:00:00.000Z" });
  assert.equal(record.status, "already_subscribed");
  assert.deepEqual(record.value, {
    id: "newsletter-test-1",
    email: "test@example.com",
    normalizedEmail: "test@example.com",
    status: "subscribed",
    createdAt: "2026-09-10T00:00:00.000Z",
  });
});

test("duplicate normalized email returns already_subscribed without a second record", async () => {
  const value = makeHandler();
  const first = await value.handler(request({ email: "person@example.com" }));
  const second = await value.handler(request({ email: " PERSON@EXAMPLE.COM " }));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { status: "already_subscribed" });
  assert.equal(value.repository.count(), 1);
});

test("invalid email and browser authority fields are rejected without mutation", async () => {
  for (const body of [
    { email: "" },
    { email: "not-an-email" },
    { email: "a".repeat(255) + "@example.com" },
    { email: "valid@example.com", status: "subscribed" },
    { email: "valid@example.com", createdAt: "2026-09-10" },
    { email: "valid@example.com", subscriptionId: "browser-id" },
    { email: "valid@example.com", discount: 100 },
    { email: "valid@example.com", coupon: "WELCOME10" },
    { email: "valid@example.com", provider: "mailchimp" },
  ]) {
    const value = makeHandler();
    const response = await value.handler(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid_email" });
    assert.equal(value.repository.count(), 0);
    assert.equal(value.getRepositoryCalls(), 0);
  }
});

test("same-origin and method boundaries are enforced", async () => {
  const crossOrigin = makeHandler();
  const response = await crossOrigin.handler(request({ email: "valid@example.com" }, { headers: { origin: "https://attacker.test" } }));
  assert.equal(response.status, 403);
  assert.equal(crossOrigin.getRepositoryCalls(), 0);

  const wrongMethod = makeHandler();
  const methodResponse = await wrongMethod.handler(request(undefined, { method: "GET" }));
  assert.equal(methodResponse.status, 405);
  assert.equal(wrongMethod.getRepositoryCalls(), 0);
});

test("production never uses the local process-memory repository", async () => {
  assert.deepEqual(readLocalNewsletterConfig({ NODE_ENV: "development", LOCAL_NEWSLETTER_SOURCE: "local_fake" }, "development"), {
    source: "local_fake",
    runtimeMode: "development",
  });
  assert.deepEqual(readLocalNewsletterConfig({ NODE_ENV: "development" }, "development"), {
    source: "disabled",
    runtimeMode: "development",
  });
  assert.throws(
    () => readLocalNewsletterConfig({ NODE_ENV: "production", LOCAL_NEWSLETTER_SOURCE: "local_fake" }, "production"),
    /Local fake Newsletter is allowed only in development or test/,
  );

  let repositoryCalls = 0;
  const value = makeHandler({
    readConfig: () => ({ source: "disabled", runtimeMode: "production" }),
  });
  const response = await value.handler(request({ email: "valid@example.com" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.equal(value.getRepositoryCalls(), repositoryCalls);
});

test("domain parser is bounded and returns only normalized server-owned input", () => {
  assert.deepEqual(parseLocalNewsletterRequest({ email: " Test@Example.COM " }), {
    ok: true,
    value: { email: "test@example.com", normalizedEmail: "test@example.com" },
  });
  assert.equal(parseLocalNewsletterRequest({ email: "valid@example.com", coupon: "WELCOME10" }).ok, false);
});

test("Home uses the interactive newsletter component and accessible feedback", async () => {
  const [home, component] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/NewsletterSignup.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<NewsletterSignup \/>/);
  assert.doesNotMatch(home, /Newsletter signup preview/);
  assert.match(component, /<input[\s\S]*type="email"/);
  assert.match(component, /onSubmit=\{submit\}/);
  assert.match(component, /role="status"/);
  assert.doesNotMatch(component, /<input\b[^>]*\bdisabled\b/);
  assert.match(component, /disabled=\{status === "submitting"\}/);
  assert.match(component, /No marketing email or coupon is sent/);
});
