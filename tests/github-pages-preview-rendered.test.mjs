import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const artifactRoot = new URL("../dist/github-pages-preview/", import.meta.url);

test("generated preview includes the required rendered surface markers", async () => {
  const assetNames = await readdir(new URL("assets/", artifactRoot));
  const javascript = (await Promise.all(assetNames.filter((name) => name.endsWith(".js")).map((name) => readFile(new URL(`assets/${name}`, artifactRoot), "utf8")))).join("\n");
  for (const marker of [
    "FRONTEND PREVIEW",
    "The FigMemento collection",
    "Your little collection.",
    "Checkout Demo",
    "Paid — Demo",
    "Demo Order Success",
    "From a first look to a finished keepsake.",
    "UI PREVIEW ONLY",
    "Tracking is not implemented",
  ]) {
    assert.match(javascript, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
  }
});

test("generated preview includes desktop/mobile rendered layout guards", async () => {
  const styleNames = await readdir(new URL("assets/", artifactRoot));
  const styles = (await Promise.all(styleNames.filter((name) => name.endsWith(".css")).map((name) => readFile(new URL(`assets/${name}`, artifactRoot), "utf8")))).join("\n");
  assert.match(styles, /@media\s*\((?:max-width:\s*480px|width<=480px)\)/);
  assert.match(styles, /@media\s*\((?:max-width:\s*760px|width<=760px)\)/);
  assert.match(styles, /\.preview-form-grid/);
  assert.match(styles, /\.preview-demo-form[^{}]*\.preview-button/);
  assert.match(styles, /\.preview-upload-field img/);
  assert.match(styles, /\.preview-shell/);
});
