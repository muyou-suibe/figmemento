import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processLocalImage, MAX_IMAGE_PIXELS } from "../local/commerce/image-helper/processor.mjs";
import { createLocalImageHelper } from "../local/commerce/image-helper/server.mjs";
import { readBoundedSingleImage, processLocalCommerceImage } from "../app/server/local-commerce-image-processing.server.ts";
import { catalogTestEnvironment } from "./fixtures/local-persistent-catalog.mjs";

const policy = { allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 1024 * 1024,
  minDimensions: { width: 1, height: 1 }, cropEnabled: true };
const image = (format = "png") => sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } })[format]().toBuffer();
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function upload(files, extra = []) {
  const form = new FormData();
  for (const bytes of files) form.append("file", new File([bytes], "candidate.jpg", { type: "image/jpeg" }));
  for (const [key, value] of extra) form.append(key, value);
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}

test("real JPEG/PNG/WebP decode; detected MIME and byte length rather than a filename/claim", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const bytes = await image(format);
    const result = await processLocalImage(bytes, policy);
    assert.equal(result.status, "processed");
    assert.equal(result.contentType, `image/${format}`);
    assert.equal(result.byteSize, bytes.length);
    assert.deepEqual(result.dimensions, { width: 8, height: 6 });
  }
});

test("real full decode rejects corrupt/truncated/header-only images, HTML and SVG", async () => {
  const png = await image();
  for (const bytes of [Buffer.from("<svg/>"), Buffer.from("<html/>"), png.subarray(0, 33), png.subarray(0, png.length - 25)]) {
    assert.equal((await processLocalImage(bytes, policy)).status, "rejected");
  }
});

test("authoritative MIME, byte, dimension and decompression pixel ceilings", async () => {
  const bytes = await image();
  for (const patch of [{ allowedMimeTypes: ["image/jpeg"] }, { maxBytes: bytes.length - 1 },
    { minDimensions: { width: 9, height: 6 } }]) {
    assert.equal((await processLocalImage(bytes, { ...policy, ...patch })).status, "rejected");
  }
  const bomb = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  assert.ok(4001 * 4000 > MAX_IMAGE_PIXELS && bomb.length < policy.maxBytes);
  assert.equal((await processLocalImage(bomb, policy)).status, "rejected");
});

test("bounded single-file multipart; independent requests do not accumulate field receipt counts", async () => {
  const bytes = await image();
  for (let i = 0; i < 3; i++) assert.ok(await readBoundedSingleImage(upload([bytes]), policy.maxBytes));
  assert.equal(await readBoundedSingleImage(upload([bytes, bytes]), policy.maxBytes), null);
  assert.equal(await readBoundedSingleImage(upload([bytes], [["imageCount", "1"]]), policy.maxBytes), null);
  assert.equal(await readBoundedSingleImage(upload([bytes], [["ownerId", "forged"]]), policy.maxBytes), null);
  assert.equal(await readBoundedSingleImage(upload([bytes]), bytes.length - 1), null);
});

test("chunked and falsely small length cannot bypass pre-materialization body cap", async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/api/uploads", { method: "POST", duplex: "half", body,
    headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "1" } });
  assert.equal(await readBoundedSingleImage(request, 10), null);
  assert.equal(cancelled, true);
});

test("oriented crop pixels match upright editor coordinates; source digest never changes", async () => {
  // Six individually identifiable pixels, followed by all EXIF orientations.
  const raw = Buffer.from([255,0,0, 0,255,0, 0,0,255, 255,255,0, 255,0,255, 0,255,255]);
  for (let orientation = 1; orientation <= 8; orientation++) {
    const bytes = await sharp(raw, { raw: { width: 3, height: 2, channels: 3 } }).withMetadata({ orientation }).png().toBuffer();
    const before = digest(bytes);
    const upright = await sharp(bytes).autoOrient().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const crop = { x: 0, y: 0, width: 1 / upright.info.width, height: 1 / upright.info.height };
    const result = await processLocalImage(bytes, { ...policy, crop });
    assert.equal(result.status, "processed");
    assert.deepEqual(result.outputDimensions, { width: 1, height: 1 });
    const actual = await sharp(result.png).ensureAlpha().raw().toBuffer();
    assert.deepEqual(actual, upright.data.subarray(0, 4));
    assert.equal(digest(bytes), before);
  }
});

test("invalid crop and browser dimensions/canvas/path claims cannot replace confirmed pixels", async () => {
  const bytes = await image();
  const prior = await processLocalImage(bytes, policy);
  const before = digest(prior.png);
  for (const crop of [{ x: -1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 },
    { x: 0.8, y: 0, width: 0.5, height: 1 }, { x: Infinity, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: NaN, height: 1 }]) {
    assert.equal((await processLocalImage(bytes, { ...policy, crop })).status, "rejected");
  }
  for (const extra of [{ url: "https://example.invalid/image" }, { path: "/etc/passwd" },
    { dimensions: { width: 8, height: 6 } }, { canvas: bytes.toString("base64") }, { imageCount: 1 }]) {
    assert.equal((await processLocalImage(bytes, { ...policy, ...extra })).status, "rejected");
  }
  assert.equal((await processLocalImage(bytes, { ...policy, cropEnabled: false, crop: { x: 0, y: 0, width: 1, height: 1 } })).status, "rejected");
  assert.equal(digest(prior.png), before);
});

