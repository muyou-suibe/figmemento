import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { createProductCustomizationDraft } from "../app/domain/product-customization-draft.ts";
import { toPublicProductAssetViews } from "../app/application/catalog-assets.ts";

const productId = "guidance-product";
const field = { id: "guidance-photo", productId, code: "photo", label: "Reference photo",
  kind: "image", required: true, isActive: true, position: 0, configurationRevision: "1",
  constraints: { allowedMimeTypes: ["image/jpeg", "image/png"], maxBytes: 2_000_000,
    minDimensions: { width: 600, height: 600 }, recommendedDimensions: { width: 1200, height: 1200 },
    minImageCount: 1, maxImageCount: 3, cropEnabled: true, helpText: "Choose a well-lit portrait." } };
const asset = (id, overrides = {}) => ({ id, productId, mediaType: "image", role: "example", position: 0,
  visibility: "public", source: { kind: "url", value: `https://example.test/${id}.jpg` },
  altText: `Example ${id}`, ...overrides });

test("N08 image guidance is a bounded Catalog field fact, not browser text", () => {
  assert.equal(parseCustomizationField(field).ok, true);
  for (const helpText of ["", "\u0000unsafe", "a".repeat(241)]) {
    assert.equal(parseCustomizationField({ ...field, constraints: { ...field.constraints, helpText } }).ok, false);
  }
});

test("N08 PDP renders field requirements and only Product-owned public example assets", async () => {
  const server = await createServer({ root: process.cwd(), configFile: false, appType: "custom",
    customLogger: { hasWarned: false, info() {}, warn() {}, warnOnce() {}, error() {}, clearScreen() {} },
    server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const { ProductCustomizationFormShell } = await server.ssrLoadModule("/app/storefront/ProductCustomizationFormShell.tsx");
    const assets = toPublicProductAssetViews(productId, "Example Product", [
      asset("allowed"),
      asset("foreign", { productId: "other-product" }),
      asset("private", { visibility: "private" }),
      asset("gallery", { role: "gallery" }),
      asset("reference", { source: { kind: "public_reference", value: "public:reference" } }),
    ]);
    const render = (exampleAssets) => renderToStaticMarkup(createElement(ProductCustomizationFormShell, {
      configurationRevision: "1", fields: [field],
      draft: createProductCustomizationDraft({ productId, configurationRevision: "1" }),
      onDraftAction() {}, exampleAssets,
    }));
    const html = render(assets);
    for (const token of ["JPEG, PNG", "1953.1", "600 × 600", "1200 × 1200", "1–3", "Choose a well-lit portrait.", "Example allowed"]) {
      assert.ok(html.includes(token), token);
    }
    assert.match(html, /aria-label="Example images"/);
    assert.match(html, /alt="Example allowed"/);
    for (const forbidden of ["foreign.jpg", "private.jpg", "reference.jpg", "gallery.jpg"]) assert.ok(!html.includes(forbidden));
    assert.ok(!render([]).includes("Example images"));
    const literalMarkup = renderToStaticMarkup(createElement(ProductCustomizationFormShell, {
      configurationRevision: "1", fields: [{ ...field, constraints: { ...field.constraints, helpText: "<b>literal</b>" } }],
      draft: createProductCustomizationDraft({ productId, configurationRevision: "1" }), onDraftAction() {},
    }));
    assert.ok(literalMarkup.includes("&lt;b&gt;literal&lt;/b&gt;"));
    assert.ok(!literalMarkup.includes("<b>literal</b>"));
  } finally { await server.close(); }
});

test("N08 guidance CSS has bounded mobile grid and width", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/storefront/catalog-storefront.module.css", import.meta.url), "utf8");
  assert.match(css, /\.customizationExamples\s*\{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 150px\), 1fr\)\)/s);
  assert.match(css, /\.customizationExamples img\s*\{[^}]*width: 100%/s);
});
