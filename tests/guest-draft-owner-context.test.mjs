import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createGuestDraftOwnerContextCodec } from "../app/application/guest-draft-owner-context.ts";
import { ServerConfigurationError, readGuestDraftOwnerContextConfig } from "../app/config/server.ts";
import { parseCustomerUploadOwnerId } from "../app/domain/customer-upload.ts";
import {
  createGuestDraftOwnerService,
  getGuestDraftOwnerCookieName,
} from "../app/lib/guest-draft-owner.ts";

const configuration = {
  signingSecret: "offline-guest-owner-test-secret-material-1234567890",
  contextLifetimeSeconds: 3_600,
};

function deterministicDependencies(now = 1_700_000_000) {
  let next = 0;
  return {
    nowSeconds: () => now,
    randomBytes(byteLength) {
      const bytes = new Uint8Array(byteLength);
      for (let index = 0; index < byteLength; index += 1) bytes[index] = (next + index + 1) % 256;
      next += byteLength;
      return bytes;
    },
  };
}

function alterFinalCharacter(value) {
  const final = value.at(-1);
  return `${value.slice(0, -1)}${final === "A" ? "B" : "A"}`;
}

test("issues cryptographically shaped opaque owner IDs and a canonical HMAC-protected context", async () => {
  const codec = createGuestDraftOwnerContextCodec(configuration, deterministicDependencies());
  const first = await codec.issueGuestDraftOwner();
  const second = await codec.issueGuestDraftOwner();
  assert.equal(first.status, "issued");
  assert.equal(second.status, "issued");
  assert.ok(first.status === "issued" && second.status === "issued");
  assert.ok(parseCustomerUploadOwnerId(first.value.ownerId).ok);
  assert.notEqual(first.value.ownerId, second.value.ownerId);
  assert.match(first.value.ownerId, /^gdo_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.value.context.split(".").length, 5);
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(first.value.context), {
    status: "valid", ownerId: first.value.ownerId, issuedAt: 1_700_000_000, expiresAt: 1_700_003_600,
  });
});

test("rejects altered owner, altered signature, malformed segments, unknown versions, and expired contexts", async () => {
  const dependencies = deterministicDependencies();
  const codec = createGuestDraftOwnerContextCodec(configuration, dependencies);
  const issued = await codec.issueGuestDraftOwner();
  assert.ok(issued.status === "issued");
  const segments = issued.value.context.split(".");
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(`v1.gdo_altered.${segments[2]}.${segments[3]}.${segments[4]}`), { status: "invalid" });
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(alterFinalCharacter(issued.value.context)), { status: "invalid" });
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(issued.value.context.split(".").slice(0, 4).join(".")), { status: "invalid" });
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(`${issued.value.context}.extra`), { status: "invalid" });
  assert.deepEqual(await codec.verifyGuestDraftOwnerContext(issued.value.context.replace("v1.", "v2.")), { status: "invalid" });

  const expiredCodec = createGuestDraftOwnerContextCodec(configuration, deterministicDependencies(1_700_003_600));
  assert.deepEqual(await expiredCodec.verifyGuestDraftOwnerContext(issued.value.context), { status: "expired" });
});

test("separates missing, invalid, valid, and explicitly-issued owner context behavior", async () => {
  const service = createGuestDraftOwnerService(configuration, deterministicDependencies());
  assert.deepEqual(await service.verifyGuestDraftOwnerContext(null), { status: "missing" });
  assert.deepEqual(await service.verifyGuestDraftOwnerContext("malformed"), { status: "invalid" });

  const ensuredMissing = await service.ensureGuestDraftOwnerContext(null);
  assert.equal(ensuredMissing.status, "issued");
  assert.equal((await service.ensureGuestDraftOwnerContext("malformed")).status, "invalid");
  assert.ok(ensuredMissing.status === "issued");
  const ensuredExisting = await service.ensureGuestDraftOwnerContext(ensuredMissing.value.context);
  assert.equal(ensuredExisting.status, "existing");
  assert.ok(ensuredExisting.status === "existing");
  assert.equal(ensuredExisting.value.ownerId, ensuredMissing.value.ownerId);
});

test("emits a dedicated HttpOnly Lax path-root cookie and only adds Secure in production", async () => {
  const service = createGuestDraftOwnerService(configuration, deterministicDependencies());
  const issued = await service.issueGuestDraftOwner();
  assert.ok(issued.status === "issued");
  const development = service.getSetCookieHeader(issued.value.context, "development");
  const production = service.getSetCookieHeader(issued.value.context, "production");
  assert.match(development, new RegExp(`^${getGuestDraftOwnerCookieName()}=`));
  assert.match(development, /; Path=\//);
  assert.match(development, /; Max-Age=3600/);
  assert.match(development, /; HttpOnly/);
  assert.match(development, /; SameSite=Lax/);
  assert.doesNotMatch(development, /; Secure/);
  assert.match(production, /; Secure/);
  assert.notEqual(getGuestDraftOwnerCookieName(), "photogift-admin-session");
});

test("server configuration rejects missing, trivial, and invalid guest-owner settings without returning the secret", () => {
  const valid = readGuestDraftOwnerContextConfig({
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: configuration.signingSecret,
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  });
  assert.deepEqual(valid, configuration);
  for (const environment of [
    {},
    { PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: "short", PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600" },
    { PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: "a".repeat(32), PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600" },
    { PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: configuration.signingSecret, PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "0" },
    { PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: configuration.signingSecret, PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "forever" },
  ]) {
    assert.throws(
      () => readGuestDraftOwnerContextConfig(environment),
      (error) => error instanceof ServerConfigurationError && !error.message.includes(configuration.signingSecret),
    );
  }
});

async function findClientModuleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? findClientModuleFiles(path)
      : entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return children.flat();
}

test("guest owner modules remain server-only, provider-neutral, and have no browser credential/log/JSON path", async () => {
  const root = fileURLToPath(new URL("../app/", import.meta.url));
  const [codec, service, clientFiles] = await Promise.all([
    readFile(new URL("../app/application/guest-draft-owner-context.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/guest-draft-owner.ts", import.meta.url), "utf8"),
    findClientModuleFiles(root),
  ]);
  const clientSources = await Promise.all(clientFiles.map(async (path) => ({ path, source: await readFile(path, "utf8") })));
  for (const { path, source } of clientSources.filter((entry) => /^\s*["']use client["']/.test(entry.source))) {
    assert.doesNotMatch(source, /guest-draft-owner|guest-draft-owner-context/, path);
  }
  for (const source of [codec, service]) {
    assert.doesNotMatch(source, /@supabase\/supabase-js|auth\.users|R2Bucket|S3Client|ProductAsset|localStorage|sessionStorage/);
    assert.doesNotMatch(source, /console\.(?:log|error|warn)|Response\.json|JSON\.stringify/);
  }
  assert.doesNotMatch(codec, /Math\.random|incrementing|counter/);
  assert.match(codec, /crypto\.subtle\.verify/);
});