test("helper mode/credential configuration rejects before listen", () => {
  const valid = catalogTestEnvironment({ LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url") });
  for (const mode of ["production", "staging", "unknown"]) {
    // Keep credentials valid: rejection must exercise the environment boundary.
    assert.throws(() => createLocalImageHelper({ ...valid, NODE_ENV: mode }));
  }
  for (const patch of [{ LOCAL_COMMERCE_IMAGE_HELPER_URL: "https://example.invalid" },
    { LOCAL_COMMERCE_MARKER_DIGEST: "bad" }, { LOCAL_COMMERCE_PROJECT_ID: "other-project" }]) {
    assert.throws(() => createLocalImageHelper({ ...valid, ...patch }));
  }
  assert.throws(() => createLocalImageHelper(catalogTestEnvironment()));
});

test("application client rejects unsafe sources without a database/helper/network call", async () => {
  const bytes = await image();
  for (const patch of [{ NODE_ENV: "production" }, { NODE_ENV: "staging" }, { NODE_ENV: "unknown" },
    { LOCAL_COMMERCE_IMAGE_HELPER_URL: "https://example.invalid" }, { CUSTOMER_UPLOAD_SOURCE: "local_fake" },
    { PHOTOGIFT_PRODUCT_SOURCE: "fixture" }]) {
    const result = await processLocalCommerceImage(catalogTestEnvironment({ CUSTOMER_AUTH_SOURCE: "local_persistent",
      CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"), ...patch }), bytes, policy);
    assert.equal(result.status, "unavailable");
  }
});

// Real loopback HTTP, no Supabase/DB: kept separate from pixel/unit evidence.
test("real helper HTTP rejects browser/project/credential/path injection and processes exact service request", async (t) => {
  const secret = randomBytes(32).toString("base64url");
  const env = catalogTestEnvironment({ LOCAL_COMMERCE_IMAGE_HELPER_SECRET: secret,
    LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55595", LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55595" });
  const { server, port } = createLocalImageHelper(env);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const bytes = await image();
  const headers = { "content-type": "application/octet-stream", authorization: `Bearer ${secret}`,
    "x-commerce-project": env.LOCAL_COMMERCE_PROJECT_ID, "x-commerce-marker": env.LOCAL_COMMERCE_MARKER_DIGEST,
    "x-image-policy": JSON.stringify(policy) };
  for (const patch of [{ authorization: "Bearer wrong" }, { "x-commerce-project": "wrong" },
    { "x-commerce-marker": "wrong" }, { origin: "http://localhost" }, { "sec-fetch-site": "same-origin" },
    { "content-type": "image/png" }]) {
    const response = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, { method: "POST", headers: { ...headers, ...patch }, body: bytes });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  }
  // fetch may replace Host; use the wire-level client to actually send it.
  const wrongHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, {
      method: "POST", headers: { ...headers, host: "other.localhost:55595" },
    }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
    request.on("error", reject); request.end(bytes);
  });
  assert.equal(wrongHost, 403);
  const response = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, { method: "POST", headers, body: bytes });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "processed");
  const injected = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, { method: "POST",
    headers: { ...headers, "x-image-policy": JSON.stringify({ ...policy, path: "/private/file" }) }, body: bytes });
  assert.equal(injected.status, 400);
  for (const value of ["not-json", " ".repeat(2049), JSON.stringify({ ...policy, url: "https://example.invalid/private" })]) {
    const invalidPolicy = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, { method: "POST",
      headers: { ...headers, "x-image-policy": value }, body: bytes });
    assert.equal(invalidPolicy.status, 400);
    assert.deepEqual(await invalidPolicy.json(), { status: "rejected" });
  }
  for (const path of ["/process?url=https://example.invalid/image", "/commerce", "/process/../database"]) {
    const invalidPath = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}${path}`, { method: "POST", headers, body: bytes });
    assert.equal(invalidPath.status, 403);
  }
  const wrongMethod = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, { method: "GET", headers });
  assert.equal(wrongMethod.status, 403);
});

test("standalone helper runs in a separate Node process and returns only processed pixels", async () => {
  const secret = randomBytes(32).toString("base64url");
  const env = catalogTestEnvironment({ LOCAL_COMMERCE_IMAGE_HELPER_SECRET: secret,
    LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55597", LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55597" });
  const child = spawn(process.execPath, [fileURLToPath(new URL("../local/commerce/image-helper/server.mjs", import.meta.url))], {
    env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { errors += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Helper startup timeout")), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Helper exited before request")); });
      child.stdout.on("data", () => {
        if (output.includes("Local development/test image helper ready.")) { clearTimeout(timer); resolve(); }
      });
    });
    assert.ok(child.pid && child.pid !== process.pid);
    const bytes = await image();
    const response = await fetch(`${env.LOCAL_COMMERCE_IMAGE_HELPER_URL}/process`, {
      method: "POST", body: bytes, signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/octet-stream", authorization: `Bearer ${secret}`,
        "x-commerce-project": env.LOCAL_COMMERCE_PROJECT_ID, "x-commerce-marker": env.LOCAL_COMMERCE_MARKER_DIGEST,
        "x-image-policy": JSON.stringify(policy) },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "processed");
    assert.deepEqual(result.outputDimensions, { width: 8, height: 6 });
    assert.deepEqual(Object.keys(result).sort(), ["byteSize", "contentType", "dimensions", "outputDimensions", "png", "status"].sort());
    assert.equal((await sharp(Buffer.from(result.png, "base64")).metadata()).format, "png");
    assert.equal(output.includes(secret), false);
    assert.equal(errors.includes(secret), false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
    }
  }
});
