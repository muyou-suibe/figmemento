import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createClarityCorpus } from "./fixtures/photo-clarity-corpus.mjs";
import { processLocalImage } from "../local/commerce/image-helper/processor.mjs";
import { measureImageClarity, classifyImageClarity, CLARITY_PROFILE, CLARITY_PROFILE_VERSION } from "../local/commerce/image-helper/quality.mjs";
import { UNACTIVATED_IMAGE_MODEL_GUIDANCE } from "../app/domain/customer-image-clarity.ts";
import { uploadCustomerCustomizationImage } from "../app/client/customer-customization-image-upload.ts";

const policy = { allowedMimeTypes: ["image/jpeg"], maxBytes: 2_000_000,
  minDimensions: { width: 1, height: 1 }, cropEnabled: true, inspectClarity: true };

test("C20 real decoded-byte corpus separates calibrated sharp/soft/strong controls conservatively", async () => {
  const measurements = {};
  for (const entry of await createClarityCorpus()) {
    const decoded = await sharp(entry.bytes).autoOrient().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const measured = await measureImageClarity(decoded.data, decoded.info.width, decoded.info.height, decoded.info.channels);
    measurements[entry.name] = measured;
    assert.equal(classifyImageClarity(measured), entry.expected, entry.name);
    const processed = await processLocalImage(entry.bytes, policy);
    assert.equal(processed.status, "processed", entry.name);
    assert.deepEqual(processed.clarity, { profileVersion: CLARITY_PROFILE_VERSION, state: entry.expected }, entry.name);
    assert.ok(measured.width <= 256 && measured.height <= 256);
  }
  const ratio = (name) => measurements[name].laplacian / measurements[name].gradient;
  assert.ok(Math.max(ratio("mild_defocus"), ratio("mild_stripes"), ratio("mild_portrait")) < CLARITY_PROFILE.softRatio);
  assert.ok(CLARITY_PROFILE.softRatio < Math.min(ratio("sharp_detail"), ratio("sharp_stripes"), ratio("sharp_portrait")));
  assert.ok(Math.max(ratio("severe_defocus"), ratio("motion_blur")) < CLARITY_PROFILE.strongRatio);
  assert.ok(CLARITY_PROFILE.strongRatio < Math.min(ratio("mild_defocus"), ratio("mild_stripes"), ratio("mild_portrait")));
  assert.ok(measurements.low_texture.gradient < CLARITY_PROFILE.minimumGradient);
  assert.ok(measurements.low_light_noise.brightness < CLARITY_PROFILE.minimumBrightness);
});

test("C21 guidance is advisory: dark/flat controls are inconclusive and valid blurry bytes still process", async () => {
  const cases = await createClarityCorpus();
  for (const name of ["mild_defocus", "severe_defocus", "motion_blur", "low_texture", "low_light_noise"]) {
    const entry = cases.find(candidate => candidate.name === name);
    const result = await processLocalImage(entry.bytes, policy);
    assert.equal(result.status, "processed");
    assert.ok(result.png.length > 0);
  }
  assert.equal((await processLocalImage(cases[0].bytes, { ...policy, inspectClarity: "clear" })).status, "rejected");
  assert.equal((await processLocalImage(cases[0].bytes, { ...policy, inspectClarity: true, fakePose: "frontal" })).status, "rejected");
});

test("C20 uses upright EXIF-normalized decoded pixels under the bounded profile", async () => {
  const sharpBytes = (await createClarityCorpus()).find(entry => entry.name === "sharp_detail").bytes;
  const tagged = await sharp(sharpBytes).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer();
  const result = await processLocalImage(tagged, policy);
  assert.equal(result.status, "processed");
  assert.deepEqual(result.dimensions, { width: 384, height: 512 });
  assert.deepEqual(result.clarity, { profileVersion: CLARITY_PROFILE_VERSION, state: "clear" });
});

test("C22/C23/C24 model contract is explicitly unactivated without inferred risk or count", () => {
  assert.deepEqual(UNACTIVATED_IMAGE_MODEL_GUIDANCE, { status: "not_activated" });
});

test("C21 browser receives only bounded advisory state/version; provider diagnostics cannot become guidance", async () => {
  const receipt = { receiptId: "receipt-clarity", contentType: "image/jpeg", byteSize: 100,
    dimensions: { width: 600, height: 600 }, createdAt: "2026-09-22T00:00:00.000Z",
    expiresAt: "2026-09-23T00:00:00.000Z", lifecycle: "active" };
  const input = { productId: "product-clarity", fieldId: "field-photo",
    file: new File([new Uint8Array([1])], "image.jpg", { type: "image/jpeg" }) };
  const valid = await uploadCustomerCustomizationImage(input, async () => Response.json({ receipt,
    clarity: { profileVersion: "local-clarity-v1", state: "soft_warning" } }, { status: 201 }));
  assert.deepEqual(valid, { status: "accepted", receipt,
    clarity: { profileVersion: "local-clarity-v1", state: "soft_warning" } });
  for (const clarity of [
    { profileVersion: "local-clarity-v1", state: "pose_risk" },
    { profileVersion: "local-clarity-v1", state: "strong_warning", score: 0.12 },
    { profileVersion: "unknown", state: "clear" },
  ]) {
    assert.deepEqual(await uploadCustomerCustomizationImage(input, async () => Response.json({ receipt, clarity }, { status: 201 })),
      { status: "malformed_success" });
  }
});
